/**
 * 공격적 트래픽 최적화 모듈
 * 목표: 500KB 이하로 트래픽 감소
 * 
 * 도메인 기반 리소스 필터링 시스템:
 * 1. 기본적으로 허용된 도메인의 요청도 차단
 * 2. 도메인별로 허용할 리소스 타입을 명시적으로 정의
 * 3. 허용된 리소스 중에서도 URL 패턴으로 추가 차단 가능
 */

// 필수 도메인 화이트리스트
const ESSENTIAL_DOMAINS = [
  'techb.kr',         // IP 확인용
  'coupang.com',      // 쿠팡 자체 도메인 (*.coupang.com)
  'coupangcdn.com',   // 쿠팡 CDN (*.coupangcdn.com)
];

/**
 * 도메인별 리소스 허용 규칙
 * 
 * 구조:
 * - allow: 허용할 리소스 타입 배열
 *   - '*': 모든 타입 허용
 *   - ['document', 'script', ...]: 특정 타입만 허용
 *   - []: 모든 타입 차단
 * 
 * - blockPatterns: URL에 포함된 패턴 차단 (선택사항)
 *   - allow로 허용된 리소스 중에서도 특정 패턴 차단
 *   - 예: 썸네일 이미지, 광고 스크립트 등
 * 
 * 리소스 타입:
 * - document: HTML 페이지
 * - script: JavaScript 파일
 * - stylesheet: CSS 파일
 * - image: 이미지 파일 (png, jpg, gif 등)
 * - font: 폰트 파일
 * - xhr/fetch: AJAX 요청
 * - media: 비디오/오디오
 * - websocket: 웹소켓 연결
 * - other: 기타
 */
const DOMAIN_RULES = {
  // IP 확인 도메인 - 모든 리소스 허용
  'techb.kr': {
    allow: ['*']
  },
  
  // 메인 쿠팡 도메인 - HTML, API 요청만 허용
  'www.coupang.com': {
    allow: ['document', 'xhr', 'fetch'],
    // 추후 필요시 차단 패턴 추가 가능
    // blockPatterns: ['/tracking/', '/analytics/']
  },
  
  // 추적/분석 도메인 - 모두 차단
  'mercury.coupang.com': {
    allow: []  // 빈 배열 = 모든 타입 차단
  },
  
  // 로깅/분석 API - 모두 차단
  'ljc.coupang.com': {
    allow: ['*']  // 빈 배열 = 모든 타입 차단
  },
  
  // 프론트엔드 CDN - JavaScript와 CSS만 허용
  'front.coupangcdn.com': {
    allow: ['script', 'stylesheet']
  },
  
  // 이미지 CDN - 모두 차단
  'image*.coupangcdn.com': {
    allow: []  // 빈 배열 = 모든 타입 차단
  },
  
  // 정적 리소스 CDN - 모두 차단
  'static.coupangcdn.com': {
    allow: []  // 빈 배열 = 모든 타입 차단
  },
  
  // img1a CDN - 모두 차단
  'img1a.coupangcdn.com': {
    allow: []  // 빈 배열 = 모든 타입 차단
  },
  
  // 썸네일 CDN - 모두 차단 (thumbnail1~99까지 모두 포함)
  'thumbnail*.coupangcdn.com': {
    allow: []  // 빈 배열 = 모든 타입 차단
  },
  
  // 기타 coupang.com 서브도메인 - 일단 모두 허용
  '*.coupang.com': {
    allow: ['*']
  },
  
  // 기타 coupangcdn.com 서브도메인 - 일단 모두 허용
  '*.coupangcdn.com': {
    allow: ['*']
  }
};

// 투명 이미지 (base64)
const TRANSPARENT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// 빈 JS 응답
const EMPTY_JS = '/* blocked */';

// 빈 CSS 응답
const EMPTY_CSS = '/* blocked */';

/**
 * 공격적 최적화 적용
 * @param {Page} page - Playwright 페이지 객체
 * @returns {Function} 최적화 해제 함수
 */
async function applyAggressiveOptimization(page) {
  console.log('🔍 [Optimizer] applyAggressiveOptimization 함수 호출됨');
  let blockedCount = 0;
  let allowedCount = 0;
  let isActive = true;
  
  const stats = {
    allowedRequests: [],
    blockedByDomain: new Map(),
    blockedByType: new Map(),
    essentialSize: 0,
    blockedSize: 0
  };

  console.log('🚀 공격적 트래픽 최적화 적용 중... (목표: 500KB 이하)');
  console.log('   ✅ 허용 도메인: techb.kr, *.coupang.com, *.coupangcdn.com');
  console.log('🔍 [Optimizer] page.route 설정 중...');

  await page.route('**/*', async (route) => {
    if (!isActive) {
      await route.continue();
      return;
    }

    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();
    
    // URL 파싱
    let domain = '';
    let pathname = '';
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
      pathname = urlObj.pathname;
    } catch (e) {
      // URL 파싱 실패시 차단
      blockedCount++;
      await route.abort();
      return;
    }

    // 1단계: 도메인 필터링
    const isDomainAllowed = ESSENTIAL_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
    
    // 2단계: 도메인별 규칙 확인
    let isAllowed = false;
    
    if (isDomainAllowed) {
      // 도메인별 규칙 찾기
      let rules = null;
      
      // 정확한 도메인 매칭 우선
      if (DOMAIN_RULES[domain]) {
        rules = DOMAIN_RULES[domain];
      } 
      // 와일드카드 도메인 매칭
      else {
        for (const [ruleKey, ruleValue] of Object.entries(DOMAIN_RULES)) {
          // *.domain.com 형식
          if (ruleKey.startsWith('*.')) {
            const baseDomain = ruleKey.substring(2);
            if (domain.endsWith(baseDomain)) {
              rules = ruleValue;
              break;
            }
          }
          // prefix*.domain.com 형식 (예: thumbnail*.coupangcdn.com)
          else if (ruleKey.includes('*')) {
            const [prefix, ...rest] = ruleKey.split('*');
            const suffix = rest.join('*');
            if (domain.startsWith(prefix) && domain.endsWith(suffix)) {
              rules = ruleValue;
              break;
            }
          }
        }
      }
      
      // 규칙이 있으면 처리
      if (rules) {
        // allow 체크
        if (rules.allow.includes('*') || rules.allow.includes(resourceType)) {
          isAllowed = true;
          
          // blockPatterns 체크
          if (rules.blockPatterns && rules.blockPatterns.length > 0) {
            for (const pattern of rules.blockPatterns) {
              if (url.includes(pattern)) {
                isAllowed = false;
                console.log(`🚫 패턴 차단: ${pattern} in ${url}`);
                break;
              }
            }
          }
        }
      }
    }

    // 3단계: 요청 처리
    if (isAllowed) {
      allowedCount++;
      
      // 통계 수집
      if (!stats.allowedRequests.find(r => r.url === url)) {
        stats.allowedRequests.push({
          url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
          type: resourceType,
          domain: domain
        });
      }
      
      // 허용된 요청은 로그 출력하지 않음
      
      await route.continue();
    } else {
      blockedCount++;
      
      // 도메인별 차단 통계
      if (!stats.blockedByDomain.has(domain)) {
        stats.blockedByDomain.set(domain, 0);
      }
      stats.blockedByDomain.set(domain, stats.blockedByDomain.get(domain) + 1);
      
      // 타입별 차단 통계
      if (!stats.blockedByType.has(resourceType)) {
        stats.blockedByType.set(resourceType, 0);
      }
      stats.blockedByType.set(resourceType, stats.blockedByType.get(resourceType) + 1);
      
      // 리소스 타입별 대체 응답
      if (resourceType === 'image') {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from(TRANSPARENT_IMAGE.split(',')[1], 'base64')
        });
      } else if (resourceType === 'script') {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: EMPTY_JS
        });
      } else if (resourceType === 'stylesheet') {
        await route.fulfill({
          status: 200,
          contentType: 'text/css',
          body: EMPTY_CSS
        });
      } else {
        await route.abort();
      }
      
      // 차단 로그도 출력하지 않음
    }
  });

  // 최적화 해제 함수 반환
  return () => {
    isActive = false;
    // 간소화된 통계만 출력
    console.log(`\n📊 최적화 완료: 허용 ${allowedCount}개, 차단 ${blockedCount}개 (${((blockedCount / (allowedCount + blockedCount)) * 100).toFixed(1)}%)`);
    
    return {
      allowedCount,
      blockedCount,
      stats: {
        ...stats,
        totalRequests: allowedCount + blockedCount,
        blockedCount: blockedCount,
        allowedCount: allowedCount
      }
    };
  };
}

module.exports = {
  applyAggressiveOptimization,
  ESSENTIAL_DOMAINS,
  DOMAIN_RULES
};