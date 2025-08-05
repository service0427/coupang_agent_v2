/**
 * v1_executions 테이블에서 분당 작업 성공률 분석
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function analyzeSuccessRate() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 전체 통계
    console.log('📊 전체 실행 통계:');
    const totalStats = await client.query(`
      SELECT 
        COUNT(*) as total_executions,
        COUNT(CASE WHEN success = true THEN 1 END) as successful,
        COUNT(CASE WHEN success = false THEN 1 END) as failed,
        ROUND(COUNT(CASE WHEN success = true THEN 1 END)::numeric / COUNT(*) * 100, 2) as success_rate
      FROM v1_executions
    `);
    console.table(totalStats.rows);
    
    // 시간대별 통계 (최근 24시간)
    console.log('\n📊 시간대별 성공률 (최근 24시간):');
    const hourlyStats = await client.query(`
      SELECT 
        DATE_TRUNC('hour', executed) as hour,
        COUNT(*) as total,
        COUNT(CASE WHEN success = true THEN 1 END) as successful,
        ROUND(COUNT(CASE WHEN success = true THEN 1 END)::numeric / COUNT(*) * 100, 2) as success_rate
      FROM v1_executions
      WHERE executed >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', executed)
      ORDER BY hour DESC
      LIMIT 24
    `);
    console.table(hourlyStats.rows);
    
    // 분당 실행 횟수 및 성공률 (최근 1시간)
    console.log('\n📊 분당 실행 통계 (최근 1시간):');
    const minuteStats = await client.query(`
      SELECT 
        DATE_TRUNC('minute', executed) as minute,
        COUNT(*) as executions_per_minute,
        COUNT(CASE WHEN success = true THEN 1 END) as successful,
        COUNT(CASE WHEN success = false THEN 1 END) as failed,
        ROUND(COUNT(CASE WHEN success = true THEN 1 END)::numeric / COUNT(*) * 100, 2) as success_rate
      FROM v1_executions
      WHERE executed >= NOW() - INTERVAL '1 hour'
      GROUP BY DATE_TRUNC('minute', executed)
      ORDER BY minute DESC
    `);
    
    if (minuteStats.rows.length > 0) {
      console.table(minuteStats.rows.slice(0, 20)); // 최근 20분만 표시
      
      // 평균 분당 실행 횟수
      const avgPerMinute = minuteStats.rows.reduce((sum, row) => sum + parseInt(row.executions_per_minute), 0) / minuteStats.rows.length;
      const avgSuccessRate = minuteStats.rows.reduce((sum, row) => sum + parseFloat(row.success_rate || 0), 0) / minuteStats.rows.length;
      
      console.log('\n📈 평균 통계 (최근 1시간):');
      console.log(`   - 평균 분당 실행 횟수: ${avgPerMinute.toFixed(2)}회`);
      console.log(`   - 평균 성공률: ${avgSuccessRate.toFixed(2)}%`);
    }
    
    // 에이전트별 성공률
    console.log('\n📊 에이전트별 성공률:');
    const agentStats = await client.query(`
      SELECT 
        k.agent,
        COUNT(e.id) as total,
        COUNT(CASE WHEN e.success = true THEN 1 END) as successful,
        ROUND(COUNT(CASE WHEN e.success = true THEN 1 END)::numeric / COUNT(e.id) * 100, 2) as success_rate
      FROM v1_executions e
      JOIN v1_keywords k ON e.keyword_id = k.id
      GROUP BY k.agent
      ORDER BY total DESC
    `);
    console.table(agentStats.rows);
    
    // 최근 실패 원인 분석
    console.log('\n❌ 최근 실패 원인 (최근 100건):');
    const failureReasons = await client.query(`
      SELECT 
        error,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM v1_executions WHERE success = false AND executed >= NOW() - INTERVAL '1 hour') * 100, 2) as percentage
      FROM v1_executions
      WHERE success = false 
      AND executed >= NOW() - INTERVAL '1 hour'
      AND error IS NOT NULL
      GROUP BY error
      ORDER BY count DESC
      LIMIT 10
    `);
    console.table(failureReasons.rows);
    
    // 시간대별 분당 처리량
    console.log('\n⏱️ 시간대별 분당 처리량:');
    const throughput = await client.query(`
      WITH minute_counts AS (
        SELECT 
          DATE_TRUNC('hour', executed) as hour,
          DATE_TRUNC('minute', executed) as minute,
          COUNT(*) as count
        FROM v1_executions
        WHERE executed >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', executed), DATE_TRUNC('minute', executed)
      )
      SELECT 
        hour,
        ROUND(AVG(count), 2) as avg_per_minute,
        MAX(count) as max_per_minute,
        MIN(count) as min_per_minute
      FROM minute_counts
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 10
    `);
    console.table(throughput.rows);
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

analyzeSuccessRate();