const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkV2Logs() {
  console.log('=== V2 실행 로그 확인 ===');
  
  // 최근 실행 로그
  const execResult = await dbServiceV2.query(`
    SELECT id, keyword, product_code, agent, started_at, completed_at, final_status, overall_success,
           stage1_search_status, stage2_find_status, stage3_click_status, stage4_cart_status
    FROM v2_execution_logs
    ORDER BY started_at DESC
    LIMIT 5
  `);
  
  console.log(`\n최근 실행 로그 ${execResult.rows.length}개:`);
  execResult.rows.forEach(row => {
    console.log(`  ID:${row.id} - ${row.keyword} (${row.product_code})`);
    console.log(`    상태: ${row.final_status} / 성공: ${row.overall_success}`);
    console.log(`    단계: 1-${row.stage1_search_status} | 2-${row.stage2_find_status} | 3-${row.stage3_click_status} | 4-${row.stage4_cart_status}`);
    console.log(`    시작: ${row.started_at} / 완료: ${row.completed_at || '진행중'}`);
    console.log('');
  });
  
  // 키워드 통계
  const statsResult = await dbServiceV2.query(`
    SELECT id, keyword, product_code, current_executions, success_count, fail_count, block_count
    FROM v2_test_keywords
    WHERE agent = 'test'
    ORDER BY id
  `);
  
  console.log('=== V2 키워드 통계 ===');
  statsResult.rows.forEach(row => {
    console.log(`  ID:${row.id} - ${row.keyword} (${row.product_code})`);
    console.log(`    실행:${row.current_executions} / 성공:${row.success_count} / 실패:${row.fail_count} / 차단:${row.block_count}`);
  });
  
  await dbServiceV2.close();
}

checkV2Logs().catch(console.error);