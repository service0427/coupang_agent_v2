/**
 * DB 기반 동적 트래픽 최적화 모듈
 * 목표: 500KB 이하로 트래픽 감소
 * 
 * 기능:
 * 1. v1_agent_config 테이블에서 에이전트별 설정 로드
 * 2. 도메인별 리소스 허용/차단 규칙 동적 생성
 * 3. blockPatterns 지원으로 세밀한 URL 필터링
 * 4. 실시간 설정 변경으로 패턴 탐지 분석 가능
 * 
 * 사용법:
 * - DB에서 에이전트별 설정 변경 후 프로그램 재시작 없이 적용
 * - NULL 값 = 하드코딩 기본값 사용
 * - JSON 문자열 = 커스텀 설정 적용
 */

const dbService = require('../services/db-service');
const dbServiceV2 = require('../services/db-service-v2');

// 필수 도메인 화이트리스트 (변경되지 않는 공통 설정)
const ESSENTIAL_DOMAINS = [
  'techb.kr',         // IP 확인용
  'coupang.com',      // 쿠팡 자체 도메인 (*.coupang.com)
  'coupangcdn.com',   // 쿠팡 CDN (*.coupangcdn.com)
];

// 투명 이미지 (base64)
const TRANSPARENT_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// 빈 JS 응답
const EMPTY_JS = '/* blocked by optimizer_db */';

// 빈 CSS 응답
const EMPTY_CSS = '/* blocked by optimizer_db */';

/**
 * V2 키워드 데이터에서 도메인 규칙 생성
 * @param {Object} keywordData - V2 테이블의 키워드 데이터
 * @returns {Object} DOMAIN_RULES 형식의 규칙 객체
 */
function buildDomainRulesFromV2Config(keywordData) {
  // 기본 도메인 규칙 (변경되지 않는 공통 설정)
  const baseDomainRules = {
    'techb.kr': {
      allow: ['*']
    }
  };

  // V2 키워드 데이터가 없으면 기본 하드코딩 규칙 사용
  if (!keywordData || !keywordData.optimization_config) {
    return {
      ...baseDomainRules,
      'www.coupang.com': {
        allow: ['document', 'xhr', 'fetch']
      },
      'mercury.coupang.com': {
        allow: []
      },
      'ljc.coupang.com': {
        allow: []
      },
      'assets.coupangcdn.com': {
        allow: []
      },
      'front.coupangcdn.com': {
        allow: []
      },
      'image*.coupangcdn.com': {
        allow: []
      },
      'static.coupangcdn.com': {
        allow: []
      },
      'img1a.coupangcdn.com': {
        allow: []
      },
      'thumbnail*.coupangcdn.com': {
        allow: []
      },
      // 기타 와일드카드 규칙은 맨 마지막에 (낮은 우선순위)
      '*.coupang.com': {
        allow: ['*']
      },
      '*.coupangcdn.com': {
        allow: ['*']
      }
    };
  }

  // JSON 설정 파싱
  let config;
  try {
    config = typeof keywordData.optimization_config === 'string' 
      ? JSON.parse(keywordData.optimization_config) 
      : keywordData.optimization_config;
  } catch (e) {
    console.error('⚠️  optimization_config JSON 파싱 오류, 기본값 사용:', e.message);
    config = {
      coupang_main_allow: ['document', 'xhr', 'fetch'],
      mercury_allow: [],
      ljc_allow: [],
      assets_cdn_allow: [],
      front_cdn_allow: [],
      image_cdn_allow: [],
      static_cdn_allow: [],
      img1a_cdn_allow: [],
      thumbnail_cdn_allow: [],
      coupang_main_block_patterns: []
    };
  }

  // 동적 도메인 규칙 생성
  const dynamicRules = {};

  // 도메인 매핑 설정
  const domainMappings = [
    { config: 'coupang_main_allow', domain: 'www.coupang.com', defaultAllow: ['document', 'xhr', 'fetch'] },
    { config: 'mercury_allow', domain: 'mercury.coupang.com', defaultAllow: [] },
    { config: 'ljc_allow', domain: 'ljc.coupang.com', defaultAllow: [] },
    { config: 'assets_cdn_allow', domain: 'assets.coupangcdn.com', defaultAllow: [] },
    { config: 'front_cdn_allow', domain: 'front.coupangcdn.com', defaultAllow: [] },
    { config: 'image_cdn_allow', domain: 'image*.coupangcdn.com', defaultAllow: [] },
    { config: 'static_cdn_allow', domain: 'static.coupangcdn.com', defaultAllow: [] },
    { config: 'img1a_cdn_allow', domain: 'img1a.coupangcdn.com', defaultAllow: [] },
    { config: 'thumbnail_cdn_allow', domain: 'thumbnail*.coupangcdn.com', defaultAllow: [] }
  ];

  domainMappings.forEach(({ config: configKey, domain, defaultAllow }) => {
    const allowTypes = config[configKey] || defaultAllow;
    dynamicRules[domain] = { allow: allowTypes };
  });

  // www.coupang.com에 블록 패턴 추가 (있는 경우)
  if (config.coupang_main_block_patterns && config.coupang_main_block_patterns.length > 0) {
    dynamicRules['www.coupang.com'].blockPatterns = config.coupang_main_block_patterns;
  }

  // 와일드카드 규칙을 맨 마지막에 추가 (낮은 우선순위)
  const wildcardRules = {
    '*.coupang.com': {
      allow: ['*']
    },
    '*.coupangcdn.com': {
      allow: ['*']
    }
  };

  return {
    ...baseDomainRules,
    ...dynamicRules,
    ...wildcardRules  // 와일드카드 규칙을 마지막에
  };
}

/**
 * DB에서 에이전트별 도메인 규칙 생성 (V1 호환성)
 * @param {Object} agentConfig - DB에서 가져온 에이전트 설정
 * @returns {Object} DOMAIN_RULES 형식의 규칙 객체
 */
function buildDomainRulesFromConfig(agentConfig) {
  // 기본 도메인 규칙 (변경되지 않는 공통 설정)
  const baseDomainRules = {
    'techb.kr': {
      allow: ['*']
    }
  };

  // DB 설정이 없으면 기본 하드코딩 규칙 사용
  if (!agentConfig) {
    return {
      ...baseDomainRules,
      'www.coupang.com': {
        allow: ['document', 'xhr', 'fetch']
      },
      'mercury.coupang.com': {
        allow: []
      },
      'ljc.coupang.com': {
        allow: []
      },
      'assets.coupangcdn.com': {
        allow: []
      },
      'front.coupangcdn.com': {
        allow: []
      },
      'image*.coupangcdn.com': {
        allow: []
      },
      'static.coupangcdn.com': {
        allow: []
      },
      'img1a.coupangcdn.com': {
        allow: []
      },
      'thumbnail*.coupangcdn.com': {
        allow: []
      },
      // 기타 와일드카드 규칙은 맨 마지막에 (낮은 우선순위)
      '*.coupang.com': {
        allow: ['*']
      },
      '*.coupangcdn.com': {
        allow: ['*']
      }
    };
  }

  // DB 설정을 기반으로 도메인 규칙 생성
  const dynamicRules = {};

  // www.coupang.com 설정
  if (agentConfig.coupang_main_allow !== null) {
    try {
      const allowTypes = JSON.parse(agentConfig.coupang_main_allow);
      dynamicRules['www.coupang.com'] = { allow: allowTypes };
      
      // blockPatterns가 있으면 추가
      if (agentConfig.coupang_main_block_patterns) {
        const blockPatterns = JSON.parse(agentConfig.coupang_main_block_patterns);
        dynamicRules['www.coupang.com'].blockPatterns = blockPatterns;
      }
    } catch (e) {
      console.error('⚠️  coupang_main_allow JSON 파싱 오류, 기본값 사용:', e.message);
      dynamicRules['www.coupang.com'] = { allow: ['document', 'xhr', 'fetch'] };
    }
  } else {
    dynamicRules['www.coupang.com'] = { allow: ['document', 'xhr', 'fetch'] };
  }

  // 기타 도메인들 설정 (NULL이면 기본값 사용)
  const domainMappings = [
    { config: 'mercury_allow', domain: 'mercury.coupang.com', defaultAllow: [] },
    { config: 'ljc_allow', domain: 'ljc.coupang.com', defaultAllow: [] },
    { config: 'assets_cdn_allow', domain: 'assets.coupangcdn.com', defaultAllow: [] },
    { config: 'front_cdn_allow', domain: 'front.coupangcdn.com', defaultAllow: [] },
    { config: 'image_cdn_allow', domain: 'image*.coupangcdn.com', defaultAllow: [] },
    { config: 'static_cdn_allow', domain: 'static.coupangcdn.com', defaultAllow: [] },
    { config: 'img1a_cdn_allow', domain: 'img1a.coupangcdn.com', defaultAllow: [] },
    { config: 'thumbnail_cdn_allow', domain: 'thumbnail*.coupangcdn.com', defaultAllow: [] }
  ];

  domainMappings.forEach(({ config, domain, defaultAllow }) => {
    if (agentConfig[config] !== null) {
      try {
        const allowTypes = JSON.parse(agentConfig[config]);
        dynamicRules[domain] = { allow: allowTypes };
      } catch (e) {
        console.error(`⚠️  ${config} JSON 파싱 오류, 기본값 사용:`, e.message);
        dynamicRules[domain] = { allow: defaultAllow };
      }
    } else {
      dynamicRules[domain] = { allow: defaultAllow };
    }
  });

  // 와일드카드 규칙을 맨 마지막에 추가 (낮은 우선순위)
  const wildcardRules = {
    '*.coupang.com': {
      allow: ['*']
    },
    '*.coupangcdn.com': {
      allow: ['*']
    }
  };

  return {
    ...baseDomainRules,
    ...dynamicRules,
    ...wildcardRules  // 와일드카드 규칙을 마지막에
  };
}

/**
 * V2 키워드 기반 공격적 최적화 적용
 * @param {Page} page - Playwright 페이지 객체
 * @param {string} agent - 에이전트 이름 (V2 키워드 조회용)
 * @param {Object} keywordData - V2 키워드 데이터 (선택적)
 * @returns {Function} 최적화 해제 함수
 */
async function applyDynamicOptimization(page, agent = null, keywordData = null) {
  console.log('🔍 [OptimizerDB] V2 키워드 기반 동적 최적화 시작');
  
  let DOMAIN_RULES_DYNAMIC = null;
  
  // keywordData가 직접 전달된 경우
  if (keywordData) {
    console.log(`🔧 [OptimizerDB] 키워드 ${keywordData.keyword} (${keywordData.product_code}) 설정 사용`);
    DOMAIN_RULES_DYNAMIC = buildDomainRulesFromV2Config(keywordData);
  }
  // agent로 V2 키워드 조회하는 경우
  else if (agent) {
    try {
      const keywords = await dbServiceV2.getKeywordsV2({ agent: agent, limit: 1 });
      if (keywords.length > 0) {
        const firstKeyword = keywords[0];
        console.log(`🔧 [OptimizerDB] V2 에이전트 ${agent} 첫번째 키워드 설정 사용: ${firstKeyword.keyword}`);
        DOMAIN_RULES_DYNAMIC = buildDomainRulesFromV2Config(firstKeyword);
      } else {
        console.log(`⚠️  [OptimizerDB] V2 에이전트 ${agent} 키워드 없음, 기본값 사용`);
        DOMAIN_RULES_DYNAMIC = buildDomainRulesFromV2Config(null);
      }
    } catch (error) {
      console.error(`❌ [OptimizerDB] V2 키워드 로드 실패 (${agent}):`, error.message);
      DOMAIN_RULES_DYNAMIC = buildDomainRulesFromV2Config(null);
    }
  } else {
    console.log('🔧 [OptimizerDB] 에이전트 정보 없음, 기본 하드코딩 설정 사용');
    DOMAIN_RULES_DYNAMIC = buildDomainRulesFromV2Config(null);
  }

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

  console.log('🚀 DB 기반 트래픽 최적화 적용 중... (목표: 500KB 이하)');
  console.log('   ✅ 허용 도메인: techb.kr, *.coupang.com, *.coupangcdn.com');
  
  // V2 키워드 설정 요약 출력
  if (keywordData) {
    console.log(`   🎯 키워드: ${keywordData.keyword} (${keywordData.product_code})`);
    console.log(`   📝 www.coupang.com: ${keywordData.coupang_main_allow || 'DEFAULT'}`);
    console.log(`   📝 front CDN: ${keywordData.front_cdn_allow || 'DEFAULT'}`);
    console.log(`   📝 image CDN: ${keywordData.image_cdn_allow || 'DEFAULT'}`);
    if (keywordData.coupang_main_block_patterns) {
      console.log(`   🚫 blockPatterns: ${keywordData.coupang_main_block_patterns}`);
    }
  }
  
  console.log('🔍 [OptimizerDB] page.route 설정 중...');

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
      if (DOMAIN_RULES_DYNAMIC[domain]) {
        rules = DOMAIN_RULES_DYNAMIC[domain];
      } 
      // 와일드카드 도메인 매칭 (구체적인 패턴부터 확인)
      else {
        // 1차: prefix*.domain.com 형식 먼저 확인 (더 구체적)
        for (const [ruleKey, ruleValue] of Object.entries(DOMAIN_RULES_DYNAMIC)) {
          if (ruleKey.includes('*') && !ruleKey.startsWith('*.')) {
            const [prefix, ...rest] = ruleKey.split('*');
            const suffix = rest.join('*');
            if (domain.startsWith(prefix) && domain.endsWith(suffix)) {
              rules = ruleValue;
              // console.log(`🔍 [OptimizerDB] 매칭: ${domain} → ${ruleKey} (구체적 패턴)`);
              break;
            }
          }
        }
        
        // 2차: *.domain.com 형식 확인 (더 일반적)
        if (!rules) {
          for (const [ruleKey, ruleValue] of Object.entries(DOMAIN_RULES_DYNAMIC)) {
            if (ruleKey.startsWith('*.')) {
              const baseDomain = ruleKey.substring(2);
              if (domain.endsWith(baseDomain)) {
                rules = ruleValue;
                console.log(`🔍 [OptimizerDB] 매칭: ${domain} → ${ruleKey} (일반 패턴)`);
                break;
              }
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
      
      // 허용된 요청 로그 출력
      console.log(`✅ 허용: ${domain} | ${resourceType} | ${pathname}`);
      
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
      
      // 차단 로그 출력
      // console.log(`🚫 차단: ${domain} | ${resourceType} | ${pathname}`);
    }
  });

  // 최적화 해제 함수 반환
  return () => {
    isActive = false;
    // 간소화된 통계만 출력
    console.log(`\n📊 DB 기반 최적화 완료: 허용 ${allowedCount}개, 차단 ${blockedCount}개 (${((blockedCount / (allowedCount + blockedCount)) * 100).toFixed(1)}%)`);
    
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
  applyDynamicOptimization,
  buildDomainRulesFromConfig,
  buildDomainRulesFromV2Config,
  ESSENTIAL_DOMAINS
};