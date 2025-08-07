/**
 * 전체 차단 감지 시스템 테스트
 * - 사용법: node tools/test-global-block-detector.js [command]
 * - Commands: status, start, stop, manual-reset, simulate
 */

const globalBlockDetector = require('../lib/services/global-block-detector');
const dbServiceV2 = require('../lib/services/db-service-v2');

async function main() {
  const command = process.argv[2] || 'status';
  
  console.log('🛡️ 전체 차단 감지 시스템 테스트\n');
  
  try {
    switch (command) {
      case 'status':
        await showStatus();
        break;
      case 'start':
        await startDetector();
        break;
      case 'stop':
        await stopDetector();
        break;
      case 'manual-reset':
        await manualReset();
        break;
      case 'simulate':
        await simulateBlocking();
        break;
      case 'check':
        await oneTimeCheck();
        break;
      default:
        showUsage();
    }
  } catch (error) {
    console.error('❌ 실행 실패:', error.message);
  }
}

/**
 * 현재 상태 표시
 */
async function showStatus() {
  console.log('📊 현재 상태 확인\n');
  
  const status = await globalBlockDetector.getStatus();
  
  console.log(`🔍 감지 시스템: ${status.isRunning ? '🟢 실행중' : '🔴 중지'}`);
  console.log(`📈 전체 에이전트: ${status.totalAgents}개`);
  console.log(`🚨 차단된 에이전트: ${status.blockedAgents}개`);
  console.log(`📊 차단 비율: ${status.blockingRate}% (임계값: ${status.threshold}%)`);
  console.log(`⏰ 마지막 리셋: ${status.lastResetTime > 0 ? new Date(status.lastResetTime).toLocaleString('ko-KR') : '없음'}`);
  console.log(`🕒 쿨다운 남은 시간: ${status.cooldownRemaining > 0 ? status.cooldownRemaining + '분' : '없음'}`);
  
  // 에이전트별 상세 상태
  console.log('\n📋 에이전트별 상세 상태:');
  const agents = await dbServiceV2.query(`
    SELECT 
      agent,
      COUNT(*) as total_keywords,
      COUNT(CASE WHEN consecutive_blocks >= 3 THEN 1 END) as high_risk,
      MAX(consecutive_blocks) as max_blocks,
      AVG(consecutive_blocks)::numeric(4,1) as avg_blocks
    FROM v2_test_keywords
    GROUP BY agent
    ORDER BY max_blocks DESC
  `);
  
  console.log('에이전트\t키워드\t위험\t최대차단\t평균차단\t상태');
  console.log('='.repeat(60));
  
  agents.rows.forEach(row => {
    const status = row.max_blocks >= 5 ? '🔴 위험' :
                  row.max_blocks >= 3 ? '🟡 주의' : '🟢 안전';
    
    console.log(`${row.agent.padEnd(12)}\t${row.total_keywords}\t${row.high_risk}\t${row.max_blocks}\t\t${row.avg_blocks}\t${status}`);
  });
}

/**
 * 감지 시스템 시작
 */
async function startDetector() {
  console.log('🟢 전체 차단 감지 시스템 시작');
  globalBlockDetector.start();
  
  console.log('✅ 감지 시스템이 백그라운드에서 실행됩니다.');
  console.log('📝 30초마다 전체 차단 상황을 모니터링합니다.');
  console.log('🚨 80% 이상 에이전트 차단 시 모든 유저폴더를 자동 삭제합니다.');
  
  // 10초 후 종료 (데모용)
  setTimeout(() => {
    console.log('\n⏰ 데모 종료 - 실제 사용 시 계속 실행됩니다.');
    process.exit(0);
  }, 10000);
}

/**
 * 감지 시스템 중지
 */
async function stopDetector() {
  console.log('🔴 전체 차단 감지 시스템 중지');
  globalBlockDetector.stop();
  console.log('✅ 감지 시스템이 중지되었습니다.');
}

/**
 * 수동 전체 리셋
 */
async function manualReset() {
  console.log('🚨 수동 전체 리셋 실행');
  
  const confirm = process.argv[3];
  if (confirm !== 'confirm') {
    console.log('❌ 위험한 작업입니다. 확인을 위해 다음과 같이 실행하세요:');
    console.log('   node tools/test-global-block-detector.js manual-reset confirm');
    return;
  }
  
  console.log('⚠️ 모든 유저 프로필이 삭제됩니다!');
  console.log('🔄 3초 후 실행...');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await globalBlockDetector.manualGlobalReset('manual_test');
  console.log('✅ 수동 전체 리셋 완료');
}

/**
 * 차단 상황 시뮬레이션
 */
async function simulateBlocking() {
  console.log('🧪 차단 상황 시뮬레이션');
  
  try {
    // 테스트용으로 일부 에이전트의 차단 카운트 증가
    const testAgents = ['u24', 'u22', 'vm-win11'];
    
    for (const agent of testAgents) {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET consecutive_blocks = 5,
            mode_switch_reason = 'test_simulation'
        WHERE agent = $1
      `, [agent]);
      
      console.log(`   ✅ ${agent} 에이전트 차단 상황 시뮬레이션`);
    }
    
    console.log('📊 시뮬레이션 완료 - status 명령어로 확인하세요');
    console.log('💡 복원: node tools/test-global-block-detector.js restore');
    
  } catch (error) {
    console.error('❌ 시뮬레이션 실패:', error.message);
  }
}

/**
 * 일회성 체크
 */
async function oneTimeCheck() {
  console.log('🔍 일회성 전체 차단 검사');
  await globalBlockDetector.checkGlobalBlocking();
  console.log('✅ 검사 완료');
}

/**
 * 시뮬레이션 복원
 */
async function restore() {
  console.log('🔄 시뮬레이션 복원');
  
  await dbServiceV2.query(`
    UPDATE v2_test_keywords 
    SET consecutive_blocks = 0,
        mode_switch_reason = 'test_restore'
    WHERE mode_switch_reason = 'test_simulation'
  `);
  
  console.log('✅ 복원 완료');
}

/**
 * 사용법 표시
 */
function showUsage() {
  console.log('📖 사용법:');
  console.log('   node tools/test-global-block-detector.js status        # 현재 상태 확인');
  console.log('   node tools/test-global-block-detector.js start         # 감지 시스템 시작');
  console.log('   node tools/test-global-block-detector.js stop          # 감지 시스템 중지');
  console.log('   node tools/test-global-block-detector.js check         # 일회성 검사');
  console.log('   node tools/test-global-block-detector.js simulate      # 차단 상황 시뮬레이션');
  console.log('   node tools/test-global-block-detector.js manual-reset confirm  # 수동 전체 리셋');
  console.log('');
  console.log('⚠️  주의사항:');
  console.log('   - manual-reset은 모든 유저 프로필을 삭제합니다');
  console.log('   - 실제 운영에서는 start 명령을 사용하여 지속적으로 모니터링하세요');
  console.log('   - 80% 이상 에이전트 차단 시 자동으로 전체 리셋됩니다');
}

// 복원 명령어 처리
if (process.argv[2] === 'restore') {
  restore().then(() => process.exit(0)).catch(error => {
    console.error('❌ 복원 실패:', error.message);
    process.exit(1);
  });
} else {
  main().then(() => {
    if (!['start'].includes(process.argv[2])) {
      process.exit(0);
    }
  }).catch(error => {
    console.error('❌ 실행 실패:', error.message);
    process.exit(1);
  });
}