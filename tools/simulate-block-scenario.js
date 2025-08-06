const searchModeManager = require('../lib/services/search-mode-manager');

async function simulateBlockScenario() {
  const agent = 'test';
  
  console.log('🚫 차단 시나리오 시뮬레이션 시작...\n');
  
  try {
    // 5번의 연속 차단 시뮬레이션
    for (let i = 1; i <= 6; i++) {
      console.log(`${i}번째 차단 기록...`);
      await searchModeManager.recordBlockedExecution(agent, 'goto');
      
      // 현재 모드 확인
      const modeResult = await searchModeManager.getSearchMode(agent);
      console.log(`  현재 모드: ${modeResult.mode} (${modeResult.reason})`);
      
      if (modeResult.mode === 'search') {
        console.log('🔄 자동 전환 완료!\n');
        break;
      }
      console.log('');
    }
    
    console.log('--- 전환 후 search 모드 실행 시뮬레이션 ---\n');
    
    // search 모드에서 20번 실행 시뮬레이션
    for (let i = 1; i <= 21; i++) {
      if (i <= 20) {
        console.log(`${i}번째 search 모드 실행...`);
        await searchModeManager.recordSuccessfulExecution(agent, 'search');
      }
      
      // 현재 모드 확인
      const modeResult = await searchModeManager.getSearchMode(agent);
      console.log(`  현재 모드: ${modeResult.mode} (${modeResult.reason})`);
      
      if (modeResult.mode === 'goto' && i > 20) {
        console.log('🔄 goto 모드로 복귀!\n');
        break;
      }
      console.log('');
    }
    
    console.log('✅ 시뮬레이션 완료!');
    
  } catch (error) {
    console.error('❌ 시뮬레이션 실패:', error.message);
  }
}

simulateBlockScenario();