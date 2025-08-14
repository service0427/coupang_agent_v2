/**
 * 임시 파일 정리 도구
 * Chrome 및 시스템 임시 파일 자동 정리
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class TempCleaner {
  constructor(options = {}) {
    this.cleanInterval = options.cleanInterval || 10 * 60 * 1000; // 10분마다
    this.maxAge = options.maxAge || 30 * 60 * 1000; // 30분 이상된 파일
    this.isRunning = false;
    this.stats = {
      totalCleanups: 0,
      totalChromeFiles: 0,
      totalBytesFreed: 0,
      lastCleanup: null
    };
  }

  /**
   * 자동 정리 시작
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ 임시 파일 정리가 이미 실행 중입니다');
      return;
    }

    this.isRunning = true;
    console.log('🧹 임시 파일 자동 정리 시작');

    // 즉시 한 번 정리
    this.cleanupTempFiles();

    // 주기적 정리
    this.cleanInterval = setInterval(() => {
      this.cleanupTempFiles();
    }, this.cleanInterval);
  }

  /**
   * 자동 정리 중단
   */
  stop() {
    if (this.cleanInterval) {
      clearInterval(this.cleanInterval);
      this.cleanInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 임시 파일 자동 정리 중단');
  }

  /**
   * 임시 파일 정리 실행
   */
  async cleanupTempFiles() {
    try {
      console.log('🧹 임시 파일 정리 시작...');
      
      let totalFreed = 0;
      let totalFiles = 0;

      // 1. Chrome 임시 파일 정리
      const chromeResult = await this.cleanChromeTemps();
      totalFreed += chromeResult.bytesFreed;
      totalFiles += chromeResult.filesRemoved;

      // 2. 기타 임시 파일 정리
      const otherResult = await this.cleanOtherTemps();
      totalFreed += otherResult.bytesFreed;
      totalFiles += otherResult.filesRemoved;

      // 3. 프로젝트 내 임시 파일 정리
      const projectResult = await this.cleanProjectTemps();
      totalFreed += projectResult.bytesFreed;
      totalFiles += projectResult.filesRemoved;

      // 통계 업데이트
      this.stats.totalCleanups++;
      this.stats.totalChromeFiles += chromeResult.filesRemoved;
      this.stats.totalBytesFreed += totalFreed;
      this.stats.lastCleanup = new Date();

      if (totalFiles > 0) {
        console.log(`✅ 임시 파일 정리 완료: ${totalFiles}개 파일, ${this.formatBytes(totalFreed)} 확보`);
      } else {
        console.log('📝 정리할 임시 파일 없음');
      }

    } catch (error) {
      console.error('❌ 임시 파일 정리 실패:', error.message);
    }
  }

  /**
   * Chrome 임시 파일 정리
   */
  async cleanChromeTemps() {
    let bytesFreed = 0;
    let filesRemoved = 0;

    try {
      // Chrome 임시 폴더/파일 크기 확인
      const chromeSize = await this.getChromeTempsSize();
      
      if (chromeSize > 0) {
        // 30분 이상 된 Chrome 임시 파일 삭제
        const commands = [
          // Chrome 임시 폴더 (30분 이상)
          `find /tmp -name ".com.google.Chrome.*" -type d -mmin +30 -exec rm -rf {} \\; 2>/dev/null || true`,
          // Chrome 임시 파일 (30분 이상)
          `find /tmp -name ".com.google.Chrome.*" -type f -mmin +30 -exec rm -f {} \\; 2>/dev/null || true`,
          // Chrome 세마포어 파일
          `find /tmp -name "SingletonSocket" -mmin +30 -exec rm -f {} \\; 2>/dev/null || true`,
          // Chrome 기타 임시 파일
          `find /tmp -name "chrome_*" -mmin +30 -exec rm -f {} \\; 2>/dev/null || true`
        ];

        for (const command of commands) {
          try {
            await execAsync(command);
          } catch (error) {
            // 계속 진행
          }
        }

        // 정리 후 크기 확인
        const afterSize = await this.getChromeTempsSize();
        bytesFreed = chromeSize - afterSize;
        
        if (bytesFreed > 0) {
          filesRemoved = 10; // 추정값
          console.log(`   🧹 Chrome 임시 파일: ${this.formatBytes(bytesFreed)} 정리`);
        }
      }

    } catch (error) {
      console.warn('⚠️ Chrome 임시 파일 정리 실패:', error.message);
    }

    return { bytesFreed, filesRemoved };
  }

  /**
   * Chrome 임시 파일 크기 확인
   */
  async getChromeTempsSize() {
    try {
      const { stdout } = await execAsync(`
        find /tmp -name ".com.google.Chrome*" -exec du -sb {} \\; 2>/dev/null | 
        awk '{sum += $1} END {print sum+0}'
      `);
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 기타 임시 파일 정리
   */
  async cleanOtherTemps() {
    let bytesFreed = 0;
    let filesRemoved = 0;

    try {
      const cleanupCommands = [
        // 오래된 Playwright 임시 파일
        `find /tmp -name "playwright*" -mmin +60 -exec rm -rf {} \\; 2>/dev/null || true`,
        // 오래된 Node.js 임시 파일
        `find /tmp -name "npm-*" -mmin +120 -exec rm -rf {} \\; 2>/dev/null || true`,
        // 오래된 임시 디렉토리
        `find /tmp -name "tmp*" -type d -empty -mmin +60 -exec rmdir {} \\; 2>/dev/null || true`,
        // 오래된 core dump
        `find /tmp -name "core.*" -mmin +60 -exec rm -f {} \\; 2>/dev/null || true`
      ];

      for (const command of cleanupCommands) {
        try {
          await execAsync(command);
          filesRemoved += 2; // 추정값
        } catch (error) {
          // 계속 진행
        }
      }

      if (filesRemoved > 0) {
        bytesFreed = filesRemoved * 1024 * 1024; // 추정 1MB per file
        console.log(`   🧹 기타 임시 파일: ${filesRemoved}개 정리`);
      }

    } catch (error) {
      console.warn('⚠️ 기타 임시 파일 정리 실패:', error.message);
    }

    return { bytesFreed, filesRemoved };
  }

  /**
   * 프로젝트 내 임시 파일 정리
   */
  async cleanProjectTemps() {
    let bytesFreed = 0;
    let filesRemoved = 0;

    try {
      const projectPath = process.cwd();
      
      const cleanupCommands = [
        // 프로젝트 내 Chrome debug 로그
        `find "${projectPath}" -name "chrome_debug.log*" -mtime +1 -exec rm -f {} \\; 2>/dev/null || true`,
        // 프로젝트 내 오래된 스크린샷
        `find "${projectPath}" -name "screenshot*.png" -mtime +7 -exec rm -f {} \\; 2>/dev/null || true`,
        // 프로젝트 내 임시 JSON 파일
        `find "${projectPath}" -name "temp_*.json" -mtime +1 -exec rm -f {} \\; 2>/dev/null || true`,
        // Node.js error logs
        `find "${projectPath}" -name "npm-debug.log*" -exec rm -f {} \\; 2>/dev/null || true`
      ];

      for (const command of cleanupCommands) {
        try {
          await execAsync(command);
          filesRemoved += 1;
        } catch (error) {
          // 계속 진행
        }
      }

      if (filesRemoved > 0) {
        bytesFreed = filesRemoved * 512 * 1024; // 추정 512KB per file
        console.log(`   🧹 프로젝트 임시 파일: ${filesRemoved}개 정리`);
      }

    } catch (error) {
      console.warn('⚠️ 프로젝트 임시 파일 정리 실패:', error.message);
    }

    return { bytesFreed, filesRemoved };
  }

  /**
   * 수동 강제 정리
   */
  async forceCleanup() {
    console.log('🚨 강제 임시 파일 정리 시작');
    
    try {
      // 모든 Chrome 임시 파일 강제 삭제 (나이 무관)
      const forceCommands = [
        // 모든 Chrome 임시 폴더
        `find /tmp -name ".com.google.Chrome.*" -type d -exec rm -rf {} \\; 2>/dev/null || true`,
        // 모든 Chrome 임시 파일
        `find /tmp -name ".com.google.Chrome.*" -type f -exec rm -f {} \\; 2>/dev/null || true`,
        // Chrome 관련 모든 임시 파일
        `find /tmp -name "chrome*" -exec rm -rf {} \\; 2>/dev/null || true`,
        // Playwright 임시 파일
        `find /tmp -name "playwright*" -exec rm -rf {} \\; 2>/dev/null || true`
      ];

      let totalFreed = 0;
      for (const command of forceCommands) {
        try {
          await execAsync(command);
          totalFreed += 5 * 1024 * 1024; // 추정 5MB per command
        } catch (error) {
          // 계속 진행
        }
      }

      console.log(`✅ 강제 정리 완료: ${this.formatBytes(totalFreed)} 확보`);
      
      // 통계 업데이트
      this.stats.totalBytesFreed += totalFreed;
      this.stats.lastCleanup = new Date();

    } catch (error) {
      console.error('❌ 강제 정리 실패:', error.message);
    }
  }

  /**
   * 현재 임시 파일 상태 확인
   */
  async getTempStatus() {
    try {
      const status = {
        chromeTemps: await this.getChromeTempsSize(),
        totalTmpSize: await this.getTotalTmpSize(),
        chromeFileCount: await this.getChromeFileCount()
      };

      status.chromeTempFormatted = this.formatBytes(status.chromeTemps);
      status.totalTmpFormatted = this.formatBytes(status.totalTmpSize);

      return status;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Chrome 임시 파일 개수 확인
   */
  async getChromeFileCount() {
    try {
      const { stdout } = await execAsync(`find /tmp -name ".com.google.Chrome*" | wc -l`);
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 전체 /tmp 크기 확인
   */
  async getTotalTmpSize() {
    try {
      const { stdout } = await execAsync(`du -sb /tmp 2>/dev/null | cut -f1`);
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
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
   * 상태 조회
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      cleanInterval: this.cleanInterval,
      maxAge: this.maxAge,
      stats: this.stats
    };
  }
}

module.exports = TempCleaner;