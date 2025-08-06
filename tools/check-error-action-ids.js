/**
 * v2_error_logs의 action_id 상태 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkErrorActionIds() {
  console.log('🔍 v2_error_logs action_id 상태 확인');
  console.log('');
  
  try {
    // 1. action_id 상태 통계
    const stats = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_errors,
        COUNT(*) FILTER (WHERE action_id IS NOT NULL) as with_action_id,
        COUNT(*) FILTER (WHERE action_id IS NULL) as without_action_id,
        COUNT(DISTINCT execution_id) as affected_executions
      FROM v2_error_logs
    `);
    
    const data = stats.rows[0];
    console.log('📊 action_id 통계:');
    console.log(`   전체 에러 로그: ${data.total_errors}개`);
    console.log(`   action_id 있음: ${data.with_action_id}개`);
    console.log(`   action_id 없음: ${data.without_action_id}개`);
    console.log(`   영향받은 실행: ${data.affected_executions}개`);
    
    if (data.without_action_id > 0) {
      const percentage = ((data.without_action_id / data.total_errors) * 100).toFixed(1);
      console.log(`   ⚠️  action_id 누락률: ${percentage}%`);
    }
    
    console.log('');
    
    // 2. action_id가 없는 에러들의 패턴 분석
    const nullActionPatterns = await dbServiceV2.query(`
      SELECT 
        error_code,
        action_type,
        COUNT(*) as count
      FROM v2_error_logs 
      WHERE action_id IS NULL
      GROUP BY error_code, action_type
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('🔍 action_id 없는 에러 패턴:');
    nullActionPatterns.rows.forEach(row => {
      console.log(`   ${row.error_code} (${row.action_type || 'N/A'}): ${row.count}개`);
    });
    
    console.log('');
    
    // 3. 최근 에러 로그 샘플
    const recentErrors = await dbServiceV2.query(`
      SELECT 
        id, execution_id, action_id, error_code, error_message, action_type
      FROM v2_error_logs 
      ORDER BY id DESC 
      LIMIT 3
    `);
    
    console.log('📋 최근 에러 로그 샘플:');
    recentErrors.rows.forEach(row => {
      const actionStatus = row.action_id ? `✅ 액션 ID: ${row.action_id}` : '❌ 액션 ID: NULL';
      console.log(`   에러 ID ${row.id}: 실행 ${row.execution_id}`);
      console.log(`      ${actionStatus}`);
      console.log(`      에러: ${row.error_code}`);
      console.log(`      액션 타입: ${row.action_type || 'N/A'}`);
      console.log(`      메시지: ${row.error_message?.substring(0, 60)}...`);
      console.log('');
    });
    
    // 4. 문제 분석
    if (data.without_action_id > 0) {
      console.log('⚠️  분석 결과:');
      console.log('   action_id가 NULL인 에러들이 있습니다.');
      console.log('   이는 다음과 같은 경우에 발생할 수 있습니다:');
      console.log('   1. ActionLogger가 생성되기 전에 발생한 에러');
      console.log('   2. 메인 플로우에서 발생한 전역 에러');
      console.log('   3. 로깅 시 action_id가 전달되지 않은 경우');
      console.log('');
      console.log('💡 권장사항:');
      console.log('   - action_id가 없어도 에러 추적에는 문제없음');
      console.log('   - execution_id로 실행별 에러 추적 가능');
      console.log('   - 필요시 logErrorV2 호출 시 actionLogger.currentActionId 전달');
    } else {
      console.log('✅ 모든 에러 로그에 action_id가 정상적으로 기록되고 있습니다.');
    }
    
  } catch (error) {
    console.error('❌ 확인 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkErrorActionIds();