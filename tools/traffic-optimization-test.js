/**
 * 독립 트래픽 최적화 테스트 도구
 * - 실서비스 영향 없는 독립 환경
 * - 안전한 Keep-Alive 최적화 검증
 * - coupang.com 트래픽 측정
 */

const { chromium } = require('playwright');
const path = require('path');

// 고정 설정
const PROFILE_PATH = 'd:\\dev\\git\\dev_coupang_chrome\\browser-data\\chrome';
const TEST_URL = 'https://www.coupang.com';

/**
 * 간소화된 네트워크 모니터
 */
class SimpleNetworkMonitor {
  constructor() {
    this.requests = [];
    this.cacheHits = 0;
    this.connectionReuses = 0;
    this.startTime = Date.now();
  }

  async start(page, optimizationMode = 'none') {
    console.log(`📡 네트워크 모니터링 시작 (${optimizationMode} 모드)`);
    
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Network.enable');

      // 최적화 모드별 설정 적용
      if (optimizationMode !== 'none') {
        await this.applyOptimizations(client, page, optimizationMode);
      }

      // 응답 수집
      client.on('Network.responseReceived', (params) => {
        const { response } = params;
        
        const fromCache = response.fromMemoryCache || response.fromDiskCache || 
                         response.fromServiceWorker || response.status === 304;
        
        if (fromCache) {
          this.cacheHits++;
        }

        this.requests.push({
          url: response.url,
          status: response.status,
          size: response.encodedDataLength || 0,
          fromCache,
          timestamp: Date.now()
        });
      });

      // 로딩 완료 처리
      client.on('Network.loadingFinished', (params) => {
        // 연결 재사용 감지 (간접적)
        const recentRequests = this.requests.filter(r => 
          Date.now() - r.timestamp < 1000 && !r.fromCache
        );
        if (recentRequests.length > 3) {
          this.connectionReuses++;
        }
      });

    } catch (error) {
      console.log('⚠️ CDP 설정 실패, 기본 모니터링 사용:', error.message);
      
      // 폴백: 기본 response 이벤트 사용
      page.on('response', (response) => {
        const fromCache = response.status() === 304 || false;
        
        if (fromCache) {
          this.cacheHits++;
        }

        this.requests.push({
          url: response.url(),
          status: response.status(),
          size: 0, // content-length에서 추정 가능하지만 생략
          fromCache,
          timestamp: Date.now()
        });
      });
    }
  }

  /**
   * 최적화 모드별 설정 적용
   */
  async applyOptimizations(client, page, mode) {
    console.log(`🚀 ${mode} 최적화 적용 중...`);

    if (mode === 'safe' || mode === 'advanced') {
      // DNS 프리페치 (모든 모드에서 안전)
      await page.evaluateOnNewDocument(() => {
        const prefetchDomains = [
          'www.coupang.com',
          'image7.coupangcdn.com',
          'static.coupangcdn.com'
        ];
        
        const head = document.head || document.getElementsByTagName('head')[0];
        
        prefetchDomains.forEach(domain => {
          const dnsLink = document.createElement('link');
          dnsLink.rel = 'dns-prefetch';
          dnsLink.href = `//${domain}`;
          head.appendChild(dnsLink);
          
          const preconnectLink = document.createElement('link');
          preconnectLink.rel = 'preconnect';
          preconnectLink.href = `https://${domain}`;
          head.appendChild(preconnectLink);
        });
        
        console.log('[최적화] DNS 프리페치 설정 완료');
      });
    }

    if (mode === 'advanced') {
      // 안전한 Keep-Alive + 우선순위 제어
      await client.send('Network.setRequestInterception', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }]
      });

      client.on('Network.requestPaused', async (params) => {
        const { requestId, request } = params;
        
        try {
          const headers = { ...request.headers };
          const url = request.url;
          
          // 정적 리소스만 Keep-Alive (안전)
          if (url.includes('.css') || url.includes('.js') || url.includes('.woff')) {
            headers['Connection'] = 'keep-alive';
            headers['Priority'] = 'u=1, i'; // 중간 우선순위
            console.log('[최적화] Keep-Alive 적용:', url.substring(0, 50) + '...');
          }
          // API/HTML은 기본 연결 (익명성 유지)
          else if (url.includes('/api/') || url.includes('/search/')) {
            headers['Priority'] = 'u=0, i'; // 최고 우선순위
          }
          // 이미지는 낮은 우선순위
          else if (url.includes('image') || url.includes('thumbnail')) {
            headers['Priority'] = 'u=5, i';
          }
          
          await client.send('Network.continueRequestPaused', {
            requestId,
            headers
          });
          
        } catch (error) {
          await client.send('Network.continueRequestPaused', { requestId });
        }
      });
    }
  }

  /**
   * 통계 반환
   */
  getStats() {
    const duration = (Date.now() - this.startTime) / 1000;
    const totalSize = this.requests.reduce((sum, req) => sum + (req.size || 0), 0);
    const networkSize = this.requests
      .filter(req => !req.fromCache)
      .reduce((sum, req) => sum + (req.size || 0), 0);

    return {
      duration: duration.toFixed(2),
      totalRequests: this.requests.length,
      cacheHits: this.cacheHits,
      cacheHitRate: this.requests.length > 0 
        ? (this.cacheHits / this.requests.length * 100).toFixed(1)
        : 0,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      networkSizeMB: (networkSize / (1024 * 1024)).toFixed(2),
      connectionReuses: this.connectionReuses,
      topDomains: this.getTopDomains(5)
    };
  }

  getTopDomains(limit = 5) {
    const domainStats = {};
    
    this.requests.forEach(req => {
      try {
        const domain = new URL(req.url).hostname;
        if (!domainStats[domain]) {
          domainStats[domain] = { count: 0, size: 0 };
        }
        domainStats[domain].count++;
        domainStats[domain].size += req.size || 0;
      } catch (e) {
        // URL 파싱 실패 무시
      }
    });

    return Object.entries(domainStats)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, limit)
      .map(([domain, stats]) => ({
        domain,
        count: stats.count,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
      }));
  }
}

/**
 * 테스트 실행
 */
async function runOptimizationTest(mode = 'none') {
  console.log(`\n🧪 트래픽 최적화 테스트 시작 (${mode} 모드)`);
  console.log(`📁 프로필: ${PROFILE_PATH}`);
  console.log(`🌐 URL: ${TEST_URL}\n`);

  const monitor = new SimpleNetworkMonitor();
  let context = null;
  let page = null;

  try {
    // Persistent Context로 브라우저 시작
    context = await chromium.launchPersistentContext(PROFILE_PATH, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1200, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    // 기존 페이지 사용 또는 새 페이지 생성
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    // 자동화 흔적 제거
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete window.chrome.runtime;
    });

    // 네트워크 모니터링 시작
    await monitor.start(page, mode);

    console.log('🚀 쿠팡 페이지 로딩 중...');
    
    // 페이지 로드
    await page.goto(TEST_URL, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    console.log('⏳ 추가 리소스 로딩 대기 (5초)...');
    await page.waitForTimeout(5000);

    // 통계 출력
    const stats = monitor.getStats();
    
    console.log('\n📊 트래픽 통계:');
    console.log(`   로딩 시간: ${stats.duration}초`);
    console.log(`   총 요청 수: ${stats.totalRequests}개`);
    console.log(`   캐시 히트: ${stats.cacheHits}개 (${stats.cacheHitRate}%)`);
    console.log(`   총 트래픽: ${stats.totalSizeMB}MB`);
    console.log(`   네트워크: ${stats.networkSizeMB}MB`);
    console.log(`   연결 재사용: ${stats.connectionReuses}회`);
    
    console.log('\n🏆 상위 도메인:');
    stats.topDomains.forEach((domain, i) => {
      console.log(`   ${i+1}. ${domain.domain}: ${domain.count}개, ${domain.sizeMB}MB`);
    });

    return stats;

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    return null;
  } finally {
    try {
      if (page) await page.close();
      if (context) await context.close();
      console.log('✅ 브라우저 종료 완료\n');
    } catch (e) {
      console.log('⚠️ 브라우저 종료 중 오류:', e.message);
    }
  }
}

/**
 * 비교 테스트 실행
 */
async function runComparisonTest() {
  console.log('🎯 트래픽 최적화 비교 테스트 시작\n');
  console.log('='.repeat(60));

  const modes = [
    { name: 'none', desc: '최적화 없음 (베이스라인)' },
    { name: 'safe', desc: 'DNS 프리페치만 (안전)' },
    { name: 'advanced', desc: '선택적 Keep-Alive + 우선순위' }
  ];

  const results = {};

  for (const mode of modes) {
    console.log(`\n📋 모드: ${mode.desc}`);
    console.log('-'.repeat(40));
    
    const stats = await runOptimizationTest(mode.name);
    if (stats) {
      results[mode.name] = stats;
    }

    // 테스트 간 간격
    if (mode !== modes[modes.length - 1]) {
      console.log('⏳ 다음 테스트까지 3초 대기...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // 최종 비교 리포트
  console.log('\n📊 최종 비교 리포트');
  console.log('='.repeat(60));
  
  Object.entries(results).forEach(([mode, stats]) => {
    const modeDesc = modes.find(m => m.name === mode)?.desc || mode;
    console.log(`\n🔹 ${modeDesc}:`);
    console.log(`   총 트래픽: ${stats.totalSizeMB}MB`);
    console.log(`   네트워크: ${stats.networkSizeMB}MB`);
    console.log(`   캐시율: ${stats.cacheHitRate}%`);
    console.log(`   로딩시간: ${stats.duration}초`);
  });

  // 개선 효과 계산
  if (results.none && results.advanced) {
    const baseline = parseFloat(results.none.networkSizeMB);
    const optimized = parseFloat(results.advanced.networkSizeMB);
    const improvement = baseline > 0 ? ((baseline - optimized) / baseline * 100).toFixed(1) : 0;
    
    console.log(`\n💡 최적화 효과: ${improvement}% 네트워크 트래픽 절감`);
    console.log(`   (${baseline}MB → ${optimized}MB)`);
  }
}

// 실행
if (require.main === module) {
  const mode = process.argv[2] || 'comparison';
  
  if (mode === 'comparison') {
    runComparisonTest();
  } else {
    runOptimizationTest(mode);
  }
}

module.exports = { runOptimizationTest, runComparisonTest };