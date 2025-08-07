/**
 * 개선된 console_logs와 network_state 로깅 테스트
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function testEnhancedLogging() {
  try {
    console.log('🔍 개선된 V2 에러 로깅 테스트');
    console.log('─'.repeat(50));
    
    // 최근 5분간의 에러 로그에서 console_logs와 network_state 확인
    const recentErrors = await dbServiceV2.query(`
      SELECT 
        id, execution_id, error_code, action_type, occurred_at,
        CASE 
          WHEN console_logs IS NOT NULL THEN LENGTH(console_logs) 
          ELSE 0 
        END as console_logs_length,
        CASE 
          WHEN network_state IS NOT NULL THEN LENGTH(network_state) 
          ELSE 0 
        END as network_state_length,
        console_logs IS NOT NULL as has_console_logs,
        network_state IS NOT NULL as has_network_state
      FROM v2_error_logs 
      WHERE occurred_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY occurred_at DESC
      LIMIT 10
    `);
    
    if (recentErrors.rows.length > 0) {
      console.log(`발견된 최근 에러: ${recentErrors.rows.length}개\\n`);
      
      recentErrors.rows.forEach(error => {
        const timeAgo = Math.round((Date.now() - new Date(error.occurred_at)) / (1000 * 60));
        console.log(`📋 에러 ID ${error.id} (실행 ${error.execution_id})`);
        console.log(`   에러코드: ${error.error_code}`);
        console.log(`   액션타입: ${error.action_type}`);
        console.log(`   시간: ${timeAgo}분 전`);
        console.log(`   Console 로그: ${error.has_console_logs ? `✅ (${error.console_logs_length} bytes)` : '❌ 없음'}`);
        console.log(`   Network 상태: ${error.has_network_state ? `✅ (${error.network_state_length} bytes)` : '❌ 없음'}`);
        console.log('');
      });
      
      // 가장 최근 에러의 상세 내용 확인
      const latestError = await dbServiceV2.query(`
        SELECT console_logs, network_state
        FROM v2_error_logs 
        WHERE id = $1
      `, [recentErrors.rows[0].id]);
      
      if (latestError.rows[0] && (latestError.rows[0].console_logs || latestError.rows[0].network_state)) {
        console.log('🔍 최신 에러의 상세 정보:');
        console.log('─'.repeat(30));
        
        if (latestError.rows[0].console_logs) {
          console.log('📋 Console Logs:');
          try {
            const consoleLogs = JSON.parse(latestError.rows[0].console_logs);
            console.log(JSON.stringify(consoleLogs, null, 2).substring(0, 500) + '...');
          } catch (e) {
            console.log(latestError.rows[0].console_logs.substring(0, 200) + '...');
          }
          console.log('');
        }
        
        if (latestError.rows[0].network_state) {
          console.log('🌐 Network State:');
          try {
            const networkState = JSON.parse(latestError.rows[0].network_state);
            console.log(JSON.stringify(networkState, null, 2));
          } catch (e) {
            console.log(latestError.rows[0].network_state.substring(0, 200) + '...');
          }
        }
      }
    } else {
      console.log('⚠️ 최근 5분간 에러 로그 없음');
    }
    
  } catch (error) {
    console.error('❌ 테스트 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

testEnhancedLogging();