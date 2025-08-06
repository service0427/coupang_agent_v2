const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkAllV2Logs() {
  console.log('=== V2 전체 로그 확인 ===\n');
  
  // 1. 실행 로그
  const execResult = await dbServiceV2.query(`
    SELECT id, keyword, product_code, final_status, overall_success, 
           stage1_search_status, stage2_find_status, stage3_click_status, stage4_cart_status
    FROM v2_execution_logs
    ORDER BY started_at DESC
    LIMIT 3
  `);
  
  console.log('📋 v2_execution_logs (최근 3개):');
  execResult.rows.forEach(row => {
    console.log(`  ID:${row.id} - ${row.keyword} (${row.product_code})`);
    console.log(`    최종: ${row.final_status} / 성공: ${row.overall_success}`);
    console.log(`    단계: 1-${row.stage1_search_status} | 2-${row.stage2_find_status} | 3-${row.stage3_click_status} | 4-${row.stage4_cart_status}\n`);
  });
  
  // 2. 액션 로그
  const actionResult = await dbServiceV2.query(`
    SELECT COUNT(*) as count, 
           COUNT(DISTINCT execution_id) as exec_count,
           COUNT(DISTINCT action_type) as type_count
    FROM v2_action_logs
    WHERE started_at >= NOW() - INTERVAL '1 hour'
  `);
  
  console.log('🎯 v2_action_logs:');
  console.log(`  총 액션: ${actionResult.rows[0].count}개`);
  console.log(`  실행 ID: ${actionResult.rows[0].exec_count}개`);
  console.log(`  액션 타입: ${actionResult.rows[0].type_count}개\n`);
  
  // 3. 네트워크 로깅 (v2_network_logs 제거됨)
  console.log('🌐 네트워크 로깅:');
  console.log(`  v2_network_logs 테이블 제거됨 (v2_execution_logs.total_traffic_mb 사용)\n`);
  
  // 4. 상품 추적 로그
  const productResult = await dbServiceV2.query(`
    SELECT COUNT(*) as count,
           COUNT(DISTINCT execution_id) as exec_count,
           SUM(CASE WHEN target_found THEN 1 ELSE 0 END) as found_count,
           AVG(products_in_page) as avg_products
    FROM v2_product_tracking
  `);
  
  console.log('📦 v2_product_tracking:');
  console.log(`  총 페이지: ${productResult.rows[0].count}개`);
  console.log(`  실행 ID: ${productResult.rows[0].exec_count}개`);
  console.log(`  찾은 상품: ${productResult.rows[0].found_count}개`);
  console.log(`  평균 상품/페이지: ${Math.round(productResult.rows[0].avg_products)}개\n`);
  
  // 5. 에러 로그
  const errorResult = await dbServiceV2.query(`
    SELECT COUNT(*) as count,
           COUNT(DISTINCT error_code) as code_count,
           COUNT(DISTINCT execution_id) as exec_count
    FROM v2_error_logs
  `);
  
  console.log('❌ v2_error_logs:');
  console.log(`  총 에러: ${errorResult.rows[0].count}개`);
  console.log(`  에러 코드: ${errorResult.rows[0].code_count}개`);
  console.log(`  실행 ID: ${errorResult.rows[0].exec_count}개\n`);
  
  // 6. 키워드 통계
  const keywordResult = await dbServiceV2.query(`
    SELECT keyword, product_code, current_executions, success_count, fail_count, block_count
    FROM v2_test_keywords
    WHERE agent = 'test'
    ORDER BY id
  `);
  
  console.log('📊 v2_test_keywords 통계:');
  keywordResult.rows.forEach(row => {
    console.log(`  ${row.keyword} (${row.product_code})`);
    console.log(`    실행: ${row.current_executions} / 성공: ${row.success_count} / 실패: ${row.fail_count} / 차단: ${row.block_count}`);
  });
  
  await dbServiceV2.close();
}

checkAllV2Logs().catch(console.error);