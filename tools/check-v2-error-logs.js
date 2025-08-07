const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkV2ErrorLogs() {
  try {
    console.log('🔍 최근 v2_error_logs 확인');
    console.log('─'.repeat(50));
    
    // 최근 5분간 v2_error_logs 확인
    const recentErrors = await dbServiceV2.query(`
      SELECT 
        execution_id, error_code, error_message, occurred_at, agent,
        keyword, action_type
      FROM v2_error_logs 
      WHERE occurred_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY occurred_at DESC
      LIMIT 10
    `);
    
    if (recentErrors.rows.length > 0) {
      console.log(`발견된 V2 에러: ${recentErrors.rows.length}개\n`);
      
      recentErrors.rows.forEach(error => {
        const timeAgo = Math.round((Date.now() - new Date(error.occurred_at)) / (1000 * 60));
        console.log(`❌ 실행 ID ${error.execution_id}: ${error.keyword}`);
        console.log(`   에러코드: ${error.error_code}`);
        console.log(`   액션타입: ${error.action_type}`);
        console.log(`   에이전트: ${error.agent}`);
        console.log(`   시간: ${timeAgo}분 전`);
        console.log('');
      });
    } else {
      console.log('⚠️ 최근 5분간 v2_error_logs에 기록된 에러 없음');
    }
    
    // 특정 실행들의 에러 로그 확인
    console.log('\n🔍 최근 실행들의 V2 에러 로그');
    console.log('─'.repeat(30));
    
    const specificErrors = await dbServiceV2.query(`
      SELECT execution_id, error_code, error_message, action_type
      FROM v2_error_logs 
      WHERE execution_id IN (1544, 1545, 1546, 1547, 1548)
      ORDER BY execution_id DESC
    `);
    
    if (specificErrors.rows.length > 0) {
      console.log(`발견된 특정 실행 에러: ${specificErrors.rows.length}개\n`);
      specificErrors.rows.forEach(error => {
        console.log(`✅ ID ${error.execution_id}: ${error.error_code} (${error.action_type})`);
      });
    } else {
      console.log('❌ 최근 실행들(1544-1548)의 V2 에러 로그 없음');
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkV2ErrorLogs();