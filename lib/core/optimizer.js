/**
 * 간소화된 정적 트래픽 최적화 모듈
 * - 모든 최적화 항상 활성화 (고정값)
 * - 트래픽 모니터링 통합
 */

// 허용 도메인 목록
const ALLOWED_DOMAINS = [
  'coupang.com',     // 모든 *.coupang.com 서브도메인 포함
  'coupangcdn.com',  // 모든 *.coupangcdn.com 서브도메인 포함  
  'ipify.org'        // IP 체크용 (HTTPS)
];

// 항상 차단할 도메인들 (고정 설정)
const BLOCKED_DOMAINS = {
  'mercury.coupang.com': { blocked: true },
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

// 세션별 memberSrl 저장 (한 번 생성 후 재사용)
let sessionMemberSrl = null;

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
async function applyStaticOptimization(page, agent = null, keywordData = null, options = {}) {
  const keywordId = keywordData?.id;
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';

  // work_type이 'click'이 아닐 때만 최적화 활성화
  const workType = options.workType || null;
  let isActive = workType !== 'click';  // click이면 false (비활성화), 나머지는 true (활성화)

  let allowedCount = 0;
  let blockedCount = 0;

  // ljc.coupang.com 응답 로깅
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('ljc.coupang.com') && response.request().method() === 'POST') {
      try {
        const status = response.status();
        const headers = response.headers();
        console.log(`\n📥 [Akamai] Response ${status} ${url}`);
        console.log(`📋 [Akamai] Headers:`, JSON.stringify({
          'content-type': headers['content-type'],
          'content-length': headers['content-length'],
          'x-request-id': headers['x-request-id'],
          'x-correlation-id': headers['x-correlation-id']
        }, null, 2));

        // 응답 본문 읽기
        try {
          const body = await response.text();
          if (body) {
            try {
              const jsonBody = JSON.parse(body);
              console.log(`📄 [Akamai] Response Body:`, JSON.stringify(jsonBody, null, 2));
            } catch {
              const truncated = body.length > 500 ? body.substring(0, 500) + '...' : body;
              console.log(`📄 [Akamai] Response Body: ${truncated}`);
            }
          } else {
            console.log(`📄 [Akamai] Response Body: (empty)`);
          }
        } catch (e) {
          console.log(`📄 [Akamai] Response Body: (읽기 실패: ${e.message})`);
        }
      } catch (e) {
        // 응답 로깅 실패는 무시
      }
    }
  });

  // 최적화 활성화 여부에 따른 동작 (click: 모든 리소스 로드, 기타: 리소스 차단)

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();

    // ljc.coupang.com POST 요청 처리 (memberSrl 랜덤값 주입 + 로깅)
    if (url.includes('ljc.coupang.com') && request.method() === 'POST') {
      try {
        const postData = request.postData();
        if (postData) {
          try {
            const jsonData = JSON.parse(postData);

            // memberSrl이 빈 문자열이면 세션 memberSrl 주입
            if (jsonData.common && jsonData.common.memberSrl === '') {
              // 세션에서 처음이면 랜덤 생성, 이후는 재사용
              if (!sessionMemberSrl) {
                sessionMemberSrl = String(Math.floor(Math.random() * (30000000 - 1000000 + 1)) + 1000000);
                console.log(`🎲 [Akamai] 세션 memberSrl 생성: ${sessionMemberSrl}`);
              }
              jsonData.common.memberSrl = sessionMemberSrl;
              console.log(`\n🔍 [Akamai] POST ${url}`);
              console.log(`📦 [Akamai] Body:`, JSON.stringify(jsonData, null, 2));

              // 수정된 데이터로 요청 계속
              await route.continue({
                postData: JSON.stringify(jsonData)
              });
              return;
            } else {
              console.log(`\n🔍 [Akamai] POST ${url}`);
              console.log(`📦 [Akamai] Body:`, JSON.stringify(jsonData, null, 2));
            }
          } catch {
            // JSON이 아니면 그대로 출력 (길면 잘라서)
            console.log(`\n🔍 [Akamai] POST ${url}`);
            const truncated = postData.length > 500 ? postData.substring(0, 500) + '...' : postData;
            console.log(`📦 [Akamai] Body: ${truncated}`);
          }
        } else {
          console.log(`\n🔍 [Akamai] POST ${url}`);
        }
      } catch (e) {
        console.log(`⚠️ [Akamai] POST 데이터 읽기 실패: ${e.message}`);
      }
    }

    if (!isActive) {
      await route.continue();
      return;
    }
    
    const { allowed, silent } = isRequestAllowed(url, resourceType);
    
    if (allowed) {
      allowedCount++;
      if (!silent) {
        const domain = new URL(url).hostname;
        console.log(`✅ ${idPrefix}${domain} | ${resourceType}`);
      }
      await route.continue();
    } else {
      blockedCount++;
      if (!silent) {
        const domain = new URL(url).hostname;
        console.log(`🚫 ${idPrefix}${domain} | ${resourceType}`);
      }
      await createResponse(route, resourceType);
    }
  });

  // 최적화 해제 함수 반환
  return async () => {
    isActive = false;
    const total = allowedCount + blockedCount;
    const blockedRate = total > 0 ? ((blockedCount / total) * 100).toFixed(1) : '0.0';
    
    console.log(`📊 ${idPrefix}최적화 완료: 허용 ${allowedCount}개, 차단 ${blockedCount}개 (${blockedRate}%)`);
    
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
  BLOCKED_DOMAINS
};