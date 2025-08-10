/**
 * 간소화된 DB 기반 동적 트래픽 최적화 모듈
 * - 목표: 500KB 이하로 트래픽 감소
 * - true/false 기반 4개 도메인 차단 제어
 * - 트래픽 모니터링 통합
 */

const dbServiceV2 = require('../services/db-service-v2');
const TrafficMonitor = require('./traffic-monitor');

// 허용 도메인 목록 (최종 단순화)
const ALLOWED_DOMAINS = [
  'coupang.com',     // 모든 *.coupang.com 서브도메인 포함
  'coupangcdn.com',  // 모든 *.coupangcdn.com 서브도메인 포함  
  'techb.kr'         // IP 체크용
];

// 대체 응답들
const RESPONSES = {
  transparentImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  emptyJs: '/* blocked by optimizer */',
  emptyCss: '/* blocked by optimizer */'
};

/**
 * V2 키워드 데이터에서 도메인 규칙 생성 (차단 테스트용 4개 도메인만)
 */
function buildDomainRules(keywordData) {
  // 기본값: 모두 허용 (false = 차단 안함)
  const defaultRules = {
    'mercury.coupang.com': { blocked: false },
    'image*.coupangcdn.com': { blocked: false },
    'img1a.coupangcdn.com': { blocked: false },
    'thumbnail*.coupangcdn.com': { blocked: false }
  };

  if (!keywordData) {
    return defaultRules;
  }

  // 개별 boolean 컬럼에서 차단 설정 읽기 (허브 설정 적용)
  const blockMercury = Boolean(keywordData.block_mercury);
  const blockImageCdn = Boolean(keywordData.block_image_cdn);
  const blockImg1aCdn = Boolean(keywordData.block_img1a_cdn);
  const blockThumbnailCdn = Boolean(keywordData.block_thumbnail_cdn);
  
  // 차단 테스트용 4개 도메인만 true/false 처리
  const rules = {
    'mercury.coupang.com': { 
      blocked: blockMercury 
    },
    'image*.coupangcdn.com': { 
      blocked: blockImageCdn 
    },
    'img1a.coupangcdn.com': { 
      blocked: blockImg1aCdn 
    },
    'thumbnail*.coupangcdn.com': { 
      blocked: blockThumbnailCdn 
    }
  };

  return rules;
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
 * 요청 허용 여부 확인 (단순화된 구조)
 */
function isRequestAllowed(url, resourceType, rules) {
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
    return { allowed: false, silent: false };
  }

  // 2단계: 차단 설정 규칙 매칭 (4개 테스트 도메인만)
  const rule = findMatchingRule(domain, rules);
  if (!rule) {
    // 규칙이 없는 도메인은 기본 허용 (조용히)
    return { allowed: true, silent: true };
  }

  // 3단계: 차단 여부 확인 (true = 차단, false = 허용)
  const allowed = !rule.blocked;

  return { allowed, silent: false };
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
 * 동적 최적화 적용 (메인 함수)
 */
async function applyDynamicOptimization(page, agent = null, keywordData = null, options = {}) {
  const keywordId = keywordData?.id;
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';
  
  console.log(`🔍 ${idPrefix}동적 최적화 시작`);
  
  // 트래픽 모니터 초기화
  let trafficMonitor = null;
  if (options.monitor) {
    trafficMonitor = new TrafficMonitor({
      keywordId,
      agent,
      keyword: keywordData?.keyword,
      monitor: true
    });
    await trafficMonitor.start(page);
  }
  
  // 도메인 규칙 생성
  const rules = buildDomainRules(keywordData);
  
  let allowedCount = 0;
  let blockedCount = 0;
  let isActive = true;

  // 설정 요약 출력 (차단 테스트용 4개 도메인만)
  if (keywordData) {
    console.log(`🎯 키워드: ${keywordData.keyword} (${keywordData.product_code})`);
    
    // 개별 boolean 컬럼에서 설정 읽기 (기본값: false = 허용)
    const blockMercury = keywordData.block_mercury || false;
    const blockImageCdn = keywordData.block_image_cdn || false;
    const blockImg1aCdn = keywordData.block_img1a_cdn || false;
    const blockThumbnailCdn = keywordData.block_thumbnail_cdn || false;
    
    console.log(`📝 mercury: ${blockMercury ? '🚫 차단' : '✅ 허용'}`);
    console.log(`📝 image_cdn: ${blockImageCdn ? '🚫 차단' : '✅ 허용'}`);
    console.log(`📝 img1a_cdn: ${blockImg1aCdn ? '🚫 차단' : '✅ 허용'}`);
    console.log(`📝 thumbnail_cdn: ${blockThumbnailCdn ? '🚫 차단' : '✅ 허용'}`);
    console.log(`🔄 나머지 도메인들: 무조건 허용`);
  }

  await page.route('**/*', async (route) => {
    if (!isActive) {
      await route.continue();
      return;
    }

    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();
    
    const { allowed, silent } = isRequestAllowed(url, resourceType, rules);
    
    if (allowed) {
      allowedCount++;
      if (!silent) {
        const domain = new URL(url).hostname;
        console.log(`✅ ${idPrefix}${domain} | ${resourceType}`);
      }
      await route.continue();
    } else {
      blockedCount++;
      const domain = new URL(url).hostname;
      console.log(`🚫 ${idPrefix}${domain} | ${resourceType}`);
      await createResponse(route, resourceType);
    }
  });

  // 최적화 해제 함수 반환
  return async () => {
    isActive = false;
    const total = allowedCount + blockedCount;
    const blockedRate = total > 0 ? ((blockedCount / total) * 100).toFixed(1) : '0.0';
    
    console.log(`📊 ${idPrefix}최적화 완료: 허용 ${allowedCount}개, 차단 ${blockedCount}개 (${blockedRate}%)`);
    
    // 트래픽 모니터 결과 수집
    let trafficData = null;
    if (trafficMonitor) {
      const result = await trafficMonitor.stop();
      trafficData = result?.trafficData;
      
      // v2_execution_logs 업데이트 (필요시)
      if (trafficData && keywordId) {
        await updateExecutionLogTraffic(keywordId, trafficData);
      }
    }
    
    return {
      allowedCount,
      blockedCount,
      totalRequests: total,
      stats: { blockedCount, allowedCount },
      trafficData
    };
  };
}

/**
 * v2_execution_logs에 트래픽 데이터 업데이트
 */
async function updateExecutionLogTraffic(keywordId, trafficData) {
  try {
    // 가장 최근 실행 로그 업데이트
    await dbServiceV2.updateLatestExecutionLog(keywordId, {
      total_traffic_mb: trafficData.total_traffic_mb,
      cache_hit_rate: trafficData.cache_hit_rate,
      mercury_traffic_mb: trafficData.mercury_traffic_mb,
      image_cdn_traffic_mb: trafficData.image_cdn_traffic_mb,
      img1a_cdn_traffic_mb: trafficData.img1a_cdn_traffic_mb,
      thumbnail_cdn_traffic_mb: trafficData.thumbnail_cdn_traffic_mb,
      optimization_effectiveness: trafficData.optimization_effectiveness
    });
    
    console.log(`💾 [ID:${keywordId}] 트래픽 데이터 저장 완료: ${trafficData.total_traffic_mb}MB`);
  } catch (error) {
    console.error(`❌ [ID:${keywordId}] 트래픽 데이터 저장 실패:`, error.message);
  }
}

module.exports = {
  applyDynamicOptimization,
  buildDomainRules,
  updateExecutionLogTraffic,
  ALLOWED_DOMAINS
};