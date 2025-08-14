/**
 * 크로스플랫폼 시스템 메트릭 수집 유틸리티
 * Windows, Linux(Ubuntu), macOS 지원
 */

const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class SystemMetrics {
  constructor() {
    this.platform = process.platform;
    this.isWindows = this.platform === 'win32';
    this.isLinux = this.platform === 'linux';
    this.isMac = this.platform === 'darwin';
    
    // CPU 사용률 계산을 위한 이전 값들
    this.previousCpuUsage = process.cpuUsage();
    this.previousTime = Date.now();
  }

  /**
   * 종합 시스템 메트릭 수집
   */
  async collectMetrics() {
    const metrics = {
      platform: this.platform,
      timestamp: new Date().toISOString(),
      // 기본 Node.js 메트릭
      memory: this.getMemoryUsage(),
      cpu: await this.getCpuUsage(),
      // OS별 확장 메트릭
      system: await this.getSystemMetrics()
    };

    return metrics;
  }

  /**
   * 메모리 사용량 (크로스플랫폼)
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    
    return {
      // 프로세스 메모리 (MB)
      processHeapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
      processHeapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
      processRss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      processExternal: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
      // 시스템 메모리 (MB)
      systemTotal: Math.round(os.totalmem() / 1024 / 1024),
      systemFree: Math.round(os.freemem() / 1024 / 1024),
      systemUsed: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)
    };
  }

  /**
   * CPU 사용률 계산 (크로스플랫폼)
   */
  async getCpuUsage() {
    try {
      // Node.js 프로세스 CPU 사용률
      const currentCpuUsage = process.cpuUsage(this.previousCpuUsage);
      const currentTime = Date.now();
      const timeDiff = currentTime - this.previousTime;
      
      // 마이크로초를 밀리초로 변환하고 퍼센트 계산
      const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / 1000) / timeDiff * 100;
      
      // 다음 계산을 위해 값 업데이트
      this.previousCpuUsage = process.cpuUsage();
      this.previousTime = currentTime;

      const result = {
        processCpuPercent: Math.min(100, Math.max(0, Math.round(cpuPercent * 100) / 100)),
        systemLoadAverage: null,
        systemCpuCount: os.cpus().length
      };

      // 시스템 부하 평균 (Linux/Mac만)
      if (!this.isWindows) {
        const loadAvg = os.loadavg();
        result.systemLoadAverage = loadAvg.map(load => Math.round(load * 100) / 100);
      }

      // OS별 추가 CPU 정보
      if (this.isLinux) {
        result.systemCpuPercent = await this.getLinuxCpuUsage();
      } else if (this.isWindows) {
        result.systemCpuPercent = await this.getWindowsCpuUsage();
      }

      return result;
    } catch (error) {
      console.warn('⚠️ CPU 사용률 계산 실패:', error.message);
      return {
        processCpuPercent: 0,
        systemLoadAverage: this.isWindows ? null : [0, 0, 0],
        systemCpuCount: os.cpus().length,
        systemCpuPercent: 0
      };
    }
  }

  /**
   * Linux 시스템 CPU 사용률 (/proc/stat 기반)
   */
  async getLinuxCpuUsage() {
    try {
      const { stdout } = await execAsync('cat /proc/stat | grep "^cpu " | awk \'{print ($2+$4)*100/($2+$3+$4+$5)}\'');
      const cpuUsage = parseFloat(stdout.trim());
      return isNaN(cpuUsage) ? 0 : Math.round(cpuUsage * 100) / 100;
    } catch (error) {
      // /proc/stat 읽기 실패 시 top 명령 사용
      try {
        const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | sed \'s/%us,//\'');
        const cpuUsage = parseFloat(stdout.trim());
        return isNaN(cpuUsage) ? 0 : Math.round(cpuUsage * 100) / 100;
      } catch {
        return 0;
      }
    }
  }

  /**
   * Windows 시스템 CPU 사용률 (wmic 기반)
   */
  async getWindowsCpuUsage() {
    try {
      const { stdout } = await execAsync('wmic cpu get loadpercentage /value', { 
        windowsHide: true,
        timeout: 5000 
      });
      
      const match = stdout.match(/LoadPercentage=(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
      return 0;
    } catch (error) {
      // wmic 실패 시 대체 방법 시도
      try {
        const { stdout } = await execAsync('powershell "Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average"', {
          windowsHide: true,
          timeout: 5000
        });
        const cpuUsage = parseFloat(stdout.trim());
        return isNaN(cpuUsage) ? 0 : Math.round(cpuUsage * 100) / 100;
      } catch {
        return 0;
      }
    }
  }

  /**
   * OS별 추가 시스템 정보
   */
  async getSystemMetrics() {
    const baseMetrics = {
      hostname: os.hostname(),
      uptime: Math.round(os.uptime()),
      networkInterfaces: Object.keys(os.networkInterfaces()).length
    };

    try {
      if (this.isLinux) {
        return { ...baseMetrics, ...(await this.getLinuxSystemMetrics()) };
      } else if (this.isWindows) {
        return { ...baseMetrics, ...(await this.getWindowsSystemMetrics()) };
      } else if (this.isMac) {
        return { ...baseMetrics, ...(await this.getMacSystemMetrics()) };
      }
    } catch (error) {
      console.warn('⚠️ 확장 시스템 메트릭 수집 실패:', error.message);
    }

    return baseMetrics;
  }

  /**
   * Linux 추가 시스템 정보
   */
  async getLinuxSystemMetrics() {
    const metrics = {};

    try {
      // 메모리 상세 정보 (grep 없이 직접 파싱)
      const { stdout: memInfo } = await execAsync('free -m');
      const memLines = memInfo.split('\n');
      const memLine = memLines.find(line => line.startsWith('Mem:'));
      
      if (memLine) {
        const memMatch = memLine.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+(\d+)\s+(\d+)/);
        if (memMatch) {
          metrics.detailedMemory = {
            total: parseInt(memMatch[1]),
            used: parseInt(memMatch[2]),
            free: parseInt(memMatch[3]),
            buffer: parseInt(memMatch[4]),
            cache: parseInt(memMatch[5])
          };
        }
      }

      // 디스크 사용량
      const { stdout: diskInfo } = await execAsync('df -h / | tail -1');
      const diskMatch = diskInfo.match(/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/);
      if (diskMatch) {
        metrics.disk = {
          total: diskMatch[1],
          used: diskMatch[2],
          available: diskMatch[3],
          usedPercent: parseInt(diskMatch[4])
        };
      }
    } catch (error) {
      console.warn('⚠️ Linux 시스템 메트릭 수집 부분 실패:', error.message);
    }

    return metrics;
  }

  /**
   * Windows 추가 시스템 정보
   */
  async getWindowsSystemMetrics() {
    const metrics = {};

    try {
      // 시스템 정보
      const { stdout } = await execAsync('systeminfo | findstr /C:"Total Physical Memory"', { 
        windowsHide: true,
        timeout: 10000 
      });
      
      const memMatch = stdout.match(/Total Physical Memory:\s*([0-9,]+)/);
      if (memMatch) {
        const totalMB = parseInt(memMatch[1].replace(/,/g, ''));
        metrics.detailedMemory = {
          totalMB: totalMB
        };
      }
    } catch (error) {
      console.warn('⚠️ Windows 시스템 메트릭 수집 부분 실패:', error.message);
    }

    return metrics;
  }

  /**
   * macOS 추가 시스템 정보
   */
  async getMacSystemMetrics() {
    const metrics = {};

    try {
      // macOS 시스템 정보
      const { stdout } = await execAsync('vm_stat');
      metrics.vmStat = stdout.trim();
    } catch (error) {
      console.warn('⚠️ macOS 시스템 메트릭 수집 부분 실패:', error.message);
    }

    return metrics;
  }

  /**
   * 간단한 메트릭 (API 전송용)
   */
  async getSimpleMetrics() {
    try {
      const full = await this.collectMetrics();
      
      return {
        memoryUsageMb: full.memory.processRss, // 프로세스 실제 메모리 사용량
        cpuUsagePercent: full.cpu.processCpuPercent, // 프로세스 CPU 사용률
        systemMemoryMb: full.memory.systemTotal, // 시스템 총 메모리
        systemCpuPercent: full.cpu.systemCpuPercent || 0, // 시스템 CPU 사용률
        platform: full.platform,
        uptime: full.system.uptime
      };
    } catch (error) {
      console.warn('⚠️ 간단한 메트릭 수집 실패:', error.message);
      return {
        memoryUsageMb: 0,
        cpuUsagePercent: 0,
        systemMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
        systemCpuPercent: 0,
        platform: this.platform,
        uptime: Math.round(os.uptime())
      };
    }
  }
}

// 싱글톤 인스턴스
const systemMetrics = new SystemMetrics();

module.exports = {
  SystemMetrics,
  systemMetrics,
  // 편의 함수들
  getSimpleMetrics: () => systemMetrics.getSimpleMetrics(),
  collectMetrics: () => systemMetrics.collectMetrics()
};