const dbServiceV2 = require('../lib/services/db-service-v2');

async function truncateAllV2Tables() {
  console.log('🗑️  V2 테이블 전체 초기화 시작...');
  
  try {
    // 순서대로 삭제 (v2_network_logs는 제거됨)
    console.log('1. v2_product_tracking 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_product_tracking CASCADE');
    
    console.log('2. v2_error_logs 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_error_logs CASCADE');
    
    console.log('3. v2_action_logs 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_action_logs CASCADE');
    
    console.log('4. v2_execution_logs 초기화...');
    await dbServiceV2.query('TRUNCATE TABLE v2_execution_logs CASCADE');
    
    // 키워드 실행 카운터만 리셋 (키워드 자체는 유지)
    console.log('5. v2_test_keywords 실행 카운터 리셋...');
    await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET current_executions = 0, 
          success_count = 0, 
          fail_count = 0, 
          block_count = 0,
          last_executed_at = NULL,
          last_blocked_at = NULL
    `);
    
    console.log('✅ V2 테이블 전체 초기화 완료!');
    console.log('   - 모든 실행/액션/에러 로그 삭제');
    console.log('   - 키워드 실행 카운터 리셋 완료');
    
  } catch (error) {
    console.error('❌ 초기화 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

truncateAllV2Tables();