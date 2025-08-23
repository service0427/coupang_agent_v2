/**
 * 브라우저 서비스 모듈
 * SharedCacheManager + UserFolderManager (BrowserManager는 browser-core.js로 이동)
 */

const { browserManager } = require('../core/browser-core');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// =====================================================
// SharedCacheManager - 공유 캐시 관리
// =====================================================

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
   */
  async setupUserFolderCache(userFolderPath, isFirstRun = false, forceConvert = false) {
    try {
      const defaultPath = path.join(userFolderPath, 'Default');
      
      // Default 디렉토리 확인/생성
      await fs.mkdir(defaultPath, { recursive: true });
      
      // 캐시 심볼릭 링크 설정
      const cacheTypesToLink = [
        'Cache',
        'Code Cache',
        'GPUCache',
        'Service Worker',
        'Shared Dictionary Cache'
      ];

      for (const cacheType of cacheTypesToLink) {
        const targetPath = path.join(defaultPath, cacheType);
        
        try {
          // 기존 캐시 확인
          const stats = await fs.lstat(targetPath).catch(() => null);
          
          if (stats && stats.isSymbolicLink()) {
            // 이미 심볼릭 링크인 경우
            continue;
          }
          
          if (stats && stats.isDirectory()) {
            // 실제 디렉토리가 존재하는 경우
            if (isFirstRun || forceConvert) {
              // 최초 실행이거나 강제 전환 모드일 때만 변환
              console.log(`   📁 기존 캐시 발견: ${cacheType}`);
              await this.convertToSymlink(targetPath, cacheType);
            } else {
              // 일반 모드에서는 유지
              console.log(`   📁 기존 캐시 유지: ${cacheType}`);
            }
          } else {
            // 캐시가 없는 경우 심볼릭 링크 생성
            await this.createSymlink(targetPath, cacheType);
          }
        } catch (error) {
          console.error(`   ⚠️ ${cacheType} 처리 실패:`, error.message);
        }
      }
      
      console.log('✅ 유저 폴더 캐시 설정 완료');
      
    } catch (error) {
      console.error('❌ 유저 폴더 캐시 설정 실패:', error.message);
      throw error;
    }
  }

  /**
   * 공유 캐시 디렉토리 확인 및 생성
   */
  async ensureSharedCache() {
    try {
      // 공유 캐시 기본 디렉토리 생성
      await fs.mkdir(this.sharedCachePath, { recursive: true });
      
      // 각 캐시 타입별 디렉토리 생성
      const cacheTypes = [
        'Cache',
        'Code Cache', 
        'GPUCache',
        'Service Worker',
        'Shared Dictionary Cache'
      ];
      
      for (const cacheType of cacheTypes) {
        const cachePath = path.join(this.sharedCachePath, cacheType);
        await fs.mkdir(cachePath, { recursive: true });
      }
    } catch (error) {
      console.error('공유 캐시 디렉토리 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 심볼릭 링크 생성
   */
  async createSymlink(targetPath, cacheType) {
    const sharedPath = path.join(this.sharedCachePath, cacheType);
    
    try {
      // 공유 캐시 디렉토리 확인/생성
      await fs.mkdir(sharedPath, { recursive: true });
      
      // 심볼릭 링크 생성
      await fs.symlink(sharedPath, targetPath, 'dir');
      console.log(`   🔗 심볼릭 링크 생성: ${cacheType}`);
    } catch (error) {
      if (error.code === 'EEXIST') {
        // 이미 존재하는 경우 무시
      } else {
        throw error;
      }
    }
  }

  /**
   * 기존 디렉토리를 심볼릭 링크로 변환
   */
  async convertToSymlink(targetPath, cacheType) {
    const sharedPath = path.join(this.sharedCachePath, cacheType);
    const tempPath = `${targetPath}_temp_${Date.now()}`;
    
    try {
      // 1. 기존 캐시를 임시 위치로 이동
      await fs.rename(targetPath, tempPath);
      
      // 2. 공유 캐시 디렉토리 확인/생성
      await fs.mkdir(sharedPath, { recursive: true });
      
      // 3. 임시 캐시 내용을 공유 캐시로 복사
      await this.copyDirectory(tempPath, sharedPath);
      
      // 4. 심볼릭 링크 생성
      await fs.symlink(sharedPath, targetPath, 'dir');
      
      // 5. 임시 캐시 삭제
      await this.removeDirectory(tempPath);
      
      console.log(`   ✅ 캐시 전환 완료: ${cacheType}`);
    } catch (error) {
      console.error(`   ❌ 캐시 전환 실패 (${cacheType}):`, error.message);
      // 실패 시 원상 복구 시도
      try {
        await fs.rename(tempPath, targetPath);
      } catch (e) {
        // 복구 실패 무시
      }
    }
  }

  /**
   * 디렉토리 복사
   */
  async copyDirectory(src, dest) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    await fs.mkdir(dest, { recursive: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 디렉토리 삭제
   */
  async removeDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // 삭제 실패 무시
    }
  }

  /**
   * 초기 프로필 생성 (유저 폴더가 없을 때)
   */
  async createInitialProfile(userFolderPath) {
    try {
      console.log(`📁 초기 프로필 생성: ${userFolderPath}`);
      
      // 1. 유저 폴더 생성
      await fs.mkdir(userFolderPath, { recursive: true });
      
      // 2. Default 디렉토리 생성
      const defaultPath = path.join(userFolderPath, 'Default');
      await fs.mkdir(defaultPath, { recursive: true });
      
      // 3. 최소한의 Preferences 파일 생성
      const preferencesPath = path.join(defaultPath, 'Preferences');
      const minimalPreferences = {
        profile: {
          exit_type: "Normal",
          exited_cleanly: true
        },
        session: {
          restore_on_startup: 5  // 새 탭 페이지
        }
      };
      
      await fs.writeFile(
        preferencesPath, 
        JSON.stringify(minimalPreferences, null, 2)
      );
      
      // 4. 캐시 심볼릭 링크 설정
      await this.setupUserFolderCache(userFolderPath, true, false);
      
      console.log('✅ 초기 프로필 생성 완료');
      return true;
      
    } catch (error) {
      console.error('❌ 초기 프로필 생성 실패:', error.message);
      return false;
    }
  }

  /**
   * 프로필 초기화 필요 여부 확인
   */
  async needsProfileInitialization(userFolderPath) {
    try {
      await fs.access(userFolderPath);
      return false; // 폴더가 존재하면 초기화 불필요
    } catch {
      return true; // 폴더가 없으면 초기화 필요
    }
  }

  /**
   * 최초 실행 여부 확인
   */
  async isFirstRun(userFolderPath) {
    try {
      const defaultPath = path.join(userFolderPath, 'Default');
      const cachePath = path.join(defaultPath, 'Cache');
      
      const stats = await fs.lstat(cachePath).catch(() => null);
      
      // Cache가 심볼릭 링크가 아니거나 존재하지 않으면 최초 실행
      return !stats || !stats.isSymbolicLink();
    } catch {
      return true;
    }
  }

  /**
   * 유저 데이터 정리 (옵션)
   */
  async cleanUserData(userFolderPath) {
    try {
      const defaultPath = path.join(userFolderPath, 'Default');
      
      // 정리 대상 (캐시는 제외)
      const cleanTargets = [
        'Local Storage',
        'Session Storage',
        'IndexedDB',
        'Cookies',
        'Cookies-journal'
      ];
      
      for (const target of cleanTargets) {
        const targetPath = path.join(defaultPath, target);
        try {
          await this.removeDirectory(targetPath);
          console.log(`   🧹 정리: ${target}`);
        } catch (e) {
          // 삭제 실패 무시
        }
      }
      
      console.log('✅ 유저 데이터 정리 완료');
    } catch (error) {
      console.error('⚠️ 유저 데이터 정리 실패:', error.message);
    }
  }

  /**
   * 캐시 상태 확인
   */
  async getStatus() {
    try {
      const status = {
        sharedCachePath: this.sharedCachePath,
        exists: false,
        cacheTypes: {},
        totalSize: 0
      };
      
      // 공유 캐시 존재 확인
      try {
        await fs.access(this.sharedCachePath);
        status.exists = true;
      } catch {
        return status;
      }
      
      // 각 캐시 타입별 상태 확인
      const cacheTypes = [
        'Cache',
        'Code Cache',
        'GPUCache',
        'Service Worker',
        'Shared Dictionary Cache'
      ];
      
      for (const cacheType of cacheTypes) {
        const cachePath = path.join(this.sharedCachePath, cacheType);
        try {
          const stats = await fs.stat(cachePath);
          status.cacheTypes[cacheType] = {
            exists: true,
            size: stats.size
          };
          status.totalSize += stats.size;
        } catch {
          status.cacheTypes[cacheType] = {
            exists: false,
            size: 0
          };
        }
      }
      
      return status;
    } catch (error) {
      console.error('캐시 상태 확인 실패:', error);
      return null;
    }
  }
}

// 싱글톤 초기화 플래그
SharedCacheManager.initialized = false;

// =====================================================
// UserFolderManager - 유저 폴더 관리 (SharedCacheManager에 통합 가능)
// =====================================================

class UserFolderManager {
  constructor(basePath = './browser-data') {
    this.basePath = basePath;
    this.userFolders = new Map();
  }

  /**
   * 유저 폴더 생성 또는 가져오기
   */
  async getUserFolder(userId) {
    if (this.userFolders.has(userId)) {
      return this.userFolders.get(userId);
    }

    const folderPath = path.join(this.basePath, userId);
    
    try {
      await fs.mkdir(folderPath, { recursive: true });
      this.userFolders.set(userId, folderPath);
      console.log(`📁 유저 폴더 생성/확인: ${folderPath}`);
      return folderPath;
    } catch (error) {
      console.error(`❌ 유저 폴더 생성 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 유저 폴더 정리
   */
  async cleanUserFolder(userId) {
    const folderPath = this.userFolders.get(userId);
    if (!folderPath) return;

    try {
      await fs.rm(folderPath, { recursive: true, force: true });
      this.userFolders.delete(userId);
      console.log(`🧹 유저 폴더 정리: ${folderPath}`);
    } catch (error) {
      console.error(`⚠️ 유저 폴더 정리 실패: ${error.message}`);
    }
  }

  /**
   * 모든 유저 폴더 정리
   */
  async cleanAllUserFolders() {
    for (const [userId, folderPath] of this.userFolders) {
      await this.cleanUserFolder(userId);
    }
  }
}

// =====================================================
// 프로세스 종료 핸들러
// =====================================================

process.on('SIGINT', async () => {
  console.log('\n🛑 종료 신호 감지...');
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 종료 신호 감지...');
  await browserManager.shutdown();
  process.exit(0);
});

// =====================================================
// 모듈 Export
// =====================================================

module.exports = {
  // BrowserManager는 browser-core.js에서 가져옴
  browserManager,
  
  // SharedCacheManager 클래스
  SharedCacheManager,
  
  // UserFolderManager 클래스  
  UserFolderManager
};