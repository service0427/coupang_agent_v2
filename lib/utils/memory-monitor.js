/**
 * 메모리 모니터링 및 Chrome 프로세스 관리
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class MemoryMonitor {
  constructor(options = {}) {
    this.maxMemoryUsage = options.maxMemoryUsage || 85; // 85% 초과시 경고
    this.maxChromeProcesses = options.maxChromeProcesses || 50; // Chrome 프로세스 최대 개수
    this.checkInterval = options.checkInterval || 5 * 60 * 1000; // 5분
    this.isMonitoring = false;
    this.stats = {
      totalChecks: 0,
      warnings: 0,
      cleanups: 0
    };
  }

  /**
   * 모니터링 시작
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🧠 메모리 모니터링 시작');
    
    // 즉시 체크
    this.checkMemory();
    
    // 주기적 체크
    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);
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
    console.log('🛑 메모리 모니터링 중단');
  }

  /**
   * 메모리 체크
   */
  async checkMemory() {
    try {
      this.stats.totalChecks++;
      
      const memoryInfo = await this.getMemoryUsage();
      const chromeProcesses = await this.getChromeProcessCount();
      
      // 경고 레벨 체크
      if (memoryInfo.percentage > this.maxMemoryUsage) {
        this.stats.warnings++;
        console.log(`⚠️ 메모리 사용량 높음: ${memoryInfo.percentage}% (${memoryInfo.used}/${memoryInfo.total})`);
        
        // Chrome 프로세스가 많으면 정리
        if (chromeProcesses.total > this.maxChromeProcesses) {
          console.log(`🔧 Chrome 프로세스 정리 시작 (${chromeProcesses.total}개)`);
          await this.cleanupChromeProcesses();
          this.stats.cleanups++;
        }
      }
      
      // 정상 로그 (10회마다 출력)
      if (this.stats.totalChecks % 10 === 0) {
        console.log(`📊 메모리: ${memoryInfo.percentage}%, Chrome: ${chromeProcesses.total}개 프로세스`);
      }
      
    } catch (error) {
      console.error('❌ 메모리 모니터링 오류:', error.message);
    }
  }

  /**
   * 메모리 사용량 확인
   */
  async getMemoryUsage() {
    try {
      const { stdout } = await execAsync('free | grep Mem');
      const parts = stdout.trim().split(/\s+/);
      
      const total = parseInt(parts[1]);
      const used = parseInt(parts[2]);
      const percentage = Math.round((used / total) * 100);
      
      return {
        total: this.formatBytes(total * 1024),
        used: this.formatBytes(used * 1024),
        available: this.formatBytes((total - used) * 1024),
        percentage: percentage
      };
    } catch (error) {
      throw new Error('메모리 정보 확인 실패: ' + error.message);
    }
  }

  /**
   * Chrome 프로세스 개수 확인
   */
  async getChromeProcessCount() {
    try {
      const { stdout } = await execAsync('pgrep -f chrome | wc -l');
      const total = parseInt(stdout.trim()) || 0;
      
      // 메모리 사용량 높은 Chrome 프로세스 확인
      let highMemoryProcesses = 0;
      try {
        const { stdout: memOutput } = await execAsync('ps aux | grep chrome | grep -v grep | awk \'$4 > 5.0 {print $2}\' | wc -l');
        highMemoryProcesses = parseInt(memOutput.trim()) || 0;
      } catch (error) {
        // 무시
      }
      
      return {
        total: total,
        highMemory: highMemoryProcesses
      };
    } catch (error) {
      return { total: 0, highMemory: 0 };
    }
  }

  /**
   * 좀비 Chrome 프로세스 정리
   */
  async cleanupChromeProcesses() {
    try {
      // 1. 메모리 사용량이 높은 Chrome 프로세스 찾기
      const { stdout } = await execAsync(`
        ps aux | grep chrome | grep -v grep | awk '$4 > 10.0 {print $2, $4}' | sort -k2 -nr
      `);
      
      if (stdout.trim()) {
        const processes = stdout.trim().split('\n').slice(0, 5); // 상위 5개만
        
        for (const processLine of processes) {
          const [pid, memory] = processLine.trim().split(/\s+/);
          
          try {
            // SIGTERM 먼저 시도
            await execAsync(`kill -TERM ${pid}`);
            console.log(`   🔧 Chrome 프로세스 종료: PID ${pid} (메모리: ${memory}%)`);
            
            // 3초 후에도 살아있으면 SIGKILL
            setTimeout(async () => {
              try {
                await execAsync(`kill -KILL ${pid} 2>/dev/null`);
              } catch (error) {
                // 이미 종료된 경우 무시
              }
            }, 3000);
            
          } catch (error) {
            // 프로세스가 이미 종료된 경우 무시
          }
        }
      }
      
      console.log('   ✅ Chrome 프로세스 정리 완료');
      
    } catch (error) {
      console.warn('⚠️ Chrome 프로세스 정리 실패:', error.message);
    }
  }

  /**
   * 시스템 리소스 정보
   */
  async getSystemInfo() {
    try {
      const memoryInfo = await this.getMemoryUsage();
      const chromeProcesses = await this.getChromeProcessCount();
      
      // CPU 사용률
      let cpuUsage = 0;
      try {
        const { stdout } = await execAsync(`top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//'`);
        cpuUsage = parseFloat(stdout.trim()) || 0;
      } catch (error) {
        // 무시
      }
      
      // 로드 평균
      let loadAverage = 'N/A';
      try {
        const { stdout } = await execAsync('uptime | awk -F"load average:" \'{print $2}\'');
        loadAverage = stdout.trim();
      } catch (error) {
        // 무시
      }
      
      return {
        memory: memoryInfo,
        chrome: chromeProcesses,
        cpu: cpuUsage,
        loadAverage: loadAverage,
        stats: this.stats
      };
      
    } catch (error) {
      throw new Error('시스템 정보 확인 실패: ' + error.message);
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
      isMonitoring: this.isMonitoring,
      maxMemoryUsage: this.maxMemoryUsage,
      maxChromeProcesses: this.maxChromeProcesses,
      stats: this.stats
    };
  }
}

module.exports = MemoryMonitor;