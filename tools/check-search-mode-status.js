/**
 * 현재 로컬의 검색 모드 상태 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkSearchModeStatus() {
  console.log('🔍 현재 검색 모드 상태 확인');
  
  try {
    // 최근 2시간 실행 모드 확인
    const agentModes = await dbServiceV2.query(\);
    
    console.log('\n📊 에이전트별 실행 모드:');
    console.log('─'.repeat(50));
    
    const agentSummary = {};
    agentModes.rows.forEach(row => {
      if (\!agentSummary[row.agent]) {
        agentSummary[row.agent] = { goto: null, search: null };
      }
      const mode = row.search_mode ? 'search' : 'goto';
      agentSummary[row.agent][mode] = {
        count: parseInt(row.execution_count),
        success: parseInt(row.success_count),
        lastExecution: row.last_execution
      };
    });
    
    let gotoTotal = 0, searchTotal = 0;
    
    Object.entries(agentSummary).forEach(([agent, modes]) => {
      console.log(\);
      
      if (modes.goto) {
        const rate = ((modes.goto.success / modes.goto.count) * 100).toFixed(1);
        console.log(\);
        gotoTotal += modes.goto.count;
      }
      
      if (modes.search) {
        const rate = ((modes.search.success / modes.search.count) * 100).toFixed(1);
        console.log(\);
        searchTotal += modes.search.count;
      }
      
      // 현재 모드
      let currentMode = 'goto';
      if (modes.goto && modes.search) {
        currentMode = new Date(modes.goto.lastExecution) > new Date(modes.search.lastExecution) ? 'goto' : 'search';
      } else if (modes.search) {
        currentMode = 'search';
      }
      
      console.log(\);
    });
    
    console.log('\n📊 전체 통계:');
    console.log(\);
    console.log(\);
    
    if (searchTotal > gotoTotal) {
      console.log('\n🔍 현재 주로 SEARCH 모드 사용 중');
      console.log('💭 GOTO에서 에러 발생으로 SEARCH로 전환된 것으로 보임');
    } else {
      console.log('\n📍 현재 주로 GOTO 모드 사용 중');
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkSearchModeStatus();
