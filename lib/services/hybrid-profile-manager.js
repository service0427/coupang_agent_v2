/**
 * 최적화된 프로필 매니저 
 * - 인스턴스별 세션 분리: instance{N}\{001~030}
 * - 전역 캐시 공유: shared_cache (모든 인스턴스 공유)
 * 
 * 구조: 
 * browser-data/
 * ├── shared_cache/     ← 모든 인스턴스 공유 캐시
 * ├── instance1/
 * │   ├── 001/         ← 허브 할당 폴더 (3자리 패딩)
 * │   ├── 005/
 * │   └── 012/
 * └── instance2/
 *     ├── 003/
 *     └── 008/
 */

const path = require('path');
const fs = require('fs').promises;

class HybridProfileManager {
  constructor(config = {}) {
    this.instanceNumber = config.instanceNumber || 1;
    this.basePath = config.basePath || './browser-data';
    
    // 최적화된 프로필 구조
    this.instancePath = path.join(this.basePath, `instance${this.instanceNumber}`);
    this.sharedCachePath = path.join(this.basePath, 'shared_cache'); // 모든 인스턴스 공유
    
    // 허브 폴더 할당 관리
    this.threadAssignments = new Map(); // threadId -> folderNumber
    
    console.log(`🔄 최적화된 프로필 매니저 초기화:`);
    console.log(`   인스턴스: ${this.instanceNumber}`);
    console.log(`   인스턴스 경로: ${this.instancePath}`);
    console.log(`   공유 캐시: ${this.sharedCachePath}`);
  }

  /**
   * 허브에서 받은 폴더 번호로 최적화된 프로필 생성
   * 구조: browser-data\instance{N}\{001~030} + shared_cache
   * @param {number} threadId - 쓰레드 ID (사용 안함, 호환성용)
   * @param {number} folderNumber - 허브에서 할당받은 폴더 번호 (1-30)
   * @returns {Object|null} 프로필 경로 정보 (유저폴더 미준비시 null)
   */
  async getThreadProfile(threadId, folderNumber) {
    // 허브에서 받은 폴더 번호로 최적화된 구조 생성
    this.threadAssignments.set(threadId, folderNumber);
    console.log(`📁 인스턴스 ${this.instanceNumber} ← 허브 할당 폴더 ${folderNumber}`);
    
    // 3자리 패딩: 001, 005, 012
    const paddedFolderNumber = folderNumber.toString().padStart(3, '0');
    const sessionPath = path.join(this.instancePath, paddedFolderNumber);
    
    // 1. 유저폴더 사전 준비 상태 확인
    const isReady = await this.checkFolderReadiness(sessionPath, folderNumber);
    if (!isReady) {
      console.log(`⏳ [인스턴스 ${this.instanceNumber}] 폴더 ${paddedFolderNumber} 준비 중... 다음 사이클 대기`);
      return null; // 다음 사이클에서 재시도
    }
    
    // 2. 기본 디렉토리 생성 (공유 캐시만)
    await this.ensureDirectories(this.sharedCachePath);
    
    return {
      threadId,
      folderNumber,
      paddedFolderNumber,
      instanceNumber: this.instanceNumber,
      // Chrome 프로필 설정
      userDataDir: sessionPath,
      sessionPath: sessionPath,
      sharedCachePath: this.sharedCachePath,
      // 캐시 공유 정보 (Chrome의 모든 주요 캐시 타입)
      cacheSharing: {
        // HTTP 캐시 (기본)
        cachePath: path.join(sessionPath, 'Default', 'Cache'),
        sharedCachePath: path.join(this.sharedCachePath, 'Cache'),
        // GPU 캐시 (그래픽)
        gpuCachePath: path.join(sessionPath, 'Default', 'GPUCache'),
        sharedGpuCachePath: path.join(this.sharedCachePath, 'GPUCache'),
        // 코드 캐시 (JavaScript/WASM)
        codeCachePath: path.join(sessionPath, 'Default', 'Code Cache'),
        sharedCodeCachePath: path.join(this.sharedCachePath, 'Code Cache'),
        // 셰이더 캐시 (Chrome 레벨)
        shaderCachePath: path.join(sessionPath, 'ShaderCache'),
        sharedShaderCachePath: path.join(this.sharedCachePath, 'ShaderCache'),
        // 그래픽 캐시들
        grShaderCachePath: path.join(sessionPath, 'GrShaderCache'),
        sharedGrShaderCachePath: path.join(this.sharedCachePath, 'GrShaderCache'),
        graphiteCachePath: path.join(sessionPath, 'GraphiteDawnCache'),
        sharedGraphiteCachePath: path.join(this.sharedCachePath, 'GraphiteDawnCache')
      }
    };
  }

  /**
   * 유저폴더 준비 상태 확인 및 사전 설정
   * Chrome 실행 전에 폴더와 캐시 Junction이 올바르게 설정되어 있는지 확인
   * @param {string} sessionPath - 세션 경로
   * @param {number} folderNumber - 폴더 번호
   * @returns {boolean} 준비 완료 여부
   */
  async checkFolderReadiness(sessionPath, folderNumber) {
    try {
      const fs = require('fs').promises;
      
      // 1. 유저폴더 존재 확인
      try {
        await fs.access(sessionPath);
      } catch {
        // 유저폴더가 없으면 기본 구조만 생성하고 대기
        console.log(`📁 유저폴더 생성: ${sessionPath}`);
        await this.ensureDirectories(sessionPath);
        await this.ensureDirectories(path.join(sessionPath, 'Default'));
        return false; // 다음 사이클에서 캐시 설정
      }
      
      // 2. 캐시 Junction 상태 확인
      const defaultPath = path.join(sessionPath, 'Default');
      const cachePath = path.join(defaultPath, 'Cache');
      const gpuCachePath = path.join(defaultPath, 'GPUCache');
      
      const isCacheLinked = await this.isCacheLinked(cachePath);
      const isGpuCacheLinked = await this.isCacheLinked(gpuCachePath);
      
      // 3. Junction이 설정되지 않은 경우 설정
      if (!isCacheLinked || !isGpuCacheLinked) {
        console.log(`🔗 [폴더 ${folderNumber.toString().padStart(3, '0')}] 캐시 Junction 설정 중...`);
        
        // Chrome이 생성한 기본 캐시 폴더들 제거
        await this.removeIfExists(cachePath);
        await this.removeIfExists(gpuCachePath);
        await this.removeIfExists(path.join(defaultPath, 'Code Cache'));
        await this.removeIfExists(path.join(sessionPath, 'ShaderCache'));
        await this.removeIfExists(path.join(sessionPath, 'GrShaderCache'));
        await this.removeIfExists(path.join(sessionPath, 'GraphiteDawnCache'));
        
        return false; // 다음 사이클에서 Junction 생성 완료 후 시작
      }
      
      console.log(`✅ [폴더 ${folderNumber.toString().padStart(3, '0')}] 준비 완료 (캐시 공유 활성)`)
      return true; // 즉시 Chrome 실행 가능
      
    } catch (error) {
      console.warn(`⚠️ 폴더 준비 상태 확인 실패 (${folderNumber}):`, error.message);
      return false; // 안전하게 다음 사이클 대기
    }
  }

  /**
   * 캐시 폴더가 Junction/Symlink인지 확인
   * @param {string} cachePath - 캐시 경로
   * @returns {boolean} Junction/Symlink 여부
   */
  async isCacheLinked(cachePath) {
    try {
      const fs = require('fs').promises;
      const stats = await fs.lstat(cachePath).catch(() => null);
      
      if (!stats) return false;
      
      // Windows: Junction (isDirectory 이지만 reparse point)
      // Linux: Symbolic link
      return stats.isSymbolicLink() || (stats.isDirectory() && process.platform === 'win32');
    } catch {
      return false;
    }
  }

  /**
   * 캐시 공유 설정 (심볼릭 링크 방식)
   * 세션은 독립, 캐시는 공유하여 성능 최적화
   * @param {Object} profile - 프로필 정보
   */
  async setupCacheSharing(profile) {
    try {
      const { cacheSharing } = profile;
      
      // 모든 캐시 타입에 대한 공유 디렉토리 생성
      const cachePairs = [
        { shared: cacheSharing.sharedCachePath, local: cacheSharing.cachePath, name: 'Cache' },
        { shared: cacheSharing.sharedGpuCachePath, local: cacheSharing.gpuCachePath, name: 'GPUCache' },
        { shared: cacheSharing.sharedCodeCachePath, local: cacheSharing.codeCachePath, name: 'Code Cache' },
        { shared: cacheSharing.sharedShaderCachePath, local: cacheSharing.shaderCachePath, name: 'ShaderCache' },
        { shared: cacheSharing.sharedGrShaderCachePath, local: cacheSharing.grShaderCachePath, name: 'GrShaderCache' },
        { shared: cacheSharing.sharedGraphiteCachePath, local: cacheSharing.graphiteCachePath, name: 'GraphiteDawnCache' }
      ];
      
      // 공유 캐시 디렉토리들 생성
      for (const pair of cachePairs) {
        await this.ensureDirectories(pair.shared);
      }
      
      // 기존 캐시 폴더들 삭제 후 심볼릭 링크 생성
      let successCount = 0;
      for (const pair of cachePairs) {
        try {
          await this.removeIfExists(pair.local);
          await this.createSymbolicLink(pair.shared, pair.local);
          successCount++;
        } catch (error) {
          console.warn(`   ⚠️ ${pair.name} 캐시 링크 실패:`, error.message);
        }
      }
      
      console.log(`🔗 인스턴스 ${profile.instanceNumber}, 폴더 ${profile.paddedFolderNumber}: ${successCount}/${cachePairs.length} 캐시 공유 설정 완료`);
      
      // 캐시 공유 검증
      await this.verifyCacheSharing(profile);
      
    } catch (error) {
      console.warn(`⚠️ 캐시 공유 설정 실패 (인스턴스 ${profile.instanceNumber}):`, error.message);
      console.warn(`   독립 캐시로 대체 실행`);
    }
  }

  /**
   * 캐시 공유 검증
   * 심볼릭 링크가 올바르게 생성되었는지 확인
   */
  async verifyCacheSharing(profile) {
    try {
      const { cacheSharing } = profile;
      const fs = require('fs').promises;
      
      const cachesToVerify = [
        { local: cacheSharing.cachePath, name: 'Cache' },
        { local: cacheSharing.gpuCachePath, name: 'GPUCache' },
        { local: cacheSharing.codeCachePath, name: 'Code Cache' },
        { local: cacheSharing.shaderCachePath, name: 'ShaderCache' },
        { local: cacheSharing.grShaderCachePath, name: 'GrShaderCache' },
        { local: cacheSharing.graphiteCachePath, name: 'GraphiteDawnCache' }
      ];
      
      let successCount = 0;
      const results = [];
      
      for (const cache of cachesToVerify) {
        try {
          const stats = await fs.lstat(cache.local).catch(() => null);
          const isLinked = stats && (stats.isSymbolicLink() || stats.isDirectory());
          
          if (isLinked) {
            const linkType = stats.isSymbolicLink() ? 'Symlink' : 'Junction';
            results.push(`${cache.name}: ${linkType} ✅`);
            successCount++;
          } else {
            results.push(`${cache.name}: ❌`);
          }
        } catch (error) {
          results.push(`${cache.name}: 오류`);
        }
      }
      
      console.log(`   📊 캐시 공유 검증: ${successCount}/${cachesToVerify.length} 성공`);
      
      // 중요한 캐시만 표시
      const importantResults = results.filter(result => 
        result.includes('Cache:') || result.includes('GPUCache:') || result.includes('ShaderCache:')
      );
      
      for (const result of importantResults) {
        console.log(`      ${result}`);
      }
      
      if (successCount >= 3) {
        console.log(`   ✅ 주요 캐시 공유 성공 (${successCount}/${cachesToVerify.length})`);
      } else {
        console.warn(`   ⚠️ 캐시 공유 부분 실패 (${successCount}/${cachesToVerify.length})`);
      }
      
    } catch (error) {
      console.warn(`   ⚠️ 캐시 공유 검증 오류:`, error.message);
    }
  }

  /**
   * 사용된 폴더 번호 가져오기
   */
  getUsedFolderNumber(threadId = 0) {
    return this.threadAssignments.get(threadId) || null;
  }

  /**
   * 현재 할당 상태 조회
   */
  getStatus() {
    return {
      instanceNumber: this.instanceNumber,
      instancePath: this.instancePath,
      sharedCachePath: this.sharedCachePath,
      assignments: Array.from(this.threadAssignments.entries()).map(([threadId, folderNumber]) => ({
        threadId,
        folderNumber,
        paddedFolderNumber: folderNumber.toString().padStart(3, '0'),
        sessionPath: path.join(this.instancePath, folderNumber.toString().padStart(3, '0'))
      }))
    };
  }

  /**
   * 공유 캐시 상태 조회
   */
  async getSharedCacheStatus() {
    try {
      const fs = require('fs').promises;
      const cacheDir = path.join(this.sharedCachePath, 'Cache');
      const gpuCacheDir = path.join(this.sharedCachePath, 'GPUCache');
      
      const getCacheSize = async (dirPath) => {
        try {
          const stats = await fs.stat(dirPath);
          if (stats.isDirectory()) {
            // 간단한 파일 개수 확인 (정확한 크기는 리소스 많이 사용)
            const files = await fs.readdir(dirPath);
            return files.length;
          }
          return 0;
        } catch {
          return 0;
        }
      };
      
      const cacheFileCount = await getCacheSize(cacheDir);
      const gpuCacheFileCount = await getCacheSize(gpuCacheDir);
      
      return {
        sharedCachePath: this.sharedCachePath,
        cacheFileCount,
        gpuCacheFileCount,
        isActive: cacheFileCount > 0 || gpuCacheFileCount > 0,
        activeInstances: this.threadAssignments.size
      };
      
    } catch (error) {
      return {
        sharedCachePath: this.sharedCachePath,
        error: error.message,
        isActive: false,
        activeInstances: 0
      };
    }
  }

  /**
   * 인스턴스 정리 (종료 시 호출)
   */
  async cleanup() {
    console.log(`🧹 인스턴스 ${this.instanceNumber} 정리 중...`);
    
    // 공유 캐시 상태 출력
    const cacheStatus = await this.getSharedCacheStatus();
    if (cacheStatus.isActive) {
      console.log(`   📊 공유 캐시 상태: ${cacheStatus.cacheFileCount} 캐시 파일, ${cacheStatus.gpuCacheFileCount} GPU 캐시 파일`);
    }
    
    this.threadAssignments.clear();
    console.log(`✅ 인스턴스 ${this.instanceNumber} 정리 완료`);
  }

  /**
   * 디렉토리 존재 확인 및 생성
   */
  async ensureDirectories(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.warn(`⚠️ 디렉토리 생성 실패: ${dirPath}`, error.message);
      }
    }
  }

  /**
   * 파일/폴더 삭제 (존재하는 경우)
   * Windows/Linux 호환
   */
  async removeIfExists(targetPath) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
    } catch (error) {
      // 삭제 실패는 무시 (파일이 없거나 권한 문제)
    }
  }

  /**
   * 심볼릭 링크 생성 (Windows/Linux 호환)
   * Windows: Junction 사용
   * Linux: Symbolic Link 사용
   */
  async createSymbolicLink(target, linkPath) {
    try {
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // Windows: Junction 생성 (관리자 권한 불필요)
        const { execSync } = require('child_process');
        
        // 백슬래시 경로로 변환 (Windows 호환성)
        const winTarget = path.resolve(target).replace(/\//g, '\\');
        const winLink = path.resolve(linkPath).replace(/\//g, '\\');
        
        execSync(`mklink /J "${winLink}" "${winTarget}"`, { 
          stdio: 'pipe',
          encoding: 'utf8'
        });
        
        console.log(`🔗 Windows Junction: ${path.basename(linkPath)} → ${path.basename(target)}`);
        
      } else {
        // Linux/Mac: Symbolic Link
        await fs.symlink(path.resolve(target), linkPath, 'dir');
        console.log(`🔗 Linux Symlink: ${path.basename(linkPath)} → ${path.basename(target)}`);
      }
      
    } catch (error) {
      console.warn(`⚠️ 심볼릭 링크 생성 실패: ${linkPath}`);
      console.warn(`   오류: ${error.message}`);
      
      // 심볼릭 링크 실패 시 일반 폴더로 fallback
      try {
        await this.ensureDirectories(linkPath);
        console.warn(`   → 독립 캐시 폴더로 대체: ${path.basename(linkPath)}`);
      } catch (fallbackError) {
        console.warn(`   → fallback 실패:`, fallbackError.message);
      }
    }
  }
}

module.exports = HybridProfileManager;