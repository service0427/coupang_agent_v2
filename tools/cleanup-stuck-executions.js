/**
 * 멈춘 실행들 정리 도구
 * - 30분 이상 멈춰있는 실행들을 실패 처리
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function cleanupStuckExecutions() {
  console.log('🧹 멈춘 실행 정리 시작\n');
  
  try {
    // 30분 이상 멈춘 실행들 조회
    const stuckExecutions = await dbServiceV2.query(`
      SELECT 
        id, started_at, keyword, product_code, agent,
        final_status, last_successful_stage,
        EXTRACT(EPOCH FROM (NOW() - started_at)) as running_seconds
      FROM v2_execution_logs 
      WHERE final_status = 'in_progress'
        AND started_at < NOW() - INTERVAL '30 minutes'
      ORDER BY started_at ASC
    `);
    
    console.log(`발견된 멈춘 실행: ${stuckExecutions.rows.length}개`);
    
    if (stuckExecutions.rows.length === 0) {
      console.log('✅ 정리할 멈춘 실행이 없습니다.');
      return;
    }
    
    console.log('\n🔧 정리 시작...');
    console.log('─'.repeat(50));
    
    let cleanedCount = 0;
    let failedCount = 0;
    
    for (const execution of stuckExecutions.rows) {
      const runningMinutes = Math.round(execution.running_seconds / 60);
      
      try {
        // 에러 로그에서 마지막 에러 확인
        const lastError = await dbServiceV2.query(`
          SELECT error_code, error_message
          FROM v2_error_logs 
          WHERE execution_id = $1
          ORDER BY occurred_at DESC
          LIMIT 1
        `, [execution.id]);
        
        let errorInfo = null;
        if (lastError.rows.length > 0) {
          errorInfo = {
            code: lastError.rows[0].error_code,
            message: lastError.rows[0].error_message
          };
        }
        
        // 실행 완료 처리
        await dbServiceV2.completeExecutionV2(execution.id, {
          success: false,
          finalStatus: 'system_cleanup',
          errorMessage: errorInfo ? 
            `시스템 정리: ${errorInfo.code} - ${errorInfo.message.substring(0, 100)}...` :
            `시스템 정리: ${runningMinutes}분간 무응답으로 인한 자동 정리`,
          errorStep: 'stuck_execution_cleanup',
          cleanupReason: 'automated_cleanup',
          cleanupTime: new Date(),
          originalRunningMinutes: runningMinutes
        });
        
        console.log(`✅ ID ${execution.id}: ${execution.keyword} (${execution.agent}) - ${runningMinutes}분 정리`);
        cleanedCount++;
        
      } catch (error) {
        console.error(`❌ ID ${execution.id} 정리 실패:`, error.message);
        failedCount++;
      }
    }
    
    console.log('\n📊 정리 결과');
    console.log('─'.repeat(30));
    console.log(`✅ 정리 완료: ${cleanedCount}개`);
    console.log(`❌ 정리 실패: ${failedCount}개`);
    console.log(`📋 전체 처리: ${stuckExecutions.rows.length}개`);
    
    if (cleanedCount > 0) {
      console.log('\n🎉 멈춘 실행 정리 완료!');
      console.log('💡 이제 새로운 실행들이 정상적으로 완료될 것입니다.');
      console.log('🔧 coupang-handler.js의 finally 블록도 수정되어 앞으로는 이런 문제가 발생하지 않습니다.');
    }
    
  } catch (error) {
    console.error('❌ 정리 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

cleanupStuckExecutions();