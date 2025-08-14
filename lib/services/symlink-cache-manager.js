/**
 * 심볼릭 링크 기반 캐시 매니저
 * TLS 차단 감지시 캐시를 동적으로 전환하는 시스템
 * 
 * 구조:
 * browser-data/
 * ├── cache-pools/           ← 실제 캐시 저장소
 * │   ├── cache-001/
 * │   ├── cache-002/
 * │   ├── cache-003/
 * │   └── ...
 * ├── instance1/
 * │   ├── 001/
 * │   │   └── Default/
 * │   │       ├── Cache -> ../../cache-pools/cache-001/Cache (심볼릭 링크)
 * │   │       ├── GPUCache -> ../../cache-pools/cache-001/GPUCache
 * │   │       └── ...
 * │   └── 002/
 * └── current-cache-mapping.json  ← 현재 캐시 매핑 상태
 */

const path = require('path');
const fs = require('fs').promises;

class SymlinkCacheManager {
  constructor(config = {}) {
    this.basePath = config.basePath || './browser-data';
    this.cachePoolsPath = path.join(this.basePath, 'cache-pools');
    this.mappingFile = path.join(this.basePath, 'current-cache-mapping.json');
    this.maxCachePools = config.maxCachePools || 10; // 최대 10개 캐시 풀
    
    // 현재 캐시 매핑 상태 (인메모리)
    this.currentMappings = new Map(); // userFolderPath -> cachePoolNumber
    this.blockedCaches = new Set(); // 차단된 캐시 풀 번호들
    this.currentCachePool = 1; // 현재 사용 중인 캐시 풀
    
    console.log('🔗 SymlinkCacheManager 초기화');
    console.log(`   기본 경로: ${this.basePath}`);
    console.log(`   캐시 풀 경로: ${this.cachePoolsPath}`);
    console.log(`   최대 캐시 풀: ${this.maxCachePools}개`);
  }

  /**
   * 초기화 - 캐시 풀 디렉토리 및 매핑 파일 생성
   */
  async initialize() {
    try {
      // 1. 캐시 풀 디렉토리 생성
      await fs.mkdir(this.cachePoolsPath, { recursive: true });
      
      // 2. 기존 매핑 로드
      await this.loadCurrentMappings();
      
      // 3. 초기 캐시 풀 생성
      await this.ensureCachePool(this.currentCachePool);
      
      console.log('✅ SymlinkCacheManager 초기화 완료');
      console.log(`   현재 캐시 풀: cache-${this.currentCachePool.toString().padStart(3, '0')}`);
      console.log(`   차단된 캐시: ${Array.from(this.blockedCaches).join(', ') || '없음'}`);
      
    } catch (error) {
      console.error('❌ SymlinkCacheManager 초기화 실패:', error.message);
      throw error;
    }
  }

  /**
   * 유저 폴더에 캐시 심볼릭 링크 설정
   * @param {string} userFolderPath - 유저 폴더 경로 (예: ./browser-data/instance1/001)
   * @param {number|null} specificCachePool - 특정 캐시 풀 번호 (null이면 현재 활성 캐시 사용)
   */
  async setupCacheLinks(userFolderPath, specificCachePool = null) {
    const targetCachePool = specificCachePool || this.currentCachePool;
    
    try {
      console.log(`🔗 캐시 링크 설정: ${userFolderPath} → cache-${targetCachePool.toString().padStart(3, '0')}`);
      
      // 1. 캐시 풀이 존재하는지 확인하고 생성
      await this.ensureCachePool(targetCachePool);
      
      // 2. 유저 폴더의 Default 디렉토리 생성
      const defaultPath = path.join(userFolderPath, 'Default');
      await fs.mkdir(defaultPath, { recursive: true });
      
      // 3. 각 캐시 타입별 심볼릭 링크 생성
      const cacheTypes = [
        'Cache',           // HTTP 캐시
        'GPUCache',        // GPU 캐시
        'Code Cache',      // JavaScript/WASM 캐시
        'DawnCache',       // WebGPU 캐시
        'ShaderCache',     // 셰이더 캐시
        'GrShaderCache',   // Graphics 셰이더 캐시
        'GraphiteDawnCache' // Graphite Dawn 캐시
      ];
      
      for (const cacheType of cacheTypes) {
        await this.createCacheSymlink(defaultPath, targetCachePool, cacheType);
      }
      
      // 4. 매핑 정보 업데이트
      this.currentMappings.set(userFolderPath, targetCachePool);
      await this.saveMappings();
      
      console.log(`✅ 캐시 링크 설정 완료: ${path.basename(userFolderPath)} ← cache-${targetCachePool.toString().padStart(3, '0')}`);
      
      return {
        userFolderPath,
        cachePoolNumber: targetCachePool,
        cachePoolPath: this.getCachePoolPath(targetCachePool)
      };
      
    } catch (error) {
      console.error(`❌ 캐시 링크 설정 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * TLS 차단 감지시 캐시 전환
   * @param {string} userFolderPath - 차단된 유저 폴더 경로
   * @returns {number} 새로운 캐시 풀 번호
   */
  async switchCacheOnBlock(userFolderPath) {
    const currentCachePool = this.currentMappings.get(userFolderPath);
    
    if (currentCachePool) {
      console.log(`🚫 TLS 차단 감지: cache-${currentCachePool.toString().padStart(3, '0')} 차단됨`);
      this.blockedCaches.add(currentCachePool);
    }
    
    // 새로운 캐시 풀 찾기
    const newCachePool = this.findNextAvailableCachePool();
    console.log(`🔄 캐시 전환: ${path.basename(userFolderPath)} → cache-${newCachePool.toString().padStart(3, '0')}`);
    
    // 기존 캐시 링크 제거 및 새 링크 생성
    await this.removeCacheLinks(userFolderPath);
    await this.setupCacheLinks(userFolderPath, newCachePool);
    
    return newCachePool;
  }

  /**
   * 사용 가능한 다음 캐시 풀 번호 찾기
   */
  findNextAvailableCachePool() {
    for (let i = 1; i <= this.maxCachePools; i++) {
      if (!this.blockedCaches.has(i)) {
        this.currentCachePool = i;
        return i;
      }
    }
    
    // 모든 캐시가 차단된 경우 가장 오래된 차단 해제
    console.warn('⚠️ 모든 캐시 풀이 차단됨 - 가장 오래된 캐시 풀 재사용');
    const oldestBlocked = Math.min(...Array.from(this.blockedCaches));
    this.blockedCaches.delete(oldestBlocked);
    this.currentCachePool = oldestBlocked;
    return oldestBlocked;
  }

  /**
   * 특정 캐시 풀 디렉토리 생성
   */
  async ensureCachePool(poolNumber) {
    const poolPath = this.getCachePoolPath(poolNumber);
    await fs.mkdir(poolPath, { recursive: true });
    
    // 각 캐시 타입 디렉토리 생성
    const cacheTypes = ['Cache', 'GPUCache', 'Code Cache', 'DawnCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache'];
    for (const cacheType of cacheTypes) {
      await fs.mkdir(path.join(poolPath, cacheType), { recursive: true });
    }
  }

  /**
   * 단일 캐시 타입에 대한 심볼릭 링크 생성
   */
  async createCacheSymlink(defaultPath, cachePoolNumber, cacheType) {
    const targetPath = path.join(defaultPath, cacheType);
    const sourcePath = path.join(this.getCachePoolPath(cachePoolNumber), cacheType);
    
    try {
      // 기존 링크나 디렉토리 제거
      try {
        const stat = await fs.lstat(targetPath);
        if (stat.isSymbolicLink()) {
          await fs.unlink(targetPath);
        } else if (stat.isDirectory()) {
          await fs.rm(targetPath, { recursive: true, force: true });
        }
      } catch (error) {
        // 파일이 존재하지 않으면 무시
      }
      
      // 상대 경로로 심볼릭 링크 생성 (../../cache-pools/cache-001/Cache)
      const relativePath = path.relative(defaultPath, sourcePath);
      await fs.symlink(relativePath, targetPath, 'dir');
      
    } catch (error) {
      // 심볼릭 링크 생성 실패시 일반 디렉토리로 폴백
      console.warn(`⚠️ 심볼릭 링크 생성 실패, 일반 디렉토리 생성: ${cacheType}`);
      await fs.mkdir(targetPath, { recursive: true });
    }
  }

  /**
   * 유저 폴더의 모든 캐시 링크 제거
   */
  async removeCacheLinks(userFolderPath) {
    const defaultPath = path.join(userFolderPath, 'Default');
    const cacheTypes = ['Cache', 'GPUCache', 'Code Cache', 'DawnCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache'];
    
    for (const cacheType of cacheTypes) {
      const linkPath = path.join(defaultPath, cacheType);
      try {
        const stat = await fs.lstat(linkPath);
        if (stat.isSymbolicLink()) {
          await fs.unlink(linkPath);
        }
      } catch (error) {
        // 링크가 존재하지 않으면 무시
      }
    }
  }

  /**
   * 캐시 풀 경로 생성
   */
  getCachePoolPath(poolNumber) {
    return path.join(this.cachePoolsPath, `cache-${poolNumber.toString().padStart(3, '0')}`);
  }

  /**
   * 현재 매핑 정보 로드
   */
  async loadCurrentMappings() {
    try {
      const data = await fs.readFile(this.mappingFile, 'utf8');
      const mappingData = JSON.parse(data);
      
      // Map 객체로 복원
      this.currentMappings = new Map(mappingData.mappings || []);
      this.blockedCaches = new Set(mappingData.blockedCaches || []);
      this.currentCachePool = mappingData.currentCachePool || 1;
      
      console.log(`📋 기존 매핑 로드: ${this.currentMappings.size}개 폴더, ${this.blockedCaches.size}개 차단`);
      
    } catch (error) {
      // 파일이 없으면 기본값 사용
      console.log('📋 새로운 매핑 파일 생성');
    }
  }

  /**
   * 현재 매핑 정보 저장
   */
  async saveMappings() {
    try {
      const mappingData = {
        mappings: Array.from(this.currentMappings.entries()),
        blockedCaches: Array.from(this.blockedCaches),
        currentCachePool: this.currentCachePool,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(this.mappingFile, JSON.stringify(mappingData, null, 2));
    } catch (error) {
      console.warn('⚠️ 매핑 파일 저장 실패:', error.message);
    }
  }

  /**
   * 차단된 캐시 풀 정리 (오래된 차단 해제)
   * @param {number} maxAge - 최대 차단 유지 시간 (밀리초)
   */
  async cleanupBlockedCaches(maxAge = 24 * 60 * 60 * 1000) {
    // 구현 시 필요하면 타임스탬프 기반으로 정리
    console.log('🧹 차단된 캐시 정리 (추후 타임스탬프 기반 구현 예정)');
  }

  /**
   * 상태 정보 반환
   */
  getStatus() {
    return {
      currentCachePool: this.currentCachePool,
      totalMappings: this.currentMappings.size,
      blockedCaches: Array.from(this.blockedCaches),
      availableCaches: Array.from({length: this.maxCachePools}, (_, i) => i + 1)
        .filter(i => !this.blockedCaches.has(i))
    };
  }
}

module.exports = SymlinkCacheManager;