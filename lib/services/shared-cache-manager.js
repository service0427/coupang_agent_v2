/**
 * 공유 캐시 매니저 (간소화 버전)
 * 하나의 공통 캐시를 모든 유저폴더가 공유하는 시스템
 * 
 * 구조:
 * browser-data/
 * ├── shared-cache/               ← 공통 캐시 (실제 저장소)
 * │   ├── Cache/
 * │   ├── GPUCache/
 * │   └── ...
 * ├── instance1/
 * │   ├── 001/
 * │   │   └── Default/
 * │   │       ├── Cache -> ../../shared-cache/Cache (심볼릭 링크)
 * │   │       └── ...
 * │   └── 002/
 * 
 * 동작 원리:
 * - 최초 구동: 일반 폴더로 시작 (심볼릭 링크 없음)
 * - 재사용 시: 심볼릭 링크 체크 후 없으면 공통 캐시로 연결
 */

const path = require('path');
const fs = require('fs').promises;

class SharedCacheManager {
  constructor(config = {}) {
    this.basePath = config.basePath || './browser-data';
    this.sharedCachePath = path.join(this.basePath, 'shared-cache');
    
    // 초기화 로그는 한 번만 출력 (중복 방지)
    if (!SharedCacheManager.initialized) {
      console.log('🔗 SharedCacheManager 초기화 (간소화 버전)');
      console.log(`   기본 경로: ${this.basePath}`);
      console.log(`   공유 캐시: ${this.sharedCachePath}`);
      SharedCacheManager.initialized = true;
    }
  }

  /**
   * 초기화 - 공유 캐시 디렉토리 생성
   */
  async initialize() {
    try {
      // 공유 캐시 디렉토리 생성
      await this.ensureSharedCache();
      
      console.log('✅ SharedCacheManager 초기화 완료');
      console.log(`   공유 캐시 경로: ${this.sharedCachePath}`);
      
    } catch (error) {
      console.error('❌ SharedCacheManager 초기화 실패:', error.message);
      throw error;
    }
  }

  /**
   * 유저 폴더 캐시 상태 확인 및 설정
   * @param {string} userFolderPath - 유저 폴더 경로 (예: ./browser-data/instance1/001)
   * @param {boolean} isFirstRun - 최초 실행 여부
   * @param {boolean} forceConvert - 기존 폴더 강제 전환 여부
   */
  async setupUserFolderCache(userFolderPath, isFirstRun = false, forceConvert = false) {
    try {
      const defaultPath = path.join(userFolderPath, 'Default');
      
      // Default 디렉토리 확인/생성
      await fs.mkdir(defaultPath, { recursive: true });
      
      if (isFirstRun) {
        console.log(`📁 [최초 실행] ${path.basename(userFolderPath)} - 일반 폴더 사용`);
        // 최초 실행시에는 아무것도 하지 않음 (Chrome이 자체적으로 캐시 폴더 생성)
        return {
          isSymlinked: false,
          cacheType: 'independent',
          userFolderPath
        };
      } else {
        console.log(`🔄 [재사용] ${path.basename(userFolderPath)} - 캐시 전환 및 정리`);
        
        // 강제 전환 또는 일반 전환
        if (forceConvert) {
          await this.forceConvertToSharedCache(defaultPath);
          await this.cleanUserData(defaultPath);
        }
        
        // 캐시 상태 확인 및 심볼릭 링크 설정
        const isLinked = await this.checkAndSetupSymlinks(defaultPath);
        
        return {
          isSymlinked: isLinked,
          cacheType: isLinked ? 'shared' : 'independent',
          userFolderPath,
          sharedCachePath: this.sharedCachePath
        };
      }
      
    } catch (error) {
      console.error(`❌ 유저폴더 캐시 설정 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 캐시 심볼릭 링크 상태 확인 및 설정
   */
  async checkAndSetupSymlinks(defaultPath) {
    const cacheTypes = [
      'Cache',           // HTTP 캐시
      'GPUCache',        // GPU 캐시  
      'Code Cache',      // JavaScript/WASM 캐시
      'DawnCache',       // WebGPU 캐시
      'ShaderCache',     // 셰이더 캐시
      'GrShaderCache',   // Graphics 셰이더 캐시
      'GraphiteDawnCache' // Graphite Dawn 캐시
    ];
    
    let linkedCount = 0;
    
    for (const cacheType of cacheTypes) {
      const cachePath = path.join(defaultPath, cacheType);
      const isLinked = await this.setupSingleCacheSymlink(cachePath, cacheType);
      if (isLinked) linkedCount++;
    }
    
    const isAllLinked = linkedCount === cacheTypes.length;
    
    if (isAllLinked) {
      console.log(`   ✅ 모든 캐시가 공유 캐시로 연결됨 (${linkedCount}/${cacheTypes.length})`);
    } else if (linkedCount > 0) {
      console.log(`   ⚠️ 일부 캐시만 연결됨 (${linkedCount}/${cacheTypes.length})`);
    } else {
      console.log(`   📁 독립 캐시 사용 중 (${linkedCount}/${cacheTypes.length})`);
    }
    
    return isAllLinked;
  }

  /**
   * 단일 캐시 타입에 대한 심볼릭 링크 설정
   */
  async setupSingleCacheSymlink(cachePath, cacheType) {
    try {
      // 1. 현재 상태 확인
      let currentStat;
      try {
        currentStat = await fs.lstat(cachePath);
      } catch {
        // 캐시 폴더가 없으면 심볼릭 링크 생성
        return await this.createSymlink(cachePath, cacheType);
      }
      
      // 2. 이미 심볼릭 링크면 그대로 유지
      if (currentStat.isSymbolicLink()) {
        return true;
      }
      
      // 3. 일반 디렉토리면 심볼릭 링크로 변경
      if (currentStat.isDirectory()) {
        console.log(`   🔄 ${cacheType}: 일반 폴더 → 심볼릭 링크`);
        
        // 기존 폴더 백업 (내용이 있을 수 있음)
        const backupPath = `${cachePath}_backup_${Date.now()}`;
        await fs.rename(cachePath, backupPath);
        
        // 심볼릭 링크 생성
        const linked = await this.createSymlink(cachePath, cacheType);
        
        if (linked) {
          // 백업 폴더 삭제 (성공시)
          setTimeout(async () => {
            try {
              await fs.rm(backupPath, { recursive: true, force: true });
            } catch {} // 삭제 실패해도 무시
          }, 5000); // 5초 후 삭제
        } else {
          // 실패시 백업 복구
          await fs.rename(backupPath, cachePath);
        }
        
        return linked;
      }
      
      return false;
      
    } catch (error) {
      console.warn(`   ⚠️ ${cacheType} 심볼릭 링크 설정 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 심볼릭 링크 생성
   */
  async createSymlink(targetPath, cacheType) {
    try {
      const sourcePath = path.join(this.sharedCachePath, cacheType);
      
      // 공유 캐시 디렉토리 확인/생성
      await fs.mkdir(sourcePath, { recursive: true });
      
      // 상대 경로 계산 (../../shared-cache/Cache)
      const relativePath = path.relative(path.dirname(targetPath), sourcePath);
      
      // 심볼릭 링크 생성
      await fs.symlink(relativePath, targetPath, 'dir');
      
      return true;
      
    } catch (error) {
      console.warn(`   ⚠️ ${cacheType} 심볼릭 링크 생성 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 공유 캐시 디렉토리 생성
   */
  async ensureSharedCache() {
    await fs.mkdir(this.sharedCachePath, { recursive: true });
    
    // 각 캐시 타입 디렉토리 생성
    const cacheTypes = [
      'Cache', 'GPUCache', 'Code Cache', 'DawnCache', 
      'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache'
    ];
    
    for (const cacheType of cacheTypes) {
      await fs.mkdir(path.join(this.sharedCachePath, cacheType), { recursive: true });
    }
  }

  /**
   * 유저 폴더가 최초 실행인지 확인
   * (캐시 폴더 존재 여부로 판단)
   */
  async isFirstRun(userFolderPath) {
    try {
      const defaultPath = path.join(userFolderPath, 'Default');
      const cachePath = path.join(defaultPath, 'Cache');
      
      // Cache 폴더가 없으면 최초 실행
      await fs.access(cachePath);
      return false; // 캐시 폴더가 있으면 재사용
    } catch {
      return true; // 캐시 폴더가 없으면 최초 실행
    }
  }

  /**
   * 프로필 초기화 필요 여부 확인
   */
  async needsProfileInitialization(userFolderPath) {
    try {
      const defaultPath = path.join(userFolderPath, 'Default');
      await fs.access(defaultPath);
      
      // Default 폴더가 있고, Preferences 파일도 있는지 확인
      const prefsPath = path.join(defaultPath, 'Preferences');
      await fs.access(prefsPath);
      
      console.log(`   📁 프로필 확인: 이미 존재함 (${path.basename(userFolderPath)})`);
      return false; // 이미 완전히 초기화됨
    } catch {
      console.log(`   🆕 프로필 확인: 초기화 필요 (${path.basename(userFolderPath)})`);
      return true; // 초기화 필요
    }
  }

  /**
   * 헤드리스 모드로 프로필 초기화
   */
  async createInitialProfile(userFolderPath) {
    console.log(`   🔧 프로필 초기화 시작: ${path.basename(userFolderPath)}`);
    console.log(`   🚀 헤드리스 Chrome 실행 (초기화용)`);
    
    const { chromium } = require('playwright');
    let browser = null;
    
    try {
      // 프록시 없이 헤드리스 모드로 실행
      browser = await chromium.launchPersistentContext(userFolderPath, {
        headless: true,  // 헤드리스로 빠르게
        channel: 'chrome',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-features=TranslateUI',
          '--disable-sync',
          '--no-sandbox'  // 헤드리스 모드에서 안정성
        ],
        viewport: { width: 1200, height: 800 }
      });
      
      console.log(`   📄 about:blank 페이지 로드`);
      
      // about:blank 페이지 열기
      const page = await browser.newPage();
      await page.goto('about:blank');
      await page.waitForTimeout(1000); // 1초 대기 (폴더 생성 확실히)
      
      // 브라우저 정상 종료
      await browser.close();
      
      // 생성된 폴더 확인
      const defaultPath = path.join(userFolderPath, 'Default');
      const exists = await fs.access(defaultPath).then(() => true).catch(() => false);
      
      if (exists) {
        console.log(`   ✅ 프로필 초기화 완료`);
        console.log(`   📁 생성된 폴더 구조:`);
        console.log(`      - Default/`);
        console.log(`      - Default/Cache/`);
        console.log(`      - Default/Preferences`);
        return true;
      } else {
        console.error(`   ⚠️ 프로필 폴더 생성 확인 실패`);
        return false;
      }
      
    } catch (error) {
      console.error(`   ❌ 프로필 초기화 실패: ${error.message}`);
      if (browser) {
        try { 
          await browser.close(); 
        } catch (closeError) {
          console.error(`   ⚠️ 브라우저 종료 실패: ${closeError.message}`);
        }
      }
      return false;
    }
  }

  /**
   * 기존 폴더를 강제로 공유 캐시로 전환
   */
  async forceConvertToSharedCache(defaultPath) {
    const cacheTypes = [
      'Cache', 'GPUCache', 'Code Cache', 'DawnCache', 
      'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache'
    ];
    
    console.log(`   🔄 기존 캐시 폴더를 공유 캐시로 강제 전환 중...`);
    
    for (const cacheType of cacheTypes) {
      const cachePath = path.join(defaultPath, cacheType);
      
      try {
        const stat = await fs.lstat(cachePath);
        
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          console.log(`     - ${cacheType}: 삭제 후 심볼릭 링크 생성`);
          
          // 기존 폴더 삭제
          await fs.rm(cachePath, { recursive: true, force: true });
          
          // 심볼릭 링크 생성
          await this.createSymlink(cachePath, cacheType);
        }
      } catch (error) {
        console.warn(`     ⚠️ ${cacheType} 전환 실패: ${error.message}`);
      }
    }
  }

  /**
   * 사용자 데이터 정리 (쿠키, 세션, 로그인 정보 등)
   */
  async cleanUserData(defaultPath) {
    console.log(`   🧹 사용자 데이터 정리 중...`);
    
    const userDataFiles = [
      'Cookies', 'Cookies-journal',
      'Login Data', 'Login Data-journal', 
      'Login Data For Account', 'Login Data For Account-journal',
      'Web Data', 'Web Data-journal',
      'Local Storage', 'Session Storage', 'Sessions',
      'History', 'History-journal',
      'Favicons', 'Favicons-journal',
      'Top Sites', 'Top Sites-journal',
      'Preferences', 'Secure Preferences',
      'Trust Tokens', 'Trust Tokens-journal',
      'Network Persistent State',
      'TransportSecurity',
      'DIPS'
    ];
    
    const userDataDirs = [
      'Local Storage', 'Session Storage', 'Sessions',
      'Sync Data', 'GCM Store', 'shared_proto_db',
      'blob_storage', 'chrome_cart_db', 'commerce_subscription_db',
      'discounts_db', 'parcel_tracking_db', 'optimization_guide_hint_cache_store'
    ];
    
    let cleanedCount = 0;
    
    // 파일 삭제
    for (const fileName of userDataFiles) {
      const filePath = path.join(defaultPath, fileName);
      try {
        await fs.unlink(filePath);
        cleanedCount++;
      } catch {} // 파일이 없으면 무시
    }
    
    // 디렉토리 삭제
    for (const dirName of userDataDirs) {
      const dirPath = path.join(defaultPath, dirName);
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        cleanedCount++;
      } catch {} // 디렉토리가 없으면 무시
    }
    
    if (cleanedCount > 0) {
      console.log(`     ✅ ${cleanedCount}개 항목 정리 완료`);
    } else {
      console.log(`     📝 정리할 데이터 없음`);
    }
  }

  /**
   * 상태 정보 반환
   */
  async getStatus() {
    try {
      const sharedCacheExists = await fs.access(this.sharedCachePath).then(() => true).catch(() => false);
      
      return {
        sharedCachePath: this.sharedCachePath,
        sharedCacheExists,
        cacheTypes: ['Cache', 'GPUCache', 'Code Cache', 'DawnCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache']
      };
    } catch {
      return {
        sharedCachePath: this.sharedCachePath,
        sharedCacheExists: false,
        cacheTypes: []
      };
    }
  }
}

module.exports = SharedCacheManager;