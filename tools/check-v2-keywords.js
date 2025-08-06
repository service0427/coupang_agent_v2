const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkV2Keywords() {
  console.log('=== V2 키워드 확인 ===');
  
  const result = await dbServiceV2.query(`
    SELECT id, keyword, product_code, agent, current_executions, success_count, fail_count
    FROM v2_test_keywords
    WHERE agent = 'test'
    ORDER BY id
  `);
  
  console.log(`\n총 ${result.rows.length}개 키워드:`);
  result.rows.forEach(row => {
    console.log(`  ID:${row.id} - ${row.keyword} (${row.product_code}) - 실행:${row.current_executions}/성공:${row.success_count}/실패:${row.fail_count}`);
  });
  
  // V2 실행 로그 확인
  console.log('\n=== V2 실행 로그 확인 ===');
  const execResult = await dbServiceV2.query(`
    SELECT id, keyword, product_code, agent, started_at, final_status
    FROM v2_execution_logs
    ORDER BY started_at DESC
    LIMIT 10
  `);
  
  console.log(`\n최근 실행 로그 ${execResult.rows.length}개:`);
  execResult.rows.forEach(row => {
    console.log(`  ID:${row.id} - ${row.keyword} (${row.product_code}) - ${row.agent} - ${row.final_status} - ${row.started_at}`);
  });
  
  await dbServiceV2.close();
}

checkV2Keywords().catch(console.error);