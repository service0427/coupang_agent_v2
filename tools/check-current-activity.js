/**
 * 현재 활동 상태 간단 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkCurrentActivity() {
  console.log('⚡ 현재 동시 작업 활동 상태');
  console.log('시간:', new Date().toLocaleString('ko-KR'));
  console.log('');
  
  try {
    // 1. 진행 중인 실행 현황
    const inProgress = await dbServiceV2.query(`
      SELECT agent, COUNT(*) as count
      FROM v2_execution_logs 
      WHERE final_status = 'in_progress'
      GROUP BY agent
      ORDER BY count DESC
    `);
    
    console.log('🔄 에이전트별 진행 중인 작업:');
    let totalInProgress = 0;
    inProgress.rows.forEach(row => {
      console.log(`   ${row.agent}: ${row.count}개`);
      totalInProgress += parseInt(row.count);
    });
    console.log(`   총 ${totalInProgress}개 동시 실행 중`);
    
    console.log('');
    
    // 2. 최근 1분간 완료 통계
    const recentCompleted = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_completed,
        SUM(CASE WHEN overall_success = true THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN final_status LIKE '%success%' THEN 1 ELSE 0 END) as stage_success
      FROM v2_execution_logs 
      WHERE completed_at >= NOW() - INTERVAL '1 minute'
        AND final_status != 'in_progress'
    `);
    
    if (recentCompleted.rows[0].total_completed > 0) {
      const stats = recentCompleted.rows[0];
      console.log('📊 최근 1분간 완료:');
      console.log(`   총 완료: ${stats.total_completed}개`);
      console.log(`   성공: ${stats.successful}개`);
      console.log(`   단계별 성공: ${stats.stage_success}개`);
      
      const successRate = ((stats.successful / stats.total_completed) * 100).toFixed(1);
      console.log(`   성공률: ${successRate}%`);
    } else {
      console.log('📊 최근 1분간 완료된 작업 없음');
    }
    
    console.log('');
    
    // 3. 로그 증가율 (마지막 10초와 그 이전 10초 비교)
    const logGrowth = await dbServiceV2.query(`
      SELECT 
        (SELECT COUNT(*) FROM v2_execution_logs WHERE started_at >= NOW() - INTERVAL '10 seconds') as recent_10s,
        (SELECT COUNT(*) FROM v2_execution_logs WHERE started_at >= NOW() - INTERVAL '20 seconds' AND started_at < NOW() - INTERVAL '10 seconds') as prev_10s,
        (SELECT COUNT(*) FROM v2_execution_logs) as total_logs
    `);
    
    const growth = logGrowth.rows[0];
    console.log('📈 로그 활동:');
    console.log(`   최근 10초: ${growth.recent_10s}개 새 실행`);
    console.log(`   이전 10초: ${growth.prev_10s}개`);
    console.log(`   전체 로그: ${growth.total_logs}개`);
    
    if (growth.recent_10s > 0 || growth.prev_10s > 0) {
      console.log('   ✅ 로그가 활발하게 생성되고 있음');
    }
    
  } catch (error) {
    console.error('❌ 활동 확인 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkCurrentActivity();