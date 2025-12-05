/**
 * 간소화된 정적 트래픽 최적화 모듈
 * - 모든 최적화 항상 활성화 (고정값)
 * - 트래픽 모니터링 통합
 */

const fs = require('fs');
const path = require('path');

// 허용 도메인 목록
const ALLOWED_DOMAINS = [
  'coupang.com',     // 모든 *.coupang.com 서브도메인 포함
  'coupangcdn.com',  // 모든 *.coupangcdn.com 서브도메인 포함
  'ipify.org'        // IP 체크용 (HTTPS)
];

// 항상 차단할 도메인들 (고정 설정)
// mercury.coupang.com은 노출/클릭 트래킹 픽셀이므로 허용 필수!
const BLOCKED_DOMAINS = {
  'image*.coupangcdn.com': { blocked: true },
  'img1a.coupangcdn.com': { blocked: true },
  'thumbnail*.coupangcdn.com': { blocked: true },
  'static.coupangcdn.com': { blocked: true },
};

// 대체 응답들
const RESPONSES = {
  transparentImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  emptyJs: '/* blocked by optimizer */',
  emptyCss: '/* blocked by optimizer */'
};

// 작업별 memberSrl 저장 (allocation_key 기반)
const sessionMemberSrlMap = new Map();

// 집중 모니터링 대상 이벤트
const CRITICAL_EVENTS = ['click_search_product', 'impression_ranking', 'web_latency_track_log'];

// Akamai 이벤트 추적용 (allocation_key 기반 - 멀티쓰레드 지원)
const sessionEventsMap = new Map();

/**
 * Akamai 이벤트 CSV 기록
 */
function saveAkamaiEventLog(sessionData) {
  if (!sessionData) return;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  const logsDir = path.join(__dirname, '../../logs');
  const csvPath = path.join(logsDir, `akamai_${dateStr}.csv`);

  // 헤더 확인 및 추가
  const header = 'time,keyword,product_id,item_id,vendor_item_id,proxy,actual_ip,click_search_product,impression_ranking,web_latency_track_log\n';
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, header);
  }

  // CSV 행 생성
  const row = [
    timeStr,
    `"${(sessionData.keyword || '').replace(/"/g, '""')}"`,
    sessionData.product_id || '',
    sessionData.item_id || '',
    sessionData.vendor_item_id || '',
    (sessionData.proxy || '').replace(/^socks5:\/\//, ''),
    sessionData.actual_ip || '',
    sessionData.click_search_product || '',
    sessionData.impression_ranking || '',
    sessionData.web_latency_track_log || ''
  ].join(',') + '\n';

  fs.appendFileSync(csvPath, row);
  console.log(`[Akamai] 📊 이벤트 로그 저장: ${csvPath}`);
}

/**
 * 세션 이벤트 초기화 (allocation_key 기반)
 */
function initSessionEvents(allocationKey, keyword, productId, itemId, vendorItemId, workType, proxy) {
  sessionEventsMap.set(allocationKey, {
    keyword,
    product_id: productId,
    item_id: itemId,
    vendor_item_id: vendorItemId,
    work_type: workType,
    proxy: proxy || '',
    actual_ip: '',
    member_srl: '',  // memberSrl 추적용
    retry_count: 0,  // Akamai 실패 시 재시도 횟수
    click_search_product: '',
    impression_ranking: '',
    web_latency_track_log: ''
  });
}

/**
 * 실제 IP 설정
 */
function setActualIp(allocationKey, ip) {
  const session = sessionEventsMap.get(allocationKey);
  if (session) {
    session.actual_ip = ip || '';
  }
}

/**
 * 이벤트 결과 기록
 */
function recordEventResult(allocationKey, eventName, result) {
  if (!allocationKey) return;
  const session = sessionEventsMap.get(allocationKey);
  if (session && session[eventName] !== undefined) {
    session[eventName] = result;
  }
}

/**
 * 현재 세션 이벤트 결과 반환 (API 전송용)
 */
function getSessionEventResults(allocationKey) {
  const session = sessionEventsMap.get(allocationKey);
  if (!session) return null;
  return {
    member_srl: session.member_srl || '',
    retry_count: session.retry_count || 0,
    click_search_product: session.click_search_product || '',
    impression_ranking: session.impression_ranking || '',
    web_latency_track_log: session.web_latency_track_log || ''
  };
}

/**
 * 세션 종료 및 CSV 저장 (click 타입만)
 */
function finalizeSessionEvents(allocationKey) {
  const session = sessionEventsMap.get(allocationKey);
  if (session) {
    // work_type이 'click'인 경우만 CSV 저장
    if (session.work_type === 'click') {
      saveAkamaiEventLog(session);
    }
  }
}

/**
 * 세션 데이터 초기화 (API 전송 후 호출)
 */
function clearSessionEvents(allocationKey) {
  sessionEventsMap.delete(allocationKey);
  sessionMemberSrlMap.delete(allocationKey);  // memberSrl도 정리 (다음 사이클에서 새로 발급)
}

/**
 * Akamai 이벤트 성공 여부 확인
 * @returns {boolean} 모든 중요 이벤트가 OK인지 여부
 */
function isAkamaiEventsSuccess(allocationKey) {
  const session = sessionEventsMap.get(allocationKey);
  if (!session) return false;

  // click_search_product와 impression_ranking이 OK인지 확인
  const clickOk = session.click_search_product === 'OK';
  const impressionOk = session.impression_ranking === 'OK';

  return clickOk && impressionOk;
}

/**
 * Akamai 이벤트 초기화 (재시도용) - retry_count 증가
 */
function resetAkamaiEvents(allocationKey) {
  const session = sessionEventsMap.get(allocationKey);
  if (session) {
    session.retry_count = (session.retry_count || 0) + 1;
    session.click_search_product = '';
    session.impression_ranking = '';
    session.web_latency_track_log = '';
  }
}

// 타임스탬프 헬퍼
function getTimestamp() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 도메인 매칭 확인
 */
function findMatchingRule(domain, rules) {
  // 정확한 도메인 매칭 먼저
  if (rules[domain]) {
    return rules[domain];
  }

  // 와일드카드 매칭
  for (const [pattern, rule] of Object.entries(rules)) {
    if (pattern.includes('*')) {
      if (pattern.startsWith('*.')) {
        // *.domain.com 형식
        const baseDomain = pattern.substring(2);
        if (domain.endsWith(baseDomain)) {
          return rule;
        }
      } else {
        // prefix*.domain.com 형식
        const [prefix, ...rest] = pattern.split('*');
        const suffix = rest.join('*');
        if (domain.startsWith(prefix) && domain.endsWith(suffix)) {
          return rule;
        }
      }
    }
  }

  return null;
}

/**
 * 요청 허용 여부 확인 (고정 차단 규칙 적용)
 */
function isRequestAllowed(url, resourceType) {
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    return false;
  }

  // 1단계: 허용 도메인 확인 (정확한 매칭 또는 서브도메인)
  const isDomainAllowed = ALLOWED_DOMAINS.some(allowedDomain =>
    domain === allowedDomain || domain.endsWith('.' + allowedDomain)
  );

  if (!isDomainAllowed) {
    return { allowed: false, silent: true };
  }

  // 2단계: 차단 설정 규칙 매칭 (고정 차단 도메인들)
  const rule = findMatchingRule(domain, BLOCKED_DOMAINS);
  if (!rule) {
    // 규칙이 없는 도메인은 기본 허용
    return { allowed: true, silent: true };
  }

  // 3단계: 차단 여부 확인 (항상 차단)
  const allowed = !rule.blocked;

  return { allowed, silent: true };
}

/**
 * 대체 응답 생성
 */
async function createResponse(route, resourceType) {
  switch (resourceType) {
    case 'image':
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(RESPONSES.transparentImage.split(',')[1], 'base64')
      });
      break;
    case 'script':
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: RESPONSES.emptyJs
      });
      break;
    case 'stylesheet':
      await route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: RESPONSES.emptyCss
      });
      break;
    default:
      await route.abort();
  }
}

/**
 * 정적 최적화 적용 (메인 함수) - 모든 최적화 항상 활성
 */
async function applyStaticOptimization(page, agent = null, options = {}) {
  // 최적화 항상 활성화 (work_type 무관)
  const workType = options.workType || null;
  const allocationKey = options.allocationKey || null;  // 멀티쓰레드 세션 구분용
  let isActive = true;  // 모든 모드에서 이미지 차단 활성화

  let allowedCount = 0;
  let blockedCount = 0;

  // ljc.coupang.com 응답 모니터링 (요청 객체를 키로 사용)
  const pendingLjcRequests = new WeakMap();

  // HTTP 응답 모니터링
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('ljc.coupang.com')) {
      const request = response.request();
      const status = response.status();
      const requestData = pendingLjcRequests.get(request);
      const eventName = requestData?.eventName || 'unknown';
      if (eventName === 'unknown') {
        return;
      }
      // 중요 이벤트만 로그 출력
      if (!CRITICAL_EVENTS.includes(eventName)) {
        return;
      }
      const ts = getTimestamp();
      if (status === 200) {
        console.log(`[${ts}] ✅ [Akamai] 🎯 ${eventName} → 200 OK`);
        recordEventResult(allocationKey, eventName, 'OK');
      } else {
        console.log(`[${ts}] ❌ [Akamai] 🎯 ${eventName} → ${status}`);
        recordEventResult(allocationKey, eventName, `${status}`);
      }
    }
  });

  // 요청 실패 모니터링
  page.on('requestfailed', async (request) => {
    const url = request.url();
    if (url.includes('ljc.coupang.com')) {
      const failure = request.failure();
      const requestData = pendingLjcRequests.get(request);
      let eventName = requestData?.eventName || 'unknown';
      if (eventName === 'unknown') {
        try {
          const postData = request.postData();
          if (postData) {
            const parsed = JSON.parse(postData);
            eventName = parsed.data?.eventName || 'unknown';
          }
        } catch {}
      }
      if (eventName === 'unknown') {
        return;
      }
      // 중요 이벤트만 로그 출력
      if (!CRITICAL_EVENTS.includes(eventName)) {
        return;
      }
      const ts = getTimestamp();
      const errorText = failure?.errorText || 'failed';
      console.log(`[${ts}] ❌ [Akamai] 🎯 ${eventName} → ${errorText}`);
      recordEventResult(allocationKey, eventName, errorText);
    }
  });

  // 최적화 활성화 여부에 따른 동작 (click: 모든 리소스 로드, 기타: 리소스 차단)

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();

    // ljc.coupang.com POST 요청: memberSrl 주입 및 이벤트 모니터링
    if (url.includes('ljc.coupang.com') && request.method() === 'POST') {
      try {
        const postData = request.postData();
        if (postData) {
          const jsonData = JSON.parse(postData);
          const eventName = jsonData.data?.eventName;

          // click_search_product 이벤트일 때 memberSrl 강제 주입
          if (eventName === 'click_search_product') {
            // 작업별 memberSrl 생성 (allocation_key 기반)
            if (!sessionMemberSrlMap.has(allocationKey)) {
              sessionMemberSrlMap.set(allocationKey, Math.floor(Math.random() * 900000000) + 100000000);
            }
            const currentMemberSrl = sessionMemberSrlMap.get(allocationKey);

            // memberSrl이 없거나 빈 값이면 주입
            if (!jsonData.common?.memberSrl) {
              if (!jsonData.common) jsonData.common = {};
              jsonData.common.memberSrl = String(currentMemberSrl);

              const modifiedPostData = JSON.stringify(jsonData);
              pendingLjcRequests.set(request, { eventName, memberSrl: String(currentMemberSrl) });

              // 세션에 memberSrl 저장 (API 전송용)
              const session = sessionEventsMap.get(allocationKey);
              if (session) {
                session.member_srl = String(currentMemberSrl);
              }

              console.log(`[${getTimestamp()}] 📡 [Akamai] 🎯 ${eventName} | memberSrl: ${currentMemberSrl} (주입됨)`);

              await route.continue({ postData: modifiedPostData });
              return;
            }
          }

          // 기존 로직: 모니터링만
          const memberSrl = jsonData.common?.memberSrl || '';
          if (eventName) {
            pendingLjcRequests.set(request, { eventName, memberSrl });
            if (CRITICAL_EVENTS.includes(eventName)) {
              console.log(`[${getTimestamp()}] 📡 [Akamai] 🎯 ${eventName} | memberSrl: ${memberSrl || '(없음)'}`);
            }
          }
        }
      } catch {}
      await route.continue();
      return;
    }

    if (!isActive) {
      await route.continue();
      return;
    }

    const { allowed, silent } = isRequestAllowed(url, resourceType);

    if (allowed) {
      allowedCount++;
      await route.continue();
    } else {
      blockedCount++;
      await createResponse(route, resourceType);
    }
  });

  // 최적화 해제 함수 반환
  return async () => {
    isActive = false;
    const total = allowedCount + blockedCount;
    const blockedRate = total > 0 ? ((blockedCount / total) * 100).toFixed(1) : '0.0';

    return {
      allowedCount,
      blockedCount,
      totalRequests: total,
      stats: { blockedCount, allowedCount }
    };
  };
}

module.exports = {
  applyStaticOptimization,
  ALLOWED_DOMAINS,
  BLOCKED_DOMAINS,
  initSessionEvents,
  finalizeSessionEvents,
  setActualIp,
  getSessionEventResults,
  clearSessionEvents,
  isAkamaiEventsSuccess,
  resetAkamaiEvents
};
