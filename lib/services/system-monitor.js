/**
 * 통합 시스템 모니터링
 * 디스크, 메모리, 로그를 통합 관리
 */

const DiskMonitor = require('../utils/disk-monitor');
const MemoryMonitor = require('../utils/memory-monitor');
const LogRotator = require('../utils/log-rotator');
const TempCleaner = require('../utils/temp-cleaner');

class SystemMonitor {
  constructor(options = {}) {
    this.options = options;
    
    // 각 모니터 초기화
    this.diskMonitor = new DiskMonitor({
      basePath: options.basePath || './browser-data',
      maxDiskUsage: options.maxDiskUsage || 80,
      maxBrowserDataSize: options.maxBrowserDataSize || 10 * 1024 * 1024 * 1024, // 10GB
      cleanupInterval: options.diskCleanupInterval || 30 * 60 * 1000 // 30분
    });
    
    this.memoryMonitor = new MemoryMonitor({
      maxMemoryUsage: options.maxMemoryUsage || 85,
      maxChromeProcesses: options.maxChromeProcesses || 50,
      checkInterval: options.memoryCheckInterval || 5 * 60 * 1000 // 5분
    });
    
    this.logRotator = new LogRotator({
      maxLogSize: options.maxLogSize || 100 * 1024 * 1024, // 100MB
      maxLogFiles: options.maxLogFiles || 5,
      maxLogAge: options.maxLogAge || 7 * 24 * 60 * 60 * 1000, // 7일
      checkInterval: options.logCheckInterval || 60 * 60 * 1000, // 1시간
      logDirs: options.logDirs || ['./logs', './data']
    });
    
    this.tempCleaner = new TempCleaner({
      cleanInterval: options.tempCleanInterval || 10 * 60 * 1000, // 10분
      maxAge: options.tempMaxAge || 30 * 60 * 1000 // 30분
    });
    
    this.isRunning = false;
    this.startTime = null;
    
    // 통계
    this.stats = {
      startTime: null,
      uptime: 0,
      totalAlerts: 0,
      diskCleanups: 0,
      memoryCleanups: 0,
      logRotations: 0,
      tempCleanups: 0
    };
  }

  /**
   * 모니터링 시작
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ 시스템 모니터링이 이미 실행 중입니다');
      return;
    }
    
    console.log('🔧 통합 시스템 모니터링 시작');
    console.log('   📊 디스크 모니터링');
    console.log('   🧠 메모리 모니터링');
    console.log('   📋 로그 로테이션');
    console.log('   🧹 임시 파일 정리');
    
    this.isRunning = true;
    this.startTime = new Date();
    this.stats.startTime = this.startTime;
    
    // 각 모니터 시작
    this.diskMonitor.startMonitoring();
    this.memoryMonitor.startMonitoring();
    this.logRotator.start();
    this.tempCleaner.start();
    
    // 전체 상태 리포트 (30분마다)
    this.reportInterval = setInterval(() => {
      this.generateStatusReport();
    }, 30 * 60 * 1000);
    
    // 즉시 상태 체크
    setTimeout(() => {
      this.generateStatusReport();
    }, 5000);
    
    console.log('✅ 통합 시스템 모니터링 시작 완료');
  }

  /**
   * 모니터링 중단
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ 시스템 모니터링이 실행 중이 아닙니다');
      return;
    }
    
    console.log('🛑 통합 시스템 모니터링 중단');
    
    // 각 모니터 중단
    this.diskMonitor.stopMonitoring();
    this.memoryMonitor.stopMonitoring();
    this.logRotator.stop();
    this.tempCleaner.stop();
    
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    
    this.isRunning = false;
    
    // 최종 리포트
    await this.generateStatusReport(true);
    
    console.log('✅ 통합 시스템 모니터링 중단 완료');
  }

  /**
   * 상태 리포트 생성
   */
  async generateStatusReport(isFinal = false) {
    try {
      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
      this.stats.uptime = uptime;
      
      // 각 모니터 상태 수집
      const diskStatus = await this.diskMonitor.getStatus();
      const memoryStatus = await this.memoryMonitor.getSystemInfo();
      const logStatus = await this.logRotator.getLogStats();
      const tempStatus = await this.tempCleaner.getTempStatus();
      
      const reportType = isFinal ? '최종' : '정기';
      
      console.log(`\n📊 ${reportType} 시스템 상태 리포트`);
      console.log('═'.repeat(60));
      console.log(`⏱️  가동 시간: ${this.formatUptime(uptime)}`);
      console.log(`💾  디스크 사용량: ${diskStatus.disk?.percentage || 'N/A'}%`);
      console.log(`📂  브라우저 데이터: ${diskStatus.browserDataFormatted || 'N/A'}`);
      console.log(`🧠  메모리 사용량: ${memoryStatus.memory?.percentage || 'N/A'}%`);
      console.log(`🔧  Chrome 프로세스: ${memoryStatus.chrome?.total || 0}개`);
      console.log(`📋  로그 파일: ${logStatus.totalFiles || 0}개 (${logStatus.totalSizeFormatted || '0 Bytes'})`);
      console.log(`🧹  Chrome 임시 파일: ${tempStatus.chromeFileCount || 0}개 (${tempStatus.chromeTempFormatted || '0 Bytes'})`);
      
      // 경고 상태
      const warnings = this.checkWarnings(diskStatus, memoryStatus, logStatus, tempStatus);
      if (warnings.length > 0) {
        console.log(`⚠️  경고 사항: ${warnings.length}개`);
        warnings.forEach(warning => console.log(`   - ${warning}`));
      } else {
        console.log('✅  시스템 상태 양호');
      }
      
      console.log('═'.repeat(60));
      
    } catch (error) {
      console.error('❌ 상태 리포트 생성 실패:', error.message);
    }
  }

  /**
   * 경고 상태 체크
   */
  checkWarnings(diskStatus, memoryStatus, logStatus, tempStatus) {
    const warnings = [];
    
    // 디스크 경고
    if (diskStatus.disk?.percentage > 85) {
      warnings.push(`디스크 사용량 높음 (${diskStatus.disk.percentage}%)`);
    }
    
    // 메모리 경고
    if (memoryStatus.memory?.percentage > 90) {
      warnings.push(`메모리 사용량 높음 (${memoryStatus.memory.percentage}%)`);
    }
    
    // Chrome 프로세스 경고
    if (memoryStatus.chrome?.total > 60) {
      warnings.push(`Chrome 프로세스 과다 (${memoryStatus.chrome.total}개)`);
    }
    
    // 로그 파일 경고
    if (logStatus.totalSize > 500 * 1024 * 1024) { // 500MB
      warnings.push(`로그 파일 크기 과다 (${logStatus.totalSizeFormatted})`);
    }
    
    // Chrome 임시 파일 경고
    if (tempStatus.chromeFileCount > 50) {
      warnings.push(`Chrome 임시 파일 과다 (${tempStatus.chromeFileCount}개)`);
    }
    
    if (tempStatus.chromeTemps > 100 * 1024 * 1024) { // 100MB
      warnings.push(`Chrome 임시 파일 크기 과다 (${tempStatus.chromeTempFormatted})`);
    }
    
    return warnings;
  }

  /**
   * 강제 정리 실행
   */
  async forceCleanup() {
    console.log('🧹 강제 시스템 정리 시작');
    
    try {
      // 디스크 정리
      await this.diskMonitor.performCleanup();
      this.stats.diskCleanups++;
      
      // Chrome 프로세스 정리
      await this.memoryMonitor.cleanupChromeProcesses();
      this.stats.memoryCleanups++;
      
      // 로그 로테이션
      await this.logRotator.rotateAllLogs();
      this.stats.logRotations++;
      
      // 임시 파일 강제 정리
      await this.tempCleaner.forceCleanup();
      this.stats.tempCleanups++;
      
      console.log('✅ 강제 시스템 정리 완료');
      
      // 정리 후 상태 확인
      setTimeout(() => {
        this.generateStatusReport();
      }, 5000);
      
    } catch (error) {
      console.error('❌ 강제 정리 실패:', error.message);
    }
  }

  /**
   * 가동 시간 포맷팅
   */
  formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}일 ${hours % 24}시간`;
    if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
    if (minutes > 0) return `${minutes}분 ${seconds % 60}초`;
    return `${seconds}초`;
  }

  /**
   * 전체 상태 조회
   */
  async getFullStatus() {
    try {
      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
      
      return {
        isRunning: this.isRunning,
        uptime: uptime,
        uptimeFormatted: this.formatUptime(uptime),
        stats: this.stats,
        disk: await this.diskMonitor.getStatus(),
        memory: await this.memoryMonitor.getSystemInfo(),
        logs: await this.logRotator.getLogStats(),
        temps: await this.tempCleaner.getTempStatus(),
        monitors: {
          disk: this.diskMonitor.getStatus(),
          memory: this.memoryMonitor.getStatus(),
          logs: this.logRotator.getStatus(),
          temps: this.tempCleaner.getStatus()
        }
      };
    } catch (error) {
      return {
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }

  /**
   * 간단한 상태 조회
   */
  getSimpleStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      stats: this.stats
    };
  }
}

module.exports = SystemMonitor;