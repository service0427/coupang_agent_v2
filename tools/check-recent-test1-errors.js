const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkRecentTest1Errors() {
  try {
    console.log('🔍 test1 에이전트 최근 에러 로그 확인');
    console.log('─'.repeat(50));
    
    // 최근 10분간 test1 에러 확인
    const recentErrors = await dbServiceV2.query(`
      SELECT 
        el.id as execution_id,
        el.keyword,
        el.started_at,
        el.final_status,
        er.error_code,
        er.error_message,
        er.occurred_at
      FROM v2_error_logs er
      JOIN v2_execution_logs el ON er.execution_id = el.id
      WHERE el.agent = 'test1'
        AND er.occurred_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY er.occurred_at DESC
      LIMIT 10
    `);
    
    if (recentErrors.rows.length > 0) {
      console.log(`발견된 최근 에러: ${recentErrors.rows.length}개\n`);
      
      recentErrors.rows.forEach(error => {
        const timeAgo = Math.round((Date.now() - new Date(error.occurred_at)) / (1000 * 60));
        console.log(`❌ 실행 ID ${error.execution_id}: ${error.keyword}`);
        console.log(`   에러: ${error.error_code}`);
        console.log(`   메시지: ${error.error_message.substring(0, 100)}...`);
        console.log(`   발생시간: ${timeAgo}분 전`);
        console.log(`   최종상태: ${error.final_status}`);
        console.log('');
      });
    } else {
      console.log('✅ 최근 10분간 test1 에러 없음');
    }
    
    // 최근 1시간간 test1 실행 통계
    console.log('\n📊 test1 최근 1시간 실행 통계');
    console.log('─'.repeat(30));
    
    const stats = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_executions,
        COUNT(CASE WHEN overall_success = true THEN 1 END) as success_count,
        COUNT(CASE WHEN overall_success = false THEN 1 END) as fail_count,
        COUNT(CASE WHEN final_status = 'in_progress' THEN 1 END) as in_progress_count
      FROM v2_execution_logs 
      WHERE agent = 'test1'
        AND started_at >= NOW() - INTERVAL '1 hour'
    `);
    
    const stat = stats.rows[0];
    const successRate = stat.total_executions > 0 ? 
      ((stat.success_count / stat.total_executions) * 100).toFixed(1) : 0;
    
    console.log(`전체 실행: ${stat.total_executions}회`);
    console.log(`성공: ${stat.success_count}회`);
    console.log(`실패: ${stat.fail_count}회`);
    console.log(`진행중: ${stat.in_progress_count}회`);
    console.log(`성공률: ${successRate}%`);
    
    // 현재 진행 중인 실행 확인
    if (parseInt(stat.in_progress_count) > 0) {
      console.log('\n🔄 현재 진행 중인 실행들:');
      const inProgress = await dbServiceV2.query(`
        SELECT id, keyword, started_at, last_successful_stage
        FROM v2_execution_logs 
        WHERE agent = 'test1' 
          AND final_status = 'in_progress'
        ORDER BY started_at DESC
      `);
      
      inProgress.rows.forEach(exec => {
        const runningMinutes = Math.round((Date.now() - new Date(exec.started_at)) / (1000 * 60));
        console.log(`  ID ${exec.id}: ${exec.keyword} (${runningMinutes}분 실행중, 단계: ${exec.last_successful_stage})`);
      });
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkRecentTest1Errors();