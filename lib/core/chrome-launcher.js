const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs').promises;
const { getUserDataDir, removeDirectory, getRandomViewportSize, getChromeArgs } = require('../utils/browser-utils');
const { clearSessionWithCDP, clearCookiesAndStorage } = require('../utils/session-cleaner');
const { hideAutomationTraces } = require('../utils/automation-detector');
const { setupTrackers } = require('./tracker-setup');
const environment = require('../../environment');
const NetworkMonitor = require('../network/monitor');

/**
 * Chrome 브라우저 실행 함수
 * @param {Object} proxy - 프록시 설정 객체
 * @param {boolean} persistent - 영구 프로필 사용 여부
 * @param {string} profileName - 프로필 이름
 * @param {boolean} clearSession - 세션 초기화 여부
 * @param {boolean} clearCache - 캐시 삭제 여부
 * @param {boolean} useTracker - 트래커 사용 여부
 * @param {boolean} gpuDisabled - GPU 비활성화 여부
 * @param {Object} windowPosition - 창 위치 {x, y}
 * @param {boolean} trafficMonitor - 네트워크 트래픽 모니터링 여부
 */
async function launchChrome(proxy = null, persistent = false, profileName = null, clearSession = false, clearCache = false, useTracker = false, gpuDisabled = false, windowPosition = null, trafficMonitor = false) {
  let browser;
  let page;
  let context;
  let networkMonitor = null;
  
  // 캐시/세션 제어 상태 출력
  console.log('🔧 브라우저 설정:');
  console.log(`   - 세션 초기화 (clear_session): ${clearSession ? '✅ 활성' : '❌ 비활성'}`);
  console.log(`   - 캐시 삭제 (clear_cache): ${clearCache ? '✅ 활성' : '❌ 비활성 (트래픽 절감)'}`);
  
  // 프록시 설정
  const proxyConfig = proxy || undefined;
  
  // 브라우저 창 크기 설정 (랜덤 변동 적용)
  const viewport = getRandomViewportSize(environment.screenWidth, environment.screenHeight);
  
  // Chrome 실행 인자 생성
  const chromeArgs = getChromeArgs({
    viewport,
    windowPosition,
    clearCache,  // clearCache만 전달하여 캐시 제어
    gpuDisabled
  });
  
  if (persistent) {
    // 영구 프로필 모드
    const actualProfileName = profileName || 'chrome';
    const userDataDir = getUserDataDir(actualProfileName);
    
    try {
      await fs.mkdir(userDataDir, { recursive: true });
    } catch (e) {
      // 디렉토리가 이미 존재하면 무시
    }
    
    console.log(`🚀 Chrome 영구 프로필 모드 시작...`);
    console.log(`📁 유저 데이터 디렉토리: ${userDataDir}\n`);
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      args: chromeArgs,
      viewport: viewport,
      acceptDownloads: true,
      proxy: proxyConfig
    });
    
    browser = context.browser();
    
  } else {
    // 일반 모드 (비영구) - 프로필 디렉토리 삭제
    const actualProfileName = profileName || 'chrome';
    const userDataDir = getUserDataDir(actualProfileName);
    
    // 기존 프로필 디렉토리가 있으면 삭제
    await removeDirectory(userDataDir);
    
    console.log('🚀 Chrome 테스트 시작...\n');
    
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: chromeArgs,
      proxy: proxyConfig
    });
    
    context = await browser.newContext({
      viewport: viewport,
      acceptDownloads: true
    });
  }
  
  // 트래커 설정
  if (useTracker) {
    await setupTrackers(context, page, profileName);
  }
  
  // 페이지 가져오기 또는 생성
  if (persistent) {
    const pages = context.pages();
    if (pages.length > 0) {
      page = pages[0];
    } else {
      page = await context.newPage();
    }
  } else {
    page = await context.newPage();
  }
  
  // Chrome 자동화 흔적 제거
  await hideAutomationTraces(page);
  
  // 세션 및 캐시 초기화 처리
  await clearSessionWithCDP(page, clearSession, clearCache);
  
  // 브라우저 정보 출력
  console.log(`💻 운영체제: ${os.platform()} ${os.release()}`);
  if (proxyConfig) {
    console.log(`🔐 프록시 서버: ${proxyConfig.server}`);
  } else {
    console.log('🌐 프록시 사용 안 함');
  }
  
  // 네트워크 모니터링 설정
  if (trafficMonitor) {
    networkMonitor = new NetworkMonitor();
    await networkMonitor.start(page);
  }
  
  return { browser, page, context, networkMonitor };
}

module.exports = { launchChrome };