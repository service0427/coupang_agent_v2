/**
 * 로그 로테이션 및 관리
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class LogRotator {
  constructor(options = {}) {
    this.maxLogSize = options.maxLogSize || 100 * 1024 * 1024; // 100MB
    this.maxLogFiles = options.maxLogFiles || 5; // 최대 5개 백업
    this.maxLogAge = options.maxLogAge || 7 * 24 * 60 * 60 * 1000; // 7일
    this.checkInterval = options.checkInterval || 60 * 60 * 1000; // 1시간
    this.logDirs = options.logDirs || ['./logs', './data'];
    this.isRunning = false;
  }

  /**
   * 로그 로테이션 시작
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('📋 로그 로테이션 시작');
    
    // 즉시 체크
    this.rotateAllLogs();
    
    // 주기적 체크
    this.rotateInterval = setInterval(() => {
      this.rotateAllLogs();
    }, this.checkInterval);
  }

  /**
   * 로그 로테이션 중단
   */
  stop() {
    if (this.rotateInterval) {
      clearInterval(this.rotateInterval);
      this.rotateInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 로그 로테이션 중단');
  }

  /**
   * 모든 로그 디렉토리 체크
   */
  async rotateAllLogs() {
    try {
      let totalCleaned = 0;
      let totalFiles = 0;
      
      for (const logDir of this.logDirs) {
        const result = await this.rotateDirectory(logDir);
        totalCleaned += result.cleaned;
        totalFiles += result.processed;
      }
      
      if (totalFiles > 0) {
        console.log(`📋 로그 로테이션 완료: ${totalFiles}개 파일 처리, ${this.formatBytes(totalCleaned)} 정리`);
      }
      
    } catch (error) {
      console.error('❌ 로그 로테이션 오류:', error.message);
    }
  }

  /**
   * 디렉토리별 로그 로테이션
   */
  async rotateDirectory(dirPath) {
    let cleaned = 0;
    let processed = 0;
    
    try {
      // 디렉토리 존재 확인
      await fs.access(dirPath);
      
      // 로그 파일 찾기
      const logFiles = await this.findLogFiles(dirPath);
      
      for (const logFile of logFiles) {
        const stats = await fs.stat(logFile);
        processed++;
        
        // 크기 체크
        if (stats.size > this.maxLogSize) {
          await this.rotateLogFile(logFile);
          cleaned += stats.size;
        }
        
        // 나이 체크
        const age = Date.now() - stats.mtime.getTime();
        if (age > this.maxLogAge) {
          await fs.unlink(logFile);
          cleaned += stats.size;
          console.log(`   🗑️ 오래된 로그 삭제: ${path.basename(logFile)}`);
        }
      }
      
      // 백업 파일 정리
      await this.cleanupBackups(dirPath);
      
    } catch (error) {
      // 디렉토리가 없거나 접근할 수 없으면 무시
    }
    
    return { cleaned, processed };
  }

  /**
   * 로그 파일 찾기
   */
  async findLogFiles(dirPath) {
    const logFiles = [];
    
    try {
      const files = await fs.readdir(dirPath, { recursive: true });
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.isFile() && this.isLogFile(file)) {
            logFiles.push(filePath);
          }
        } catch (error) {
          // 파일 접근 불가시 무시
        }
      }
    } catch (error) {
      // 디렉토리 읽기 실패시 무시
    }
    
    return logFiles;
  }

  /**
   * 로그 파일 여부 판단
   */
  isLogFile(filename) {
    const logExtensions = ['.log', '.txt', '.json'];
    const logPatterns = [
      /\.log$/i,
      /\.txt$/i,
      /\.json$/i,
      /chrome.*\.log/i,
      /debug.*\.log/i,
      /error.*\.log/i
    ];
    
    return logPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * 로그 파일 로테이션
   */
  async rotateLogFile(logFile) {
    try {
      const ext = path.extname(logFile);
      const base = logFile.slice(0, -ext.length);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const rotatedFile = `${base}.${timestamp}${ext}`;
      
      // 파일 이동
      await fs.rename(logFile, rotatedFile);
      
      // 새 로그 파일 생성 (필요시)
      await fs.writeFile(logFile, '');
      
      console.log(`   🔄 로그 로테이션: ${path.basename(logFile)} → ${path.basename(rotatedFile)}`);
      
    } catch (error) {
      console.warn(`⚠️ 로그 로테이션 실패: ${logFile}`, error.message);
    }
  }

  /**
   * 오래된 백업 파일 정리
   */
  async cleanupBackups(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      const backupGroups = new Map();
      
      // 백업 파일 그룹화
      for (const file of files) {
        const match = file.match(/^(.+)\.(\d{8}T\d{6})(\..+)$/);
        if (match) {
          const [, base, timestamp, ext] = match;
          const baseFile = base + ext;
          
          if (!backupGroups.has(baseFile)) {
            backupGroups.set(baseFile, []);
          }
          
          backupGroups.get(baseFile).push({
            file: file,
            path: path.join(dirPath, file),
            timestamp: timestamp
          });
        }
      }
      
      // 각 그룹별로 오래된 백업 삭제
      for (const [baseFile, backups] of backupGroups) {
        if (backups.length > this.maxLogFiles) {
          // 타임스탬프 기준 정렬 (오래된 것부터)
          backups.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          
          // 초과분 삭제
          const toDelete = backups.slice(0, backups.length - this.maxLogFiles);
          for (const backup of toDelete) {
            await fs.unlink(backup.path);
            console.log(`   🗑️ 백업 파일 삭제: ${backup.file}`);
          }
        }
      }
      
    } catch (error) {
      console.warn(`⚠️ 백업 파일 정리 실패: ${dirPath}`, error.message);
    }
  }

  /**
   * 로그 통계
   */
  async getLogStats() {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      oldestFile: null,
      largestFile: null,
      directories: []
    };
    
    try {
      for (const logDir of this.logDirs) {
        const dirStats = await this.getDirectoryStats(logDir);
        stats.directories.push(dirStats);
        stats.totalFiles += dirStats.fileCount;
        stats.totalSize += dirStats.totalSize;
        
        if (!stats.oldestFile || (dirStats.oldestFile && dirStats.oldestFile.age > stats.oldestFile.age)) {
          stats.oldestFile = dirStats.oldestFile;
        }
        
        if (!stats.largestFile || (dirStats.largestFile && dirStats.largestFile.size > stats.largestFile.size)) {
          stats.largestFile = dirStats.largestFile;
        }
      }
      
      stats.totalSizeFormatted = this.formatBytes(stats.totalSize);
      
    } catch (error) {
      stats.error = error.message;
    }
    
    return stats;
  }

  /**
   * 디렉토리 통계
   */
  async getDirectoryStats(dirPath) {
    const stats = {
      path: dirPath,
      fileCount: 0,
      totalSize: 0,
      oldestFile: null,
      largestFile: null
    };
    
    try {
      const logFiles = await this.findLogFiles(dirPath);
      stats.fileCount = logFiles.length;
      
      for (const logFile of logFiles) {
        try {
          const fileStats = await fs.stat(logFile);
          stats.totalSize += fileStats.size;
          
          const age = Date.now() - fileStats.mtime.getTime();
          
          if (!stats.oldestFile || age > stats.oldestFile.age) {
            stats.oldestFile = {
              path: logFile,
              age: age,
              ageFormatted: this.formatAge(age)
            };
          }
          
          if (!stats.largestFile || fileStats.size > stats.largestFile.size) {
            stats.largestFile = {
              path: logFile,
              size: fileStats.size,
              sizeFormatted: this.formatBytes(fileStats.size)
            };
          }
        } catch (error) {
          // 파일 접근 불가시 무시
        }
      }
      
      stats.totalSizeFormatted = this.formatBytes(stats.totalSize);
      
    } catch (error) {
      stats.error = error.message;
    }
    
    return stats;
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
   * 시간 포맷팅
   */
  formatAge(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}일`;
    if (hours > 0) return `${hours}시간`;
    if (minutes > 0) return `${minutes}분`;
    return `${seconds}초`;
  }

  /**
   * 상태 조회
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      maxLogSize: this.formatBytes(this.maxLogSize),
      maxLogFiles: this.maxLogFiles,
      maxLogAge: this.formatAge(this.maxLogAge),
      logDirs: this.logDirs
    };
  }
}

module.exports = LogRotator;