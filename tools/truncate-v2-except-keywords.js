const dbServiceV2 = require('../lib/services/db-service-v2');

async function truncateV2ExceptKeywords() {
  console.log('🗑️  V2 테이블 초기화 시작 (v2_test_keywords 제외)...');
  
  try {
    // 1. v2_search_mode_history (외래키 참조하는 테이블부터)
    console.log('1. v2_search_mode_history 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_search_mode_history CASCADE');
    
    // 2. v2_search_mode_status 
    console.log('2. v2_search_mode_status 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_search_mode_status CASCADE');
    
    // 3. v2_product_tracking
    console.log('3. v2_product_tracking 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_product_tracking CASCADE');
    
    // 4. v2_error_logs
    console.log('4. v2_error_logs 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_error_logs CASCADE');
    
    // 5. v2_action_logs
    console.log('5. v2_action_logs 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_action_logs CASCADE');
    
    // 6. v2_execution_logs
    console.log('6. v2_execution_logs 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_execution_logs CASCADE');
    
    // 7. v2_test_keywords의 실행 카운터만 리셋 (테이블은 유지)
    console.log('7. v2_test_keywords 실행 카운터 리셋...');
    await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET current_executions = 0, 
          success_count = 0, 
          fail_count = 0, 
          block_count = 0,
          last_executed_at = NULL,
          last_blocked_at = NULL
    `);
    
    console.log('✅ V2 테이블 초기화 완료!');
    console.log('   - v2_test_keywords: 키워드 데이터 유지, 카운터만 리셋');
    console.log('   - 나머지 모든 V2 테이블: 완전 초기화');
    
  } catch (error) {
    console.error('❌ 초기화 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

truncateV2ExceptKeywords();