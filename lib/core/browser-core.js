/**
 * 브라우저 코어 모듈 - 완성형 통합 모듈 (클래스 기반)
 * BrowserManager + chrome-launcher + session-cleaner + browser-helpers 통합
 * 
 * ⚠️⚠️⚠️ 절대 수정 금지 ⚠️⚠️⚠️
 * HEADLESS 모드는 절대 사용하면 안됨!!!
 * Ubuntu 서버에서 headless=true 시 TLS 오류로 즉시 차단됨
 * 이 파일의 headless 관련 코드를 절대 수정하지 마시오
 * ⚠️⚠️⚠️ 절대 수정 금지 ⚠️⚠️⚠️
 */

const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const environment = require('../../environment');

/**
 * 브라우저 코어 클래스 - 상속 가능한 완성형 기본 클래스
 * BrowserManager 기능 포함
 */
class BrowserCore {
  constructor(options = {}) {
    // ⚠️ HEADLESS는 항상 FALSE - 절대 수정 금지
    this.defaultOptions = {
      clearSession: true,
      headless: false,  // ⚠️ 절대 true로 변경 금지 - TLS 차단
      gpuDisabled: false,
      profileName: 'chrome'
    };
    this.options = { ...this.defaultOptions, ...options };
    // headless 강제 false 처리 (실수 방지)
    this.options.headless = false;
    
    // BrowserManager 기능
    this.activeBrowsers = new Map(); // profileName -> browser 매핑
    this.browserStats = {
      created: 0,
      closed: 0,
      reused: 0,
      active: 0
    };
  }

  /**
   * 브라우저 인스턴스 생성 또는 재사용 (BrowserManager 통합)
   * @param {Object} options - 브라우저 옵션
   * @returns {Object} 브라우저 정보
   */
  async getBrowser(options = {}) {
    const {
      proxyConfig = null,
      usePersistent = true,
      profileName = 'default',
      clearSession = true,
      gpuDisabled = false,
      windowPosition = null,
      userDataDir = null,
      executablePath = null
    } = options;

    const browserKey = this.generateBrowserKey(options);
    
    // 캐시 최적화: Chrome 프로세스 정리 후 프로필 재사용
    if (usePersistent) {
      const actualUserDataDir = userDataDir || `browser-data/${profileName}`;
      
      console.log(`💾 [캐시 최적화] 영구 프로필 모드: ${browserKey}`);
      console.log(`   - 실제 프로필 디렉토리: ${actualUserDataDir}`);
      console.log(`   - Chrome 프로세스 정리 후 프로필 재사용`);
      
      // Chrome Preferences 정리
      await this.cleanChromeProfile(actualUserDataDir);
      
      // 특정 프로필의 Chrome 프로세스만 정리
      await this.killSpecificChromeProcesses(actualUserDataDir);
    }
    
    // 기존 브라우저 재사용 확인 (메모리 내 활성 브라우저만)
    if (this.activeBrowsers.has(browserKey) && !clearSession) {
      const existingBrowser = this.activeBrowsers.get(browserKey);
      
      if (await this.isBrowserAlive(existingBrowser.browser)) {
        console.log(`🔄 [브라우저 관리] 기존 브라우저 재사용: ${browserKey}`);
        this.browserStats.reused++;
        return existingBrowser;
      } else {
        // 죽은 브라우저 정리
        this.activeBrowsers.delete(browserKey);
        this.browserStats.active--;
      }
    }

    // 새로운 브라우저 생성
    console.log(`🚀 [브라우저 관리] 새 브라우저 생성: ${browserKey}`);
    
    const browserInfo = await this.launch({
      proxy: proxyConfig,
      profileName,
      clearSession,
      gpuDisabled,
      windowPosition,
      customUserDataDir: userDataDir,
      executablePath
    });

    // 브라우저 정보 저장
    const managedBrowserInfo = {
      ...browserInfo,
      createdAt: new Date(),
      lastUsed: new Date(),
      profileName,
      options
    };

    this.activeBrowsers.set(browserKey, managedBrowserInfo);
    this.browserStats.created++;
    this.browserStats.active++;

    return managedBrowserInfo;
  }

  /**
   * 브라우저 키 생성
   */
  generateBrowserKey(options) {
    const {
      proxyConfig,
      profileName = 'default',
      gpuDisabled = false
    } = options;

    const proxyKey = proxyConfig ? proxyConfig.server : 'no-proxy';
    // headless는 항상 false이므로 키에서 제거
    return `${profileName}_${proxyKey}_${gpuDisabled ? 'gpu-off' : 'gpu-on'}`;
  }

  /**
   * 브라우저 생존 확인
   */
  async isBrowserAlive(browser) {
    try {
      if (!browser || !browser.isConnected()) {
        return false;
      }
      
      const pages = await browser.pages();
      return pages.length >= 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Chrome 프로세스 종료
   */
  async killSpecificChromeProcesses(userDataDir) {
    if (os.platform() !== 'linux') return;
    
    try {
      const { stdout } = await execAsync('pgrep -f chrome || true');
      if (!stdout.trim()) return;
      
      const pids = stdout.trim().split('\n');
      for (const pid of pids) {
        try {
          const { stdout: cmdline } = await execAsync(`cat /proc/${pid}/cmdline 2>/dev/null || true`);
          if (cmdline.includes(userDataDir)) {
            await execAsync(`kill -9 ${pid} 2>/dev/null || true`);
            console.log(`   ✅ Chrome 프로세스 종료: PID ${pid}`);
          }
        } catch (e) {
          // 프로세스가 이미 종료됨
        }
      }
    } catch (error) {
      // pgrep 실패 무시
    }
  }

  /**
   * Chrome 프로필 정리
   */
  async cleanChromeProfile(userDataDir) {
    try {
      const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
      
      try {
        const prefsData = await fs.readFile(prefsPath, 'utf8');
        const prefs = JSON.parse(prefsData);
        
        // 복구 관련 설정 제거
        if (prefs.profile) {
          delete prefs.profile.exit_type;
          delete prefs.profile.exited_cleanly;
        }
        
        // 세션 복구 비활성화
        if (prefs.session) {
          prefs.session.restore_on_startup = 5;  // 새 탭 페이지
          delete prefs.session.startup_urls;
        }
        
        await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2));
      } catch (e) {
        // Preferences 파일이 없거나 파싱 실패 - 무시
      }
      
      // Local State 정리
      const localStatePath = path.join(userDataDir, 'Local State');
      try {
        const localStateData = await fs.readFile(localStatePath, 'utf8');
        const localState = JSON.parse(localStateData);
        
        if (localState.profile) {
          if (localState.profile.info_cache && localState.profile.info_cache.Default) {
            localState.profile.info_cache.Default.exit_type = 'Normal';
          }
        }
        
        await fs.writeFile(localStatePath, JSON.stringify(localState, null, 2));
      } catch (e) {
        // Local State 파일이 없거나 파싱 실패 - 무시
      }
    } catch (error) {
      // 전체 프로필 정리 실패 - 무시
    }
  }

  /**
   * 사용자 데이터 디렉토리 경로 생성
   */
  async getUserDataDir(profileName = 'chrome') {
    const platform = os.platform();
    let baseDir;
    
    if (platform === 'linux') {
      baseDir = path.join(os.homedir(), '.coupang-agent', 'profiles');
    } else if (platform === 'darwin') {
      baseDir = path.join(os.homedir(), 'Library', 'Application Support', 'CoupangAgent', 'profiles');
    } else {
      baseDir = path.join(os.homedir(), 'AppData', 'Local', 'CoupangAgent', 'profiles');
    }
    
    const profileDir = path.join(baseDir, profileName);
    
    try {
      await fs.mkdir(profileDir, { recursive: true });
    } catch (e) {
      // 이미 존재하면 무시
    }
    
    return profileDir;
  }

  /**
   * 랜덤 뷰포트 크기 생성
   */
  getRandomViewportSize(screenWidth = 1920, screenHeight = 1080) {
    const viewports = [
      { width: Math.floor(screenWidth * 0.9), height: Math.floor(screenHeight * 0.85) },
      { width: Math.floor(screenWidth * 0.85), height: Math.floor(screenHeight * 0.8) },
      { width: Math.floor(screenWidth * 0.8), height: Math.floor(screenHeight * 0.75) }
    ];
    
    return viewports[Math.floor(Math.random() * viewports.length)];
  }

  /**
   * Chrome 실행 인자 생성 (최소 인자만 사용)
   */
  getChromeArgs(options = {}) {
    const { viewport, windowPosition, gpuDisabled } = options;
    // ⚠️ headless 파라미터 무시 - 항상 GUI 모드
    
    // 최소 인자만 사용
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-setuid-sandbox'
    ];
    
    // 창 위치 설정
    if (windowPosition) {
      args.push(`--window-position=${windowPosition.x},${windowPosition.y}`);
      
      if (windowPosition.width && windowPosition.height) {
        args.push(`--window-size=${windowPosition.width},${windowPosition.height}`);
      }
    }
    
    // 뷰포트 크기 설정
    if (viewport) {
      args.push(`--window-size=${viewport.width},${viewport.height}`);
    }
    
    // GPU 비활성화
    if (gpuDisabled) {
      args.push('--disable-gpu');
    }
    
    return args;
  }

  /**
   * CDP를 통한 세션 초기화
   */
  async clearSessionWithCDP(page, clearSession = true) {
    if (!clearSession) {
      console.log('🔒 세션 데이터 유지');
      return;
    }

    try {
      const client = await page.context().newCDPSession(page);
      
      console.log('🧹 세션 초기화 시작...');
      
      // 1. 쿠키 삭제
      await client.send('Network.clearBrowserCookies');
      console.log('   ✅ 쿠키 삭제 완료');
      
      // 2. 스토리지 삭제
      await client.send('Storage.clearDataForOrigin', {
        origin: '*',
        storageTypes: 'all'
      });
      
      // 쿠팡 도메인 스토리지 명시적 삭제
      const coupangOrigins = [
        'https://www.coupang.com',
        'https://coupang.com',
        'https://login.coupang.com',
        'https://m.coupang.com'
      ];
      
      for (const origin of coupangOrigins) {
        try {
          await client.send('Storage.clearDataForOrigin', {
            origin: origin,
            storageTypes: 'all'
          });
        } catch (e) {
          // 도메인이 아직 방문되지 않았을 수 있음
        }
      }
      console.log('   ✅ 스토리지 삭제 완료');
      
      // 3. Service Workers 제거
      try {
        const { registrations } = await client.send('ServiceWorker.getRegistrations');
        for (const registration of registrations || []) {
          await client.send('ServiceWorker.unregister', {
            scopeURL: registration.scopeURL
          });
        }
        console.log('   ✅ Service Workers 제거 완료');
      } catch (e) {
        // Service Worker가 없을 수 있음
      }
      
      // 4. 권한 초기화
      await client.send('Browser.resetPermissions');
      console.log('   ✅ 권한 초기화 완료');
      
      console.log('🧹 초기화 완료\n');
      
    } catch (error) {
      console.error('⚠️ CDP 초기화 중 오류:', error.message);
    }
  }

  /**
   * Chrome 브라우저 실행 메소드
   */
  async launch(options = {}) {
    const {
      proxy = null,
      profileName = null,
      clearSession = true,
      gpuDisabled = false,
      windowPosition = null,
      customUserDataDir = null,
      executablePath = null
    } = options;
    
    // ⚠️ HEADLESS 강제 비활성화 - TLS 차단 방지
    const headless = environment.FORCE_HEADLESS_FALSE ? false : false;  // 이중 안전장치
    if (headless === true) {
      throw new Error('⚠️ HEADLESS 모드 감지! Ubuntu에서 TLS 차단됨. 즉시 중단.');
    }
    
    let browser;
    let page;
    let context;
    
    console.log('🔧 브라우저 설정:');
    console.log(`   - 세션 초기화: ${clearSession ? '✅ 활성' : '❌ 비활성'}`);
    
    const proxyConfig = proxy || undefined;
    
    // 브라우저 창 크기 설정
    let viewport;
    if (windowPosition && windowPosition.width && windowPosition.height) {
      viewport = {
        width: windowPosition.width,
        height: windowPosition.height
      };
    } else {
      viewport = this.getRandomViewportSize(environment.screenWidth, environment.screenHeight);
    }
    
    // Chrome 실행 인자 생성
    const chromeArgs = this.getChromeArgs({
      viewport,
      windowPosition,
      gpuDisabled
    });
    
    // 프로필 경로 설정
    const actualProfileName = profileName || 'chrome';
    const userDataDir = customUserDataDir || await this.getUserDataDir(actualProfileName);
    
    try {
      await fs.mkdir(userDataDir, { recursive: true });
    } catch (e) {
      // 디렉토리가 이미 존재하면 무시
    }
    
    console.log(`🚀 Chrome 시작...`);
    console.log(`📁 프로필 경로: ${userDataDir}`);
    if (executablePath) {
      console.log(`🎯 Chrome 경로: ${executablePath}`);
    }

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,  // ⚠️ 절대 수정 금지 - TLS 차단
      channel: executablePath ? undefined : 'chrome',  // executablePath 사용시 channel 무시
      executablePath: executablePath || undefined,  // 커스텀 Chrome 경로
      args: chromeArgs,
      viewport: viewport,
      acceptDownloads: true,
      proxy: proxyConfig
    });
    
    browser = context.browser();
    
    // 페이지 가져오기 또는 생성
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    
    // 다이얼로그 자동 처리
    page.on('dialog', async dialog => {
      try {
        console.log(`📢 다이얼로그 감지: ${dialog.type()}`);
        await dialog.dismiss();
      } catch (error) {
        if (!error.message.includes('session closed')) {
          console.error('다이얼로그 처리 오류:', error.message);
        }
      }
    });
    
    // 세션 초기화
    if (clearSession) {
      await this.clearSessionWithCDP(page, true);
    }
    
    if (proxyConfig) {
      console.log(`🔐 프록시: ${proxyConfig.server}`);
    }
    
    console.log('✅ Chrome 브라우저 준비 완료\n');
    
    return { browser, page, context };
  }

  /**
   * 모든 브라우저 종료
   */
  async shutdown() {
    console.log('🔽 [브라우저 관리] 모든 브라우저 종료 중...');
    
    const closePromises = [];
    for (const [browserKey, browserInfo] of this.activeBrowsers) {
      closePromises.push(this.closeBrowser(browserKey));
    }
    
    await Promise.all(closePromises);
    
    console.log(`📊 [브라우저 통계]`);
    console.log(`   - 생성: ${this.browserStats.created}`);
    console.log(`   - 재사용: ${this.browserStats.reused}`);
    console.log(`   - 종료: ${this.browserStats.closed}`);
    console.log(`   - 활성: ${this.browserStats.active}`);
  }

  /**
   * 특정 브라우저 종료
   */
  async closeBrowser(browserKey) {
    if (!this.activeBrowsers.has(browserKey)) {
      return;
    }

    const browserInfo = this.activeBrowsers.get(browserKey);
    
    try {
      if (await this.isBrowserAlive(browserInfo.browser)) {
        await browserInfo.browser.close();
        console.log(`🔽 [브라우저 관리] 브라우저 종료: ${browserKey}`);
      }
    } catch (error) {
      console.error(`❌ [브라우저 관리] 브라우저 종료 실패 (${browserKey}):`, error.message);
    } finally {
      this.activeBrowsers.delete(browserKey);
      this.browserStats.closed++;
      this.browserStats.active--;
    }
  }
}

// =====================================================
// 하위 호환성을 위한 함수형 래퍼
// =====================================================

/**
 * Chrome 브라우저 실행 함수 (하위 호환성)
 */
async function launchChrome(proxy = null, usePersistent = true, profileName = null, clearSession = true, headless = false, gpuDisabled = false, windowPosition = null, trafficMonitor = false, customUserDataDir = null) {
  // ⚠️ headless 파라미터는 무시됨 - 항상 false 사용
  const browserCore = new BrowserCore();
  return await browserCore.launch({
    proxy,
    profileName,
    clearSession,
    headless: false,  // ⚠️ 강제 false - 절대 수정 금지
    gpuDisabled,
    windowPosition,
    customUserDataDir
  });
}

// BrowserManager 싱글톤 인스턴스 (하위 호환성)
const browserManager = new BrowserCore();

// =====================================================
// 모듈 Export
// =====================================================

module.exports = {
  // 클래스 export (상속용)
  BrowserCore,
  
  // BrowserManager 싱글톤 (하위 호환성)
  browserManager,
  
  // 하위 호환성을 위한 함수들
  launchChrome,
  
  // 헬퍼 함수들 (필요시 개별 사용)
  getUserDataDir: async (profileName) => {
    const core = new BrowserCore();
    return await core.getUserDataDir(profileName);
  },
  getRandomViewportSize: (screenWidth, screenHeight) => {
    const core = new BrowserCore();
    return core.getRandomViewportSize(screenWidth, screenHeight);
  },
  getChromeArgs: (options) => {
    const core = new BrowserCore();
    return core.getChromeArgs(options);
  },
  clearSessionWithCDP: async (page, clearSession) => {
    const core = new BrowserCore();
    return await core.clearSessionWithCDP(page, clearSession);
  }
};