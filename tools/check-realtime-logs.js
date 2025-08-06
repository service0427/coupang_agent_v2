/**
 * 실시간 로그 상태 확인 도구
 * 동시 작업 진행 중 로그들이 제대로 쌓이고 있는지 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkRealtimeLogs() {
  console.log('🔍 실시간 로그 상태 확인');
  console.log('시간:', new Date().toLocaleString('ko-KR'));
  console.log('');
  
  try {
    // 1. 최근 5분간 실행 로그
    const recentExecutions = await dbServiceV2.query(`
      SELECT id, started_at, keyword, agent, final_status, overall_success
      FROM v2_execution_logs 
      WHERE started_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY started_at DESC
    `);
    
    console.log(`📋 최근 5분간 실행 로그: ${recentExecutions.rows.length}개`);
    recentExecutions.rows.forEach(row => {
      const status = row.overall_success ? '✅' : '❌';
      const timeAgo = Math.round((Date.now() - new Date(row.started_at)) / 1000);
      console.log(`  ${status} ID ${row.id}: ${row.keyword} (${row.agent}) - ${row.final_status} [${timeAgo}초 전]`);
    });
    
    console.log('');
    
    // 2. 현재 진행 중인 실행
    const inProgress = await dbServiceV2.query(`
      SELECT id, started_at, keyword, agent, final_status
      FROM v2_execution_logs 
      WHERE final_status = 'in_progress'
      ORDER BY started_at DESC
    `);
    
    console.log(`⏳ 진행 중인 실행: ${inProgress.rows.length}개`);
    inProgress.rows.forEach(row => {
      const duration = Math.round((Date.now() - new Date(row.started_at)) / 1000);
      console.log(`  🔄 ID ${row.id}: ${row.keyword} (${row.agent}) - ${duration}초 진행 중`);
    });
    
    console.log('');
    
    // 3. 최근 1분간 에러 로그
    const recentErrors = await dbServiceV2.query(`
      SELECT COUNT(*) as error_count,
             COUNT(DISTINCT execution_id) as affected_executions
      FROM v2_error_logs 
      WHERE created_at >= NOW() - INTERVAL '1 minute'
    `);
    
    console.log(`🚨 최근 1분간 에러: ${recentErrors.rows[0].error_count}개`);
    console.log(`   영향받은 실행: ${recentErrors.rows[0].affected_executions}개`);
    
    // 4. 최근 액션 로그
    const recentActions = await dbServiceV2.query(`
      SELECT COUNT(*) as action_count,
             COUNT(DISTINCT execution_id) as active_executions
      FROM v2_action_logs 
      WHERE created_at >= NOW() - INTERVAL '2 minutes'
    `);
    
    console.log(`⚡ 최근 2분간 액션 로그: ${recentActions.rows[0].action_count}개`);
    console.log(`   활성 실행: ${recentActions.rows[0].active_executions}개`);
    
    console.log('');
    
    // 5. 테이블별 전체 로그 카운트
    const totalStats = await dbServiceV2.query(`
      SELECT 
        (SELECT COUNT(*) FROM v2_execution_logs) as total_executions,
        (SELECT COUNT(*) FROM v2_error_logs) as total_errors,
        (SELECT COUNT(*) FROM v2_action_logs) as total_actions,
        (SELECT COUNT(*) FROM v2_product_tracking) as total_product_tracking
    `);
    
    console.log('📊 전체 로그 통계:');
    const stats = totalStats.rows[0];
    console.log(`   실행 로그: ${stats.total_executions}개`);
    console.log(`   에러 로그: ${stats.total_errors}개`);
    console.log(`   액션 로그: ${stats.total_actions}개`);
    console.log(`   상품 추적: ${stats.total_product_tracking}개`);
    
  } catch (error) {
    console.error('❌ 로그 확인 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkRealtimeLogs();