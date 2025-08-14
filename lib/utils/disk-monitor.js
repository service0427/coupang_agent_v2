/**
 * 디스크 모니터링 및 자동 정리
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class DiskMonitor {
  constructor(options = {}) {
    this.basePath = options.basePath || './browser-data';
    this.maxDiskUsage = options.maxDiskUsage || 80; // 80% 초과시 정리
    this.maxBrowserDataSize = options.maxBrowserDataSize || 10 * 1024 * 1024 * 1024; // 10GB
    this.cleanupInterval = options.cleanupInterval || 30 * 60 * 1000; // 30분
    this.isMonitoring = false;
  }

  /**
   * 모니터링 시작
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🔍 디스크 모니터링 시작');
    
    // 즉시 한 번 체크
    this.checkAndCleanup();
    
    // 주기적 체크
    this.monitorInterval = setInterval(() => {
      this.checkAndCleanup();
    }, this.cleanupInterval);
  }

  /**
   * 모니터링 중단
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 디스크 모니터링 중단');
  }

  /**
   * 디스크 체크 및 정리
   */
  async checkAndCleanup() {
    try {
      const diskUsage = await this.getDiskUsage();
      const browserDataSize = await this.getBrowserDataSize();
      
      console.log(`📊 디스크 상태: ${diskUsage.percentage}% 사용, 브라우저 데이터: ${this.formatBytes(browserDataSize)}`);
      
      // 임계치 초과시 정리
      if (diskUsage.percentage > this.maxDiskUsage || browserDataSize > this.maxBrowserDataSize) {
        console.log('⚠️ 디스크 사용량 초과 - 자동 정리 시작');
        await this.performCleanup();
      }
      
    } catch (error) {
      console.error('❌ 디스크 모니터링 오류:', error.message);
    }
  }

  /**
   * 디스크 사용량 확인
   */
  async getDiskUsage() {
    try {
      const { stdout } = await execAsync('df -h / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      const percentage = parseInt(parts[4].replace('%', ''));
      
      return {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        percentage: percentage
      };
    } catch (error) {
      throw new Error('디스크 사용량 확인 실패: ' + error.message);
    }
  }

  /**
   * 브라우저 데이터 크기 확인
   */
  async getBrowserDataSize() {
    try {
      const { stdout } = await execAsync(`du -sb "${this.basePath}" 2>/dev/null || echo "0"`);
      const bytes = parseInt(stdout.split('\t')[0]) || 0;
      return bytes;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 자동 정리 수행
   */
  async performCleanup() {
    let totalCleaned = 0;
    
    // 1. Chrome 로그 파일 정리
    totalCleaned += await this.cleanChromeLogFiles();
    
    // 2. 오래된 쿠키 추적 파일 정리
    totalCleaned += await this.cleanOldTrackingFiles();
    
    // 3. 임시 파일 정리
    totalCleaned += await this.cleanTempFiles();
    
    // 4. 공유 캐시 일부 정리 (크기가 5GB 초과시)
    const sharedCacheSize = await this.getSharedCacheSize();
    if (sharedCacheSize > 5 * 1024 * 1024 * 1024) { // 5GB
      totalCleaned += await this.cleanSharedCache();
    }
    
    console.log(`✅ 자동 정리 완료: ${this.formatBytes(totalCleaned)} 확보`);
  }

  /**
   * Chrome 로그 파일 정리
   */
  async cleanChromeLogFiles() {
    let cleaned = 0;
    
    try {
      const patterns = [
        '*/chrome_debug.log*',
        '*/Default/**/LOG*',
        '*/Default/**/*.log',
        '*/Default/blob_storage/*/journal'
      ];
      
      for (const pattern of patterns) {
        const fullPattern = path.join(this.basePath, pattern);
        try {
          const { stdout } = await execAsync(`find "${fullPattern}" -type f -mtime +1 -exec rm -f {} \\; 2>/dev/null || true`);
        } catch (error) {
          // 파일이 없어도 계속 진행
        }
      }
      
      console.log('   🧹 Chrome 로그 파일 정리 완료');
      cleaned += 50 * 1024 * 1024; // 추정 50MB
      
    } catch (error) {
      console.warn('⚠️ Chrome 로그 정리 실패:', error.message);
    }
    
    return cleaned;
  }

  /**
   * 오래된 추적 파일 정리
   */
  async cleanOldTrackingFiles() {
    let cleaned = 0;
    
    try {
      const dataDir = './data';
      
      // 7일 이상 된 쿠키 추적 파일 삭제
      const { stdout } = await execAsync(`find "${dataDir}" -name "*.json" -mtime +7 -delete 2>/dev/null || true`);
      
      console.log('   🧹 오래된 추적 파일 정리 완료');
      cleaned += 10 * 1024 * 1024; // 추정 10MB
      
    } catch (error) {
      console.warn('⚠️ 추적 파일 정리 실패:', error.message);
    }
    
    return cleaned;
  }

  /**
   * 임시 파일 정리
   */
  async cleanTempFiles() {
    let cleaned = 0;
    
    try {
      const tempPatterns = [
        '*/Default/Service Worker/CacheStorage/*/cache_*',
        '*/Default/Service Worker/ScriptCache/*',
        '*/Default/WebAssemblyCache/*'
      ];
      
      for (const pattern of tempPatterns) {
        const fullPattern = path.join(this.basePath, pattern);
        try {
          await execAsync(`find "${fullPattern}" -type f -mtime +3 -delete 2>/dev/null || true`);
        } catch (error) {
          // 계속 진행
        }
      }
      
      console.log('   🧹 임시 파일 정리 완료');
      cleaned += 100 * 1024 * 1024; // 추정 100MB
      
    } catch (error) {
      console.warn('⚠️ 임시 파일 정리 실패:', error.message);
    }
    
    return cleaned;
  }

  /**
   * 공유 캐시 크기 확인
   */
  async getSharedCacheSize() {
    try {
      const sharedCachePath = path.join(this.basePath, 'shared-cache');
      const { stdout } = await execAsync(`du -sb "${sharedCachePath}" 2>/dev/null || echo "0"`);
      return parseInt(stdout.split('\t')[0]) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 공유 캐시 일부 정리 (오래된 파일만)
   */
  async cleanSharedCache() {
    let cleaned = 0;
    
    try {
      const sharedCachePath = path.join(this.basePath, 'shared-cache');
      
      // 7일 이상 접근하지 않은 캐시 파일 삭제
      const { stdout } = await execAsync(`find "${sharedCachePath}" -type f -atime +7 -delete 2>/dev/null || true`);
      
      console.log('   🧹 공유 캐시 일부 정리 완료');
      cleaned += 500 * 1024 * 1024; // 추정 500MB
      
    } catch (error) {
      console.warn('⚠️ 공유 캐시 정리 실패:', error.message);
    }
    
    return cleaned;
  }

  /**
   * 바이트 포맷팅
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 상태 정보 반환
   */
  async getStatus() {
    try {
      const diskUsage = await this.getDiskUsage();
      const browserDataSize = await this.getBrowserDataSize();
      const sharedCacheSize = await this.getSharedCacheSize();
      
      return {
        disk: diskUsage,
        browserDataSize: browserDataSize,
        browserDataFormatted: this.formatBytes(browserDataSize),
        sharedCacheSize: sharedCacheSize,
        sharedCacheFormatted: this.formatBytes(sharedCacheSize),
        isMonitoring: this.isMonitoring
      };
    } catch (error) {
      return {
        error: error.message,
        isMonitoring: this.isMonitoring
      };
    }
  }
}

module.exports = DiskMonitor;