const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkCurrentExecutions() {
  try {
    const inProgress = await dbServiceV2.query(`
      SELECT 
        id, agent, keyword, started_at, last_successful_stage,
        EXTRACT(EPOCH FROM (NOW() - started_at)) as running_seconds
      FROM v2_execution_logs 
      WHERE final_status = 'in_progress'
        AND agent = 'test1'
      ORDER BY started_at DESC
    `);
    
    console.log(`현재 test1 실행 중: ${inProgress.rows.length}개`);
    
    inProgress.rows.forEach(exec => {
      const runningMinutes = Math.round(exec.running_seconds / 60);
      console.log(`ID ${exec.id}: ${exec.keyword}`);
      console.log(`  실행시간: ${runningMinutes}분`);
      console.log(`  단계: ${exec.last_successful_stage}`);
    });
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkCurrentExecutions();