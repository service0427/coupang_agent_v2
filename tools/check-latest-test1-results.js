const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkLatestResults() {
  try {
    const latest = await dbServiceV2.query(`
      SELECT 
        id, keyword, started_at, final_status, overall_success,
        critical_error_message, last_successful_stage
      FROM v2_execution_logs 
      WHERE agent = 'test1'
      ORDER BY started_at DESC
      LIMIT 10
    `);
    
    console.log('test1 최근 실행 결과:');
    console.log('─'.repeat(50));
    
    latest.rows.forEach(exec => {
      const timeAgo = Math.round((Date.now() - new Date(exec.started_at)) / (1000 * 60));
      const status = exec.overall_success ? '✅' : '❌';
      
      console.log(`${status} ID ${exec.id}: ${exec.keyword}`);
      console.log(`  시간: ${timeAgo}분 전`);
      console.log(`  상태: ${exec.final_status}`);
      console.log(`  단계: ${exec.last_successful_stage}`);
      
      if (exec.critical_error_message) {
        console.log(`  에러: ${exec.critical_error_message.substring(0, 80)}...`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkLatestResults();