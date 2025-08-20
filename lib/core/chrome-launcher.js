const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs').promises;
const { getUserDataDir, removeDirectory, getRandomViewportSize, getChromeArgs } = require('../utils/browser-utils');
const { clearSessionWithCDP, clearCookiesAndStorage } = require('../utils/session-cleaner');
const { hideAutomationTraces } = require('../utils/automation-detector');
const { setupTrackers } = require('./tracker-setup');
const environment = require('../../environment');
const NetworkMonitor = require('../network/monitor');
const { registerServiceWorker } = require('../utils/service-worker-cache');
const { optimizeConnections, enableRequestBatching } = require('../utils/connection-optimizer');

/**
 * Chrome 브라우저 실행 함수
 * @param {Object} proxy - 프록시 설정 객체
 * @param {boolean} persistent - 영구 프로필 사용 여부
 * @param {string} profileName - 프로필 이름
 * @param {boolean} clearSession - 세션 초기화 여부 (항상 true)
 * @param {boolean} headless - headless 모드 여부
 * @param {boolean} gpuDisabled - GPU 비활성화 여부
 * @param {Object} windowPosition - 창 위치 {x, y}
 * @param {boolean} trafficMonitor - 네트워크 트래픽 모니터링 여부
 * @param {string} customUserDataDir - 사용자 지정 데이터 디렉토리
 */
async function launchChrome(proxy = null, persistent = false, profileName = null, clearSession = true, headless = false, gpuDisabled = false, windowPosition = null, trafficMonitor = false, customUserDataDir = null) {
  let browser;
  let page;
  let context;
  let networkMonitor = null;
  
  // 캐시/세션 제어 상태 출력
  console.log('🔧 브라우저 설정:');
  console.log(`   - 세션 초기화 (clear_session): ${clearSession ? '✅ 활성' : '❌ 비활성'}`);
  console.log(`   - 캐시 관리: 🔗 공유 캐시 사용 (트래픽 절감)`);
  
  // 프록시 설정
  const proxyConfig = proxy || undefined;
  
  // 브라우저 창 크기 설정 (랜덤 변동 적용)
  const viewport = getRandomViewportSize(environment.screenWidth, environment.screenHeight);
  
  // Chrome 실행 인자 생성
  const chromeArgs = getChromeArgs({
    viewport,
    windowPosition,
    gpuDisabled,
    headless     // Ubuntu 환경 감지를 위해 headless 옵션 전달
  });
  
  if (persistent) {
    // 영구 프로필 모드
    const actualProfileName = profileName || 'chrome';
    const userDataDir = customUserDataDir || await getUserDataDir(actualProfileName);
    
    try {
      await fs.mkdir(userDataDir, { recursive: true });
    } catch (e) {
      // 디렉토리가 이미 존재하면 무시
    }
    
    console.log(`🚀 Chrome 영구 프로필 모드 시작...`);
    console.log(`📁 유저 데이터 디렉토리: ${userDataDir}`);
    if (customUserDataDir) {
      console.log(`   ✅ 사용자 지정 경로 사용 (최적화된 구조)`);
    } else {
      console.log(`   ⚠️ 기본 경로 사용`);
    }
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: headless,
      channel: 'chrome',
      args: chromeArgs,
      viewport: viewport,
      acceptDownloads: true,
      proxy: proxyConfig
    });
    
    browser = context.browser();
    
  } else {
    // 일반 모드 (비영구) - 세션/캐시 설정에 따라 선택적 처리
    const actualProfileName = profileName || 'chrome';
    const userDataDir = customUserDataDir || await getUserDataDir(actualProfileName);
    
    // 항상 세션 제거 모드 (캐시는 보존)
    console.log('🧹 세션 제거 모드 (캐시 보존을 위해 유저데이터 유지)');
    
    console.log('🚀 Chrome 테스트 시작...\n');
    
    // 항상 persistent context 사용 (캐시 보존)
    try {
      await fs.mkdir(userDataDir, { recursive: true });
    } catch (e) {
      // 디렉토리가 이미 존재하면 무시
    }
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      args: chromeArgs,
      viewport: viewport,
      acceptDownloads: true,
      proxy: proxyConfig
    });
    
    browser = context.browser();
  }
  
  // 트래커 설정 (현재는 비활성화)
  // if (useTracker) {
  //   await setupTrackers(context, page, profileName);
  // }
  
  // 페이지 가져오기 또는 생성 (항상 persistent 모드)
  const pages = context.pages();
  if (pages.length > 0) {
    page = pages[0];
  } else {
    page = await context.newPage();
  }
  
  // Chrome 자동화 흔적 제거
  await hideAutomationTraces(page);
  
  // 다이얼로그 자동 처리 (alert, confirm, prompt 등)
  page.on('dialog', async dialog => {
    try {
      console.log(`📢 다이얼로그 감지: ${dialog.type()}, 메시지: ${dialog.message()}`);
      await dialog.dismiss(); // 모든 다이얼로그 자동 닫기
    } catch (error) {
      // 세션이 닫혔을 경우 무시
      if (!error.message.includes('session closed')) {
        console.error('다이얼로그 처리 오류:', error.message);
      }
    }
  });
  
  // 세션 초기화 처리 (항상 실행, 캐시는 보존)
  await clearSessionWithCDP(page, true, false);
  
  // 브라우저 정보 출력
  console.log(`💻 운영체제: ${os.platform()} ${os.release()}`);
  if (proxyConfig) {
    console.log(`🔐 프록시 서버: ${proxyConfig.server}`);
  } else {
    console.log('🌐 프록시 사용 안 함');
  }
  
  // 고급 최적화 시스템 비활성화 (성능 및 안정성 우선)
  // if (!clearCache) {
  //   console.log('🚀 고급 캐싱 및 연결 최적화 시작...');
  //   
  //   // Service Worker 캐싱 시스템
  //   await registerServiceWorker(page);
  //   
  //   // HTTP/2 연결 최적화
  //   await optimizeConnections(page);
  //   
  //   // 요청 배칭 시스템
  //   await enableRequestBatching(page);
  //   
  //   console.log('✅ 고급 최적화 시스템 활성화 완료');
  // }
  
  console.log('💾 기본 Chrome 캐싱 시스템 사용 (안정성 우선)');
  
  // 네트워크 모니터링 설정
  if (trafficMonitor) {
    networkMonitor = new NetworkMonitor();
    // --monitor 옵션이 있는 경우 파일 로깅 활성화
    const enableFileLogging = process.argv.includes('--monitor');
    await networkMonitor.start(page, { enableFileLogging });
  }
  
  return { browser, page, context, networkMonitor };
}

module.exports = { launchChrome };