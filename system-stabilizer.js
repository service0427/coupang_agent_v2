#!/usr/bin/env node
/**
 * 시스템 안정화 스크립트
 * 메인 프로그램과 별도로 실행되어 시스템을 안정화
 * 
 * 사용법:
 * node system-stabilizer.js --once              # 한 번만 실행
 * node system-stabilizer.js --daemon            # 데몬 모드 (10분마다 실행)
 * node system-stabilizer.js --aggressive        # 적극적 정리 모드
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class SystemStabilizer {
  constructor(options = {}) {
    this.isDaemon = options.daemon || false;
    this.isAggressive = options.aggressive || false;
    this.interval = options.interval || 10 * 60 * 1000; // 10분
    this.tempAge = options.tempAge || 10; // 10분
    this.logAge = options.logAge || 60; // 1시간
    this.isRunning = false;
    
    this.stats = {
      runs: 0,
      tempFilesRemoved: 0,
      bytesFreed: 0,
      chromeProcessesKilled: 0,
      lastRun: null
    };
    
    // 정리할 /tmp 파일 패턴
    this.tempPatterns = [
      '.com.google.Chrome*',      // Chrome 임시 파일
      'chrome*',                  // Chrome 관련
      'playwright*',              // Playwright
      'npm-*',                    // NPM 임시
      'tmp*',                     // 일반 임시
      'core.*',                   // Core dump
      '.*socket*',                // 소켓 파일
      'SingletonSocket*',         // Chrome 세마포어
      '.X11-unix/*',              // X11 소켓 (조심스럽게)
      'ssh-*'                     // SSH 에이전트 (조심스럽게)
    ];
  }

  /**
   * 시작
   */
  async start() {
    console.log('🔧 시스템 안정화 스크립트 시작');
    console.log(`   모드: ${this.isDaemon ? '데몬' : '단발성'}`);
    console.log(`   정리 주기: ${this.isDaemon ? `${this.interval/1000/60}분` : '즉시'}`);
    console.log(`   임시 파일 기준: ${this.tempAge}분 이상`);
    console.log(`   적극적 모드: ${this.isAggressive ? '활성' : '비활성'}`);
    
    if (this.isDaemon) {
      this.isRunning = true;
      await this.runStabilization();
      
      // 주기적 실행
      this.timer = setInterval(async () => {
        if (this.isRunning) {
          await this.runStabilization();
        }
      }, this.interval);
      
      console.log('✅ 데몬 모드 시작 완료 (Ctrl+C로 종료)');
      
      // 우아한 종료
      process.on('SIGINT', () => {
        console.log('\n🛑 종료 신호 수신 - 안정화 스크립트 종료');
        this.stop();
        process.exit(0);
      });
      
      // 무한 대기
      await new Promise(() => {});
      
    } else {
      // 한 번만 실행
      await this.runStabilization();
      console.log('✅ 단발성 정리 완료');
    }
  }

  /**
   * 중단
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    
    console.log('📊 최종 통계:');
    console.log(`   실행 횟수: ${this.stats.runs}회`);
    console.log(`   임시 파일 제거: ${this.stats.tempFilesRemoved}개`);
    console.log(`   확보 용량: ${this.formatBytes(this.stats.bytesFreed)}`);
    console.log(`   Chrome 프로세스 정리: ${this.stats.chromeProcessesKilled}개`);
  }

  /**
   * 안정화 실행
   */
  async runStabilization() {
    const startTime = new Date();
    this.stats.runs++;
    this.stats.lastRun = startTime;
    
    console.log(`\n🧹 [${this.stats.runs}회] 시스템 안정화 시작 - ${startTime.toLocaleTimeString()}`);
    
    try {
      let totalFreed = 0;
      let totalFiles = 0;
      
      // 1. /tmp 정리 (가장 중요)
      const tmpResult = await this.cleanTmpDirectory();
      totalFreed += tmpResult.bytesFreed;
      totalFiles += tmpResult.filesRemoved;
      
      // 2. Chrome 좀비 프로세스 정리
      if (this.isAggressive) {
        const chromeResult = await this.cleanZombieChromeProcesses();
        this.stats.chromeProcessesKilled += chromeResult.processesKilled;
      }
      
      // 3. 프로젝트 로그 정리 (적극적 모드에서만)
      if (this.isAggressive) {
        const logResult = await this.cleanProjectLogs();
        totalFreed += logResult.bytesFreed;
        totalFiles += logResult.filesRemoved;
      }
      
      // 4. 시스템 상태 체크
      const systemStatus = await this.checkSystemStatus();
      
      // 통계 업데이트
      this.stats.tempFilesRemoved += totalFiles;
      this.stats.bytesFreed += totalFreed;
      
      const duration = Date.now() - startTime.getTime();
      
      if (totalFiles > 0 || this.stats.chromeProcessesKilled > 0) {
        console.log(`✅ 정리 완료: ${totalFiles}개 파일, ${this.formatBytes(totalFreed)} 확보 (${duration}ms)`);
      } else {
        console.log(`📝 정리할 항목 없음 (${duration}ms)`);
      }
      
      // 시스템 상태 표시
      this.displaySystemStatus(systemStatus);
      
    } catch (error) {
      console.error('❌ 안정화 실행 실패:', error.message);
    }
  }

  /**
   * /tmp 디렉토리 정리
   */
  async cleanTmpDirectory() {
    let bytesFreed = 0;
    let filesRemoved = 0;
    
    console.log('   🧹 /tmp 디렉토리 정리 중...');
    
    try {
      // /tmp 크기 확인 (정리 전)
      const beforeSize = await this.getTmpSize();
      
      // 10분 이상된 모든 파일/폴더 정리
      const cleanupCommands = [
        // Chrome 관련 (최우선)
        `find /tmp -name ".com.google.Chrome*" -mmin +${this.tempAge} -exec rm -rf {} \\; 2>/dev/null || true`,
        `find /tmp -name "chrome*" -mmin +${this.tempAge} -exec rm -rf {} \\; 2>/dev/null || true`,
        
        // 기타 임시 파일들
        `find /tmp -name "playwright*" -mmin +${this.tempAge} -exec rm -rf {} \\; 2>/dev/null || true`,
        `find /tmp -name "npm-*" -mmin +${this.tempAge} -exec rm -rf {} \\; 2>/dev/null || true`,
        `find /tmp -name "tmp*" -type f -mmin +${this.tempAge} -exec rm -f {} \\; 2>/dev/null || true`,
        `find /tmp -name "core.*" -mmin +${this.tempAge} -exec rm -f {} \\; 2>/dev/null || true`,
        
        // 소켓 파일들 (조심스럽게)
        `find /tmp -name "*socket*" -type f -mmin +${this.tempAge} -exec rm -f {} \\; 2>/dev/null || true`,
        `find /tmp -name "SingletonSocket*" -mmin +${this.tempAge} -exec rm -f {} \\; 2>/dev/null || true`,
        
        // 빈 디렉토리 정리
        `find /tmp -type d -empty -mmin +${this.tempAge} -exec rmdir {} \\; 2>/dev/null || true`
      ];
      
      // 각 명령어 실행
      for (const command of cleanupCommands) {
        try {
          await execAsync(command);
        } catch (error) {
          // 계속 진행 (파일이 없거나 권한 문제는 무시)
        }
      }
      
      // /tmp 크기 확인 (정리 후)
      const afterSize = await this.getTmpSize();
      bytesFreed = beforeSize - afterSize;
      
      if (bytesFreed > 0) {
        // 파일 개수 추정 (정확하지 않지만 대략적으로)
        filesRemoved = Math.max(1, Math.floor(bytesFreed / (1024 * 1024))); // 1MB당 1개로 추정
        console.log(`      ✅ /tmp 정리: ${this.formatBytes(bytesFreed)} 확보`);
      } else {
        console.log(`      📝 /tmp: 정리할 파일 없음`);
      }
      
    } catch (error) {
      console.warn(`      ⚠️ /tmp 정리 실패: ${error.message}`);
    }
    
    return { bytesFreed, filesRemoved };
  }

  /**
   * 좀비 Chrome 프로세스 정리
   */
  async cleanZombieChromeProcesses() {
    let processesKilled = 0;
    
    console.log('   🔧 Chrome 프로세스 정리 중...');
    
    try {
      // 메모리 사용량이 높은 Chrome 프로세스 찾기
      const { stdout } = await execAsync(`
        ps aux | grep -E "(chrome|Chrome)" | grep -v grep | 
        awk '$4 > 5.0 {print $2, $4}' | sort -k2 -nr | head -10
      `);
      
      if (stdout.trim()) {
        const processes = stdout.trim().split('\n');
        
        for (const processLine of processes) {
          const [pid, memory] = processLine.trim().split(/\s+/);
          
          if (parseFloat(memory) > 10.0) { // 10% 이상 메모리 사용하는 프로세스만
            try {
              // SIGTERM 시도
              await execAsync(`kill -TERM ${pid} 2>/dev/null`);
              processesKilled++;
              console.log(`      🔧 Chrome 프로세스 종료: PID ${pid} (메모리: ${memory}%)`);
              
              // 3초 후 SIGKILL (백그라운드에서)
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
      }
      
      if (processesKilled === 0) {
        console.log(`      📝 Chrome: 정리할 프로세스 없음`);
      }
      
    } catch (error) {
      console.warn(`      ⚠️ Chrome 프로세스 정리 실패: ${error.message}`);
    }
    
    return { processesKilled };
  }

  /**
   * 프로젝트 로그 정리
   */
  async cleanProjectLogs() {
    let bytesFreed = 0;
    let filesRemoved = 0;
    
    console.log('   📋 프로젝트 로그 정리 중...');
    
    try {
      const projectPath = process.cwd();
      
      const logCommands = [
        // 1시간 이상된 Chrome debug 로그
        `find "${projectPath}" -name "chrome_debug.log*" -mmin +${this.logAge} -exec rm -f {} \\; 2>/dev/null || true`,
        // 1일 이상된 스크린샷
        `find "${projectPath}" -name "screenshot*.png" -mtime +1 -exec rm -f {} \\; 2>/dev/null || true`,
        // npm 로그
        `find "${projectPath}" -name "npm-debug.log*" -exec rm -f {} \\; 2>/dev/null || true`,
        // 임시 JSON 파일
        `find "${projectPath}" -name "temp_*.json" -mmin +${this.logAge} -exec rm -f {} \\; 2>/dev/null || true`
      ];
      
      for (const command of logCommands) {
        try {
          await execAsync(command);
          filesRemoved += 1; // 추정
        } catch (error) {
          // 계속 진행
        }
      }
      
      if (filesRemoved > 0) {
        bytesFreed = filesRemoved * 512 * 1024; // 추정 512KB per file
        console.log(`      ✅ 프로젝트 로그: ${filesRemoved}개 파일 정리`);
      } else {
        console.log(`      📝 프로젝트 로그: 정리할 파일 없음`);
      }
      
    } catch (error) {
      console.warn(`      ⚠️ 프로젝트 로그 정리 실패: ${error.message}`);
    }
    
    return { bytesFreed, filesRemoved };
  }

  /**
   * /tmp 크기 확인
   */
  async getTmpSize() {
    try {
      const { stdout } = await execAsync('du -sb /tmp 2>/dev/null | cut -f1');
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 시스템 상태 체크
   */
  async checkSystemStatus() {
    try {
      // 메모리 사용률
      const { stdout: memOutput } = await execAsync('free | grep Mem');
      const memParts = memOutput.trim().split(/\s+/);
      const memUsedPercent = Math.round((parseInt(memParts[2]) / parseInt(memParts[1])) * 100);
      
      // 디스크 사용률
      const { stdout: diskOutput } = await execAsync('df -h / | tail -1');
      const diskParts = diskOutput.trim().split(/\s+/);
      const diskUsedPercent = parseInt(diskParts[4].replace('%', ''));
      
      // Chrome 프로세스 수
      const { stdout: chromeOutput } = await execAsync('pgrep -f chrome | wc -l');
      const chromeProcesses = parseInt(chromeOutput.trim()) || 0;
      
      // /tmp 크기
      const tmpSize = await this.getTmpSize();
      
      return {
        memory: { used: memUsedPercent },
        disk: { used: diskUsedPercent },
        chrome: { processes: chromeProcesses },
        tmp: { size: tmpSize, formatted: this.formatBytes(tmpSize) }
      };
      
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 시스템 상태 표시
   */
  displaySystemStatus(status) {
    if (status.error) {
      console.log(`   ⚠️ 시스템 상태 확인 실패: ${status.error}`);
      return;
    }
    
    console.log('   📊 시스템 상태:');
    console.log(`      메모리: ${status.memory.used}%`);
    console.log(`      디스크: ${status.disk.used}%`);
    console.log(`      Chrome: ${status.chrome.processes}개 프로세스`);
    console.log(`      /tmp: ${status.tmp.formatted}`);
    
    // 경고 표시
    const warnings = [];
    if (status.memory.used > 85) warnings.push('메모리 사용량 높음');
    if (status.disk.used > 85) warnings.push('디스크 사용량 높음');
    if (status.chrome.processes > 50) warnings.push('Chrome 프로세스 과다');
    if (status.tmp.size > 100 * 1024 * 1024) warnings.push('/tmp 크기 과다');
    
    if (warnings.length > 0) {
      console.log(`      ⚠️ 경고: ${warnings.join(', ')}`);
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
}

// CLI 인자 파싱
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    daemon: false,
    aggressive: false,
    interval: 10 * 60 * 1000, // 10분
    tempAge: 10, // 10분
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--daemon':
      case '-d':
        options.daemon = true;
        break;
      case '--once':
      case '-o':
        options.daemon = false;
        break;
      case '--aggressive':
      case '-a':
        options.aggressive = true;
        break;
      case '--interval':
      case '-i':
        options.interval = parseInt(args[++i]) * 60 * 1000; // 분을 밀리초로
        break;
      case '--temp-age':
      case '-t':
        options.tempAge = parseInt(args[++i]); // 분
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

// 도움말 표시
function showHelp() {
  console.log(`
시스템 안정화 스크립트 v1.0

사용법:
  node system-stabilizer.js [옵션]

옵션:
  --once, -o           한 번만 실행 (기본값)
  --daemon, -d         데몬 모드 (지속적 실행)
  --aggressive, -a     적극적 정리 모드 (Chrome 프로세스 + 로그 정리)
  --interval, -i <분>  데몬 모드 실행 간격 (기본: 10분)
  --temp-age, -t <분>  임시 파일 정리 기준 (기본: 10분)
  --help, -h           이 도움말 표시

예제:
  node system-stabilizer.js --once                    # 한 번만 실행
  node system-stabilizer.js --daemon                  # 10분마다 실행
  node system-stabilizer.js --daemon --aggressive     # 적극적 모드로 데몬 실행
  node system-stabilizer.js --daemon --interval 5     # 5분마다 실행

주의사항:
  - 이 스크립트는 /tmp 폴더의 오래된 파일들을 정리합니다
  - --aggressive 모드는 Chrome 프로세스도 정리합니다
  - 데몬 모드는 Ctrl+C로 종료할 수 있습니다
`);
}

// 메인 실행
async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  const stabilizer = new SystemStabilizer(options);
  await stabilizer.start();
}

// 스크립트 직접 실행시에만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 시스템 안정화 스크립트 오류:', error.message);
    process.exit(1);
  });
}

module.exports = SystemStabilizer;