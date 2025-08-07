/**
 * 브라우저 관리 서비스
 * - 브라우저 인스턴스 생명주기 관리
 * - 브라우저 풀링 및 재사용
 * - 메모리 최적화
 */

const { launchChrome } = require('../core/chrome-launcher');

class BrowserManager {
  constructor() {
    this.activeBrowsers = new Map(); // profileName -> browser 매핑
    this.browserStats = {
      created: 0,
      closed: 0,
      reused: 0,
      active: 0
    };
  }

  /**
   * 브라우저 인스턴스 생성 또는 재사용
   * @param {Object} options - 브라우저 옵션
   * @returns {Object} 브라우저 정보
   */
  async getBrowser(options = {}) {
    const {
      proxyConfig = null,
      usePersistent = true,
      profileName = 'default',
      clearSession = false,
      clearCache = false,
      headless = false,
      gpuDisabled = false,
      windowPosition = null,
      trafficMonitor = true  // V2: 항상 네트워크 모니터링 활성화
    } = options;

    const browserKey = this.generateBrowserKey(options);
    
    // 캐시 최적화: Chrome 프로세스 정리 후 프로필 재사용
    if (usePersistent && !clearSession && !clearCache) {
      console.log(`💾 [캐시 최적화] 영구 프로필 모드: ${browserKey}`);
      console.log(`   - 프로필 디렉토리: browser-data/${profileName}`);
      console.log(`   - Chrome 프로세스 정리 후 프로필 재사용`);
      
      // Chrome 프로세스 정리로 락 해제
      await this.killChromeProcesses();
    }
    
    // 기존 브라우저 재사용 확인 (메모리 내 활성 브라우저만)
    if (this.activeBrowsers.has(browserKey) && !clearSession && !clearCache) {
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

    // 새로운 브라우저 생성 (프로필 재사용으로 캐시 효과 기대)
    console.log(`🚀 [브라우저 관리] 새 브라우저 생성: ${browserKey}`);
    
    const browserInfo = await launchChrome(
      proxyConfig,
      usePersistent,
      profileName,
      clearSession,
      clearCache,
      headless,
      gpuDisabled,
      windowPosition,
      trafficMonitor
    );

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
   * @param {Object} options - 브라우저 옵션
   * @returns {string} 브라우저 키
   */
  generateBrowserKey(options) {
    const {
      proxyConfig,
      profileName = 'default',
      gpuDisabled = false,
      headless = false
    } = options;

    const proxyKey = proxyConfig ? proxyConfig.server : 'no-proxy';
    return `${profileName}_${proxyKey}_${gpuDisabled ? 'gpu-off' : 'gpu-on'}_${headless ? 'headless' : 'headed'}`;
  }

  /**
   * 브라우저 생존 확인
   * @param {Object} browser - 브라우저 인스턴스
   * @returns {boolean} 생존 여부
   */
  async isBrowserAlive(browser) {
    try {
      if (!browser || !browser.isConnected()) {
        return false;
      }
      
      // 페이지 목록 확인으로 브라우저 상태 검증
      const pages = await browser.pages();
      return pages.length >= 0; // 페이지가 0개 이상이면 정상
    } catch (error) {
      return false;
    }
  }

  /**
   * 특정 브라우저 종료
   * @param {string} browserKey - 브라우저 키
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

  /**
   * 모든 브라우저 종료
   */
  async closeAllBrowsers() {
    console.log(`🔽 [브라우저 관리] 모든 브라우저 종료 시작 (${this.activeBrowsers.size}개)`);
    
    const closePromises = [];
    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      closePromises.push(this.closeBrowser(browserKey));
    }

    await Promise.allSettled(closePromises);
    
    console.log(`✅ [브라우저 관리] 모든 브라우저 종료 완료`);
  }

  /**
   * 유휴 브라우저 정리 (5분 이상 사용하지 않은 브라우저)
   * @param {number} maxIdleTime - 최대 유휴 시간 (밀리초, 기본: 5분)
   */
  async cleanupIdleBrowsers(maxIdleTime = 5 * 60 * 1000) {
    const now = new Date();
    const idleBrowsers = [];

    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      const idleTime = now - browserInfo.lastUsed;
      if (idleTime > maxIdleTime) {
        idleBrowsers.push(browserKey);
      }
    }

    if (idleBrowsers.length > 0) {
      console.log(`🧹 [브라우저 관리] 유휴 브라우저 정리: ${idleBrowsers.length}개`);
      
      for (const browserKey of idleBrowsers) {
        await this.closeBrowser(browserKey);
      }
    }
  }

  /**
   * 브라우저 사용 시간 업데이트
   * @param {string} browserKey - 브라우저 키
   */
  updateLastUsed(browserKey) {
    if (this.activeBrowsers.has(browserKey)) {
      this.activeBrowsers.get(browserKey).lastUsed = new Date();
    }
  }

  /**
   * 브라우저 통계 조회
   * @returns {Object} 브라우저 통계
   */
  getStats() {
    return {
      ...this.browserStats,
      activeBrowserKeys: Array.from(this.activeBrowsers.keys())
    };
  }

  /**
   * 브라우저 목록 조회
   * @returns {Array} 브라우저 정보 목록
   */
  getBrowserList() {
    const browsers = [];
    
    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      browsers.push({
        key: browserKey,
        profileName: browserInfo.profileName,
        createdAt: browserInfo.createdAt,
        lastUsed: browserInfo.lastUsed,
        proxy: browserInfo.options.proxyConfig?.server || null,
        isAlive: this.isBrowserAlive(browserInfo.browser)
      });
    }

    return browsers;
  }

  /**
   * 메모리 사용량 최적화
   * - 죽은 브라우저 정리
   * - 유휴 브라우저 정리
   */
  async optimizeMemory() {
    console.log('🧹 [브라우저 관리] 메모리 최적화 시작');
    
    // 죽은 브라우저 정리
    const deadBrowsers = [];
    for (const [browserKey, browserInfo] of this.activeBrowsers.entries()) {
      if (!(await this.isBrowserAlive(browserInfo.browser))) {
        deadBrowsers.push(browserKey);
      }
    }

    for (const browserKey of deadBrowsers) {
      this.activeBrowsers.delete(browserKey);
      this.browserStats.active--;
      console.log(`💀 [브라우저 관리] 죽은 브라우저 정리: ${browserKey}`);
    }

    // 유휴 브라우저 정리
    await this.cleanupIdleBrowsers();

    console.log(`✅ [브라우저 관리] 메모리 최적화 완료 (활성: ${this.browserStats.active}개)`);
  }

  /**
   * Chrome 프로세스 강제 종료 (프로필 락 해제용)
   */
  async killChromeProcesses() {
    const os = require('os');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
      if (os.platform() === 'win32') {
        // Windows에서 Chrome 프로세스 정리
        await execAsync('taskkill /F /IM chrome.exe /T 2>NUL', { windowsHide: true }).catch(() => {});
        await execAsync('taskkill /F /IM chromium.exe /T 2>NUL', { windowsHide: true }).catch(() => {});
        console.log(`   ✅ Chrome 프로세스 정리 완료`);
      } else {
        // Linux/Mac에서 Chrome 프로세스 정리
        await execAsync('pkill -f "chrome|chromium" 2>/dev/null || true').catch(() => {});
        console.log(`   ✅ Chrome 프로세스 정리 완료`);
      }
      
      // 프로세스 종료 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ⚠️ Chrome 프로세스 정리 중 오류 (무시됨): ${error.message}`);
    }
  }

  /**
   * 프로세스 종료 시 정리 작업
   */
  async shutdown() {
    console.log('🛑 [브라우저 관리] 서비스 종료 중...');
    await this.closeAllBrowsers();
    
    // Chrome 프로세스 완전 정리
    await this.killChromeProcesses();
    
    const stats = this.getStats();
    console.log('📊 [브라우저 관리] 최종 통계:', stats);
  }
}

// 싱글톤 인스턴스
const browserManager = new BrowserManager();

// 프로세스 종료 시 정리
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

module.exports = browserManager;