const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkMode() {
  try {
    const result = await dbServiceV2.query(`
      SELECT 
        agent,
        search_mode,
        COUNT(*) as count,
        MAX(started_at) as last_execution
      FROM v2_execution_logs 
      WHERE started_at >= NOW() - INTERVAL '2 hour'
      GROUP BY agent, search_mode
      ORDER BY agent, search_mode
    `);
    
    console.log('최근 2시간 실행 모드:');
    console.log('─'.repeat(40));
    
    let gotoTotal = 0, searchTotal = 0;
    const agents = {};
    
    result.rows.forEach(row => {
      const mode = row.search_mode ? 'SEARCH' : 'GOTO';
      const count = parseInt(row.count);
      
      if (!agents[row.agent]) agents[row.agent] = {};
      agents[row.agent][mode] = { count, lastExecution: row.last_execution };
      
      if (mode === 'GOTO') gotoTotal += count;
      else searchTotal += count;
    });
    
    Object.entries(agents).forEach(([agent, modes]) => {
      console.log(`${agent}:`);
      if (modes.GOTO) console.log(`  GOTO: ${modes.GOTO.count}회`);
      if (modes.SEARCH) console.log(`  SEARCH: ${modes.SEARCH.count}회`);
      
      let current = 'GOTO';
      if (modes.GOTO && modes.SEARCH) {
        current = new Date(modes.GOTO.lastExecution) > new Date(modes.SEARCH.lastExecution) ? 'GOTO' : 'SEARCH';
      } else if (modes.SEARCH) {
        current = 'SEARCH';
      }
      console.log(`  현재: ${current}`);
      console.log('');
    });
    
    console.log(`전체: GOTO ${gotoTotal}회, SEARCH ${searchTotal}회`);
    
    if (searchTotal > gotoTotal) {
      console.log('현재 주로 SEARCH 모드 사용 중');
    } else {
      console.log('현재 주로 GOTO 모드 사용 중');
    }
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkMode();