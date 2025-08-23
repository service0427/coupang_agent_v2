/**
 * 간소화된 정적 트래픽 최적화 모듈
 * - 목표: 500KB 이하로 트래픽 감소
 * - 모든 최적화 항상 활성화 (고정값)
 * - 트래픽 모니터링 통합
 */

// 허용 도메인 목록
const ALLOWED_DOMAINS = [
  'coupang.com',     // 모든 *.coupang.com 서브도메인 포함
  'coupangcdn.com',  // 모든 *.coupangcdn.com 서브도메인 포함  
  'mkt.techb.kr'     // IP 체크용 (HTTPS)
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
  
  
  let allowedCount = 0;
  let blockedCount = 0;
  let isActive = true;

  // 정적 최적화 활성화 (모든 설정 하드코딩)

  await page.route('**/*', async (route) => {
    if (!isActive) {
      await route.continue();
      return;
    }

    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();
    
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