#!/usr/bin/env node

/**
 * 무한 루프 실행 스크립트
 * 성공 시 3초 대기 후 재실행
 * 4개 동시 실행 지원
 */

const { spawn } = require('child_process');
const path = require('path');

// 설정
const CONFIG = {
  THREADS: 4,                    // 동시 실행 스레드 수
  SUCCESS_DELAY: 3000,           // 성공 시 대기 시간 (ms)
  FAIL_DELAY: 1000,             // 실패 시 대기 시간 (ms)
  MAX_RETRIES: 3,               // 최대 재시도 횟수
  RESTART_DELAY: 5000           // 프로세스 재시작 대기 시간
};

// 실행 통계
const stats = {
  totalRuns: 0,
  successCount: 0,
  failCount: 0,
  startTime: new Date()
};

/**
 * 단일 작업 실행
 * @param {number} threadId - 스레드 ID (1-4)
 */
async function runSingleTask(threadId) {
  return new Promise((resolve, reject) => {
    const threadPrefix = `[Thread ${threadId}]`;
    console.log(`${threadPrefix} 🚀 작업 시작...`);
    
    const args = [
      'index.js',
      '--api',
      '--instance', '1',
      '--threads', '1',
      '--once'  // 한 번만 실행
    ];
    
    const child = spawn('node', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        THREAD_ID: threadId.toString()
      },
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`${threadPrefix} ${line}`);
          output += line + '\n';
        }
      });
    });
    
    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.error(`${threadPrefix} ❌ ${line}`);
          errorOutput += line + '\n';
        }
      });
    });
    
    child.on('close', (code) => {
      const success = code === 0 && output.includes('✅') && output.includes('작업 성공');
      
      if (success) {
        console.log(`${threadPrefix} ✅ 작업 성공 완료`);
        resolve(true);
      } else {
        console.log(`${threadPrefix} ❌ 작업 실패 (종료 코드: ${code})`);
        resolve(false);
      }
    });
    
    child.on('error', (error) => {
      console.error(`${threadPrefix} ❌ 프로세스 실행 오류:`, error.message);
      reject(error);
    });
  });
}

/**
 * 스레드 워커 - 무한 루프 실행
 * @param {number} threadId - 스레드 ID
 */
async function threadWorker(threadId) {
  const threadPrefix = `[Thread ${threadId}]`;
  let consecutiveFailures = 0;
  
  console.log(`${threadPrefix} 🔄 무한 루프 시작`);
  
  while (true) {
    try {
      // 작업 실행
      const success = await runSingleTask(threadId);
      
      // 통계 업데이트
      stats.totalRuns++;
      if (success) {
        stats.successCount++;
        consecutiveFailures = 0;
        
        // 성공 시 3초 대기
        console.log(`${threadPrefix} ⏳ 성공 - ${CONFIG.SUCCESS_DELAY/1000}초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.SUCCESS_DELAY));
        
      } else {
        stats.failCount++;
        consecutiveFailures++;
        
        // 실패 시 짧은 대기
        console.log(`${threadPrefix} ⏳ 실패 - ${CONFIG.FAIL_DELAY/1000}초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.FAIL_DELAY));
        
        // 연속 실패 시 긴 대기
        if (consecutiveFailures >= CONFIG.MAX_RETRIES) {
          console.log(`${threadPrefix} ⚠️ 연속 ${consecutiveFailures}회 실패 - ${CONFIG.RESTART_DELAY/1000}초 대기`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.RESTART_DELAY));
          consecutiveFailures = 0;
        }
      }
      
    } catch (error) {
      console.error(`${threadPrefix} ❌ 예외 발생:`, error.message);
      console.log(`${threadPrefix} ⏳ ${CONFIG.RESTART_DELAY/1000}초 후 재시작...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RESTART_DELAY));
    }
  }
}

/**
 * 통계 출력
 */
function printStats() {
  const uptime = (Date.now() - stats.startTime.getTime()) / 1000;
  const successRate = stats.totalRuns > 0 ? 
    (stats.successCount / stats.totalRuns * 100).toFixed(1) : 0;
  
  console.log('\n📊 실행 통계');
  console.log('─'.repeat(60));
  console.log(`⏱️ 가동 시간: ${(uptime / 60).toFixed(1)}분`);
  console.log(`🔧 동시 실행: ${CONFIG.THREADS}개 스레드`);
  console.log(`📋 총 실행: ${stats.totalRuns}회`);
  console.log(`✅ 성공: ${stats.successCount}회`);
  console.log(`❌ 실패: ${stats.failCount}회`);
  console.log(`📈 성공률: ${successRate}%`);
  if (uptime > 0) {
    console.log(`⚡ 처리량: ${(stats.successCount / (uptime / 60)).toFixed(1)} 성공/분`);
  }
  console.log('─'.repeat(60));
}

/**
 * 메인 함수
 */
async function main() {
  console.log('🚀 무한 루프 실행 시작');
  console.log(`📍 설정: ${CONFIG.THREADS}개 동시 실행, 성공 시 ${CONFIG.SUCCESS_DELAY/1000}초 대기`);
  console.log('─'.repeat(60));
  
  // 통계 출력 타이머 (1분마다)
  setInterval(printStats, 60000);
  
  // 모든 스레드 시작
  const workers = [];
  for (let i = 1; i <= CONFIG.THREADS; i++) {
    // 스레드 시작 시차 (0.5초)
    await new Promise(resolve => setTimeout(resolve, 500));
    workers.push(threadWorker(i));
  }
  
  // 모든 워커 대기 (무한 루프이므로 실제로 종료되지 않음)
  await Promise.all(workers);
}

// 우아한 종료 처리
process.on('SIGINT', () => {
  console.log('\n🛑 종료 신호 수신');
  printStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 종료 신호 수신');
  printStats();
  process.exit(0);
});

// 실행
if (require.main === module) {
  main().catch(console.error);
}