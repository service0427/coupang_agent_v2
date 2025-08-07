/**
 * ERR_HTTP2_PROTOCOL_ERROR가 어디서 발생하는지 정확히 찾는 도구
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function debugErrorLocation() {
  try {
    console.log('🔍 ERR_HTTP2_PROTOCOL_ERROR 발생 위치 분석');
    console.log('─'.repeat(60));
    
    // 최근 ERR_HTTP2_PROTOCOL_ERROR 발생한 실행들의 상세 분석
    const errorExecutions = await dbServiceV2.query(`
      SELECT 
        id, keyword, critical_error_message, last_successful_stage, 
        started_at, search_mode
      FROM v2_execution_logs 
      WHERE critical_error_message LIKE '%ERR_HTTP2_PROTOCOL_ERROR%'
        AND started_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY started_at DESC
      LIMIT 5
    `);
    
    if (errorExecutions.rows.length === 0) {
      console.log('최근 10분간 ERR_HTTP2_PROTOCOL_ERROR 없음');
      return;
    }
    
    console.log(`발견된 에러 실행: ${errorExecutions.rows.length}개\n`);
    
    for (const exec of errorExecutions.rows) {
      console.log(`📋 실행 ID ${exec.id}: ${exec.keyword}`);
      console.log(`   검색 모드: ${exec.search_mode ? 'SEARCH' : 'GOTO'}`);
      console.log(`   단계: ${exec.last_successful_stage}`);
      console.log(`   에러 메시지: ${exec.critical_error_message.substring(0, 100)}...`);
      
      // 해당 실행의 액션 로그 확인
      const actionLogs = await dbServiceV2.query(`
        SELECT action_type, action_target, started_at, completed_at
        FROM v2_action_logs 
        WHERE execution_id = $1
        ORDER BY started_at DESC
        LIMIT 3
      `, [exec.id]);
      
      if (actionLogs.rows.length > 0) {
        console.log('   액션 로그:');
        actionLogs.rows.forEach(action => {
          console.log(`     • ${action.action_type}: ${action.action_target}`);
        });
      } else {
        console.log('   ⚠️ 액션 로그 없음 - 메인 플로우에서 에러 발생');
      }
      
      // v2_error_logs에서 해당 실행의 에러 확인
      const v2Errors = await dbServiceV2.query(`
        SELECT error_code, action_type, occurred_at
        FROM v2_error_logs 
        WHERE execution_id = $1
        ORDER BY occurred_at DESC
      `, [exec.id]);
      
      if (v2Errors.rows.length > 0) {
        console.log(`   ✅ V2 에러 로그: ${v2Errors.rows.length}개`);
        v2Errors.rows.forEach(error => {
          console.log(`     • ${error.error_code} (${error.action_type})`);
        });
      } else {
        console.log('   ❌ V2 에러 로그 없음 - 로깅 누락');
      }
      
      console.log('');
    }
    
    // 분석 결과
    console.log('🔍 분석 결과');
    console.log('─'.repeat(30));
    
    const allSearchMode = errorExecutions.rows.every(exec => exec.search_mode);
    const allStageZero = errorExecutions.rows.every(exec => exec.last_successful_stage === 0);
    const allNoActionLog = await Promise.all(
      errorExecutions.rows.map(async exec => {
        const actions = await dbServiceV2.query(`
          SELECT COUNT(*) as count FROM v2_action_logs WHERE execution_id = $1
        `, [exec.id]);
        return parseInt(actions.rows[0].count) === 0;
      })
    );
    
    if (allSearchMode) {
      console.log('✅ 모든 에러가 SEARCH 모드에서 발생');
    }
    
    if (allStageZero) {
      console.log('✅ 모든 에러가 단계 0에서 발생 (페이지 접근 실패)');
    }
    
    if (allNoActionLog.every(noLog => noLog)) {
      console.log('✅ 모든 에러에서 액션 로그 없음 (메인 플로우 에러)');
      console.log('💡 결론: search-mode-handler가 아닌 다른 곳에서 에러 발생');
    } else {
      console.log('✅ 일부 실행에서 액션 로그 있음 (search-mode-handler 진입)');
    }
    
  } catch (error) {
    console.error('❌ 디버깅 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

debugErrorLocation();