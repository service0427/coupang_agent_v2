#!/usr/bin/env node

/**
 * 동시 실행 스크립트 (4개 인스턴스)
 * 각 인스턴스는 독립적인 유저 폴더와 랜덤 프록시 사용
 * 성공 시 3초 대기, 실패 시 즉시 재시도
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// 설정
const CONFIG = {
  INSTANCES: 4,                  // 동시 실행 인스턴스 수
  SUCCESS_DELAY: 3000,           // 성공 시 대기 시간 (ms)
  FAIL_DELAY: 500,              // 실패 시 대기 시간 (ms)
  ERROR_DELAY: 5000,            // 에러 시 대기 시간 (ms)
  PROXY_WAIT_DELAY: 10000,      // 프록시 부족 시 대기 시간
  BROWSER_DATA_PATH: './browser-data'
};

// 인스턴스별 색상 코드
const COLORS = {
  1: '\x1b[36m',  // Cyan
  2: '\x1b[33m',  // Yellow
  3: '\x1b[35m',  // Magenta
  4: '\x1b[32m',  // Green
  reset: '\x1b[0m'
};

// 전역 통계
const globalStats = {
  instances: {},
  startTime: new Date(),
  totalSuccess: 0,
  totalFail: 0,
  totalRuns: 0
};

// 인스턴스별 통계 초기화
for (let i = 1; i <= CONFIG.INSTANCES; i++) {
  globalStats.instances[i] = {
    runs: 0,
    success: 0,
    fail: 0,
    consecutiveFails: 0,
    lastRun: null,
    status: 'idle'
  };
}

/**
 * 컬러 로그 출력
 */
function colorLog(instanceId, message, isError = false) {
  const color = COLORS[instanceId] || COLORS.reset;
  const prefix = `[Instance ${instanceId}]`;
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  
  if (isError) {
    console.error(`${color}${timestamp} ${prefix} ${message}${COLORS.reset}`);
  } else {
    console.log(`${color}${timestamp} ${prefix} ${message}${COLORS.reset}`);
  }
}

/**
 * 브라우저 데이터 폴더 준비
 */
async function prepareBrowserDataFolders() {
  console.log('📁 브라우저 데이터 폴더 준비 중...');
  
  try {
    // 기본 폴더 생성
    await fs.mkdir(CONFIG.BROWSER_DATA_PATH, { recursive: true });
    
    // 인스턴스별 폴더 생성 (01, 02, 03, 04)
    for (let i = 1; i <= CONFIG.INSTANCES; i++) {
      const folderName = String(i).padStart(2, '0');
      const folderPath = path.join(CONFIG.BROWSER_DATA_PATH, folderName);
      await fs.mkdir(folderPath, { recursive: true });
      console.log(`   ✅ 폴더 생성: ${folderPath}`);
    }
    
    console.log('📁 브라우저 데이터 폴더 준비 완료\n');
  } catch (error) {
    console.error('❌ 폴더 생성 실패:', error.message);
    throw error;
  }
}

/**
 * 단일 인스턴스 실행
 * @param {number} instanceId - 인스턴스 ID (1-4)
 */
async function runInstance(instanceId) {
  return new Promise((resolve) => {
    const stats = globalStats.instances[instanceId];
    stats.status = 'running';
    stats.lastRun = new Date();
    
    colorLog(instanceId, '🚀 작업 시작...');
    
    // API 모드로 실행 (단일 스레드, 한 번만)
    const args = [
      'index.js',
      '--api',
      '--instance', instanceId.toString(),
      '--threads', '1',
      '--once'
    ];
    
    const child = spawn('node', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INSTANCE_ID: instanceId.toString(),
        FORCE_COLOR: '1'
      },
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let output = '';
    let hasSuccess = false;
    let hasError = false;
    let errorType = null;
    
    // stdout 처리
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      
      // 주요 메시지만 필터링하여 출력
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.includes('작업 할당됨') || 
            line.includes('작업 성공') || 
            line.includes('작업 실패') ||
            line.includes('상품') ||
            line.includes('순위:') ||
            line.includes('페이지')) {
          colorLog(instanceId, line.trim());
        }
        
        // 성공/실패 감지
        if (line.includes('작업 성공적으로 완료')) {
          hasSuccess = true;
        } else if (line.includes('No proxies available')) {
          errorType = 'no_proxy';
        } else if (line.includes('No keywords')) {
          errorType = 'no_keyword';
        } else if (line.includes('작업이 없음')) {
          errorType = 'no_work';
        }
      });
    });
    
    // stderr 처리
    child.stderr.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.trim() && !line.includes('Warning')) {
          colorLog(instanceId, line.trim(), true);
          hasError = true;
        }
      });
    });
    
    // 프로세스 종료 처리
    child.on('close', (code) => {
      stats.status = 'idle';
      stats.runs++;
      globalStats.totalRuns++;
      
      if (hasSuccess) {
        stats.success++;
        stats.consecutiveFails = 0;
        globalStats.totalSuccess++;
        colorLog(instanceId, `✅ 작업 성공 (총 ${stats.success}회 성공)`);
        resolve({ success: true, errorType: null });
      } else {
        stats.fail++;
        stats.consecutiveFails++;
        globalStats.totalFail++;
        
        if (errorType === 'no_proxy') {
          colorLog(instanceId, `⚠️ 프록시 부족 - 대기 필요`);
        } else if (errorType === 'no_work') {
          colorLog(instanceId, `⚠️ 작업 없음 - 대기 필요`);
        } else {
          colorLog(instanceId, `❌ 작업 실패 (연속 ${stats.consecutiveFails}회 실패)`);
        }
        
        resolve({ success: false, errorType: errorType });
      }
    });
    
    // 에러 처리
    child.on('error', (error) => {
      stats.status = 'error';
      colorLog(instanceId, `❌ 프로세스 실행 오류: ${error.message}`, true);
      resolve({ success: false, errorType: 'process_error' });
    });
  });
}

/**
 * 인스턴스 워커 - 무한 루프
 * @param {number} instanceId - 인스턴스 ID
 */
async function instanceWorker(instanceId) {
  colorLog(instanceId, '🔄 무한 루프 시작');
  
  while (true) {
    try {
      const result = await runInstance(instanceId);
      
      // 대기 시간 결정
      let delay = CONFIG.FAIL_DELAY;
      
      if (result.success) {
        // 성공 시 3초 대기
        delay = CONFIG.SUCCESS_DELAY;
        colorLog(instanceId, `⏳ ${delay/1000}초 대기 중...`);
        
      } else if (result.errorType === 'no_proxy' || result.errorType === 'no_work') {
        // 프록시/작업 부족 시 긴 대기
        delay = CONFIG.PROXY_WAIT_DELAY;
        colorLog(instanceId, `⏳ 리소스 부족 - ${delay/1000}초 대기 중...`);
        
      } else if (globalStats.instances[instanceId].consecutiveFails >= 3) {
        // 연속 실패 시 긴 대기
        delay = CONFIG.ERROR_DELAY;
        colorLog(instanceId, `⏳ 연속 실패 - ${delay/1000}초 대기 중...`);
        globalStats.instances[instanceId].consecutiveFails = 0;
        
      } else {
        // 일반 실패 시 짧은 대기
        colorLog(instanceId, `⏳ ${delay/1000}초 후 재시도...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      colorLog(instanceId, `❌ 예외 발생: ${error.message}`, true);
      colorLog(instanceId, `⏳ ${CONFIG.ERROR_DELAY/1000}초 후 재시작...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.ERROR_DELAY));
    }
  }
}

/**
 * 실시간 통계 출력
 */
function printStats() {
  const uptime = (Date.now() - globalStats.startTime.getTime()) / 1000;
  const totalRuns = globalStats.totalRuns;
  const successRate = totalRuns > 0 ? 
    (globalStats.totalSuccess / totalRuns * 100).toFixed(1) : 0;
  
  console.log('\n' + '═'.repeat(70));
  console.log('📊 실행 통계');
  console.log('─'.repeat(70));
  console.log(`⏱️  가동 시간: ${(uptime / 60).toFixed(1)}분`);
  console.log(`🔧 동시 실행: ${CONFIG.INSTANCES}개 인스턴스`);
  console.log(`📋 총 실행: ${totalRuns}회`);
  console.log(`✅ 총 성공: ${globalStats.totalSuccess}회`);
  console.log(`❌ 총 실패: ${globalStats.totalFail}회`);
  console.log(`📈 성공률: ${successRate}%`);
  
  if (uptime > 0) {
    const rpm = (globalStats.totalSuccess / (uptime / 60)).toFixed(1);
    console.log(`⚡ 처리량: ${rpm} 성공/분`);
  }
  
  console.log('\n📍 인스턴스별 상태:');
  console.log('─'.repeat(70));
  
  for (let i = 1; i <= CONFIG.INSTANCES; i++) {
    const inst = globalStats.instances[i];
    const instSuccessRate = inst.runs > 0 ? 
      (inst.success / inst.runs * 100).toFixed(1) : 0;
    const statusIcon = inst.status === 'running' ? '🚀' : 
                       inst.status === 'error' ? '❌' : '💤';
    
    console.log(`${COLORS[i]}Instance ${i}: ${statusIcon} ${inst.status.padEnd(10)} | ` +
                `실행: ${inst.runs.toString().padStart(3)}회 | ` +
                `성공: ${inst.success.toString().padStart(3)}회 | ` +
                `실패: ${inst.fail.toString().padStart(3)}회 | ` +
                `성공률: ${instSuccessRate.padStart(5)}%${COLORS.reset}`);
  }
  
  console.log('═'.repeat(70));
}

/**
 * 메인 함수
 */
async function main() {
  console.log('🚀 동시 실행 모드 시작');
  console.log(`📍 설정: ${CONFIG.INSTANCES}개 인스턴스, 성공 시 ${CONFIG.SUCCESS_DELAY/1000}초 대기`);
  console.log('─'.repeat(70));
  
  // 브라우저 데이터 폴더 준비
  await prepareBrowserDataFolders();
  
  // 통계 출력 타이머 (30초마다)
  setInterval(printStats, 30000);
  
  // 모든 인스턴스 시작 (시차 적용)
  const workers = [];
  for (let i = 1; i <= CONFIG.INSTANCES; i++) {
    // 인스턴스 시작 시차 (1초)
    await new Promise(resolve => setTimeout(resolve, 1000));
    workers.push(instanceWorker(i));
    colorLog(i, '✅ 인스턴스 시작됨');
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ 모든 인스턴스 시작 완료');
  console.log('📍 Ctrl+C를 눌러 종료하세요');
  console.log('═'.repeat(70) + '\n');
  
  // 모든 워커 대기 (무한 루프)
  await Promise.all(workers);
}

/**
 * 우아한 종료 처리
 */
function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} 신호 수신 - 종료 중...`);
  printStats();
  
  // 모든 인스턴스 상태 저장 (필요시)
  const statsFile = `stats-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFile(statsFile, JSON.stringify(globalStats, null, 2))
    .then(() => console.log(`📊 통계 저장됨: ${statsFile}`))
    .catch(() => {})
    .finally(() => process.exit(0));
}

// 종료 신호 처리
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 실행
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  });
}