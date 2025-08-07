const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkStructure() {
  try {
    const result = await dbServiceV2.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_error_logs' 
      ORDER BY ordinal_position
    `);
    
    console.log('v2_error_logs 테이블 구조:');
    console.log('─'.repeat(50));
    result.rows.forEach(col => {
      console.log(`${col.column_name.padEnd(20)} | ${col.data_type.padEnd(15)} | ${col.is_nullable}`);
    });
    
    // 현재 console_logs, network_state 활용 확인
    console.log('\n🔍 console_logs, network_state 활용 현황:');
    console.log('─'.repeat(40));
    
    const usageCheck = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_errors,
        COUNT(console_logs) as has_console_logs,
        COUNT(network_state) as has_network_state,
        AVG(CASE WHEN console_logs IS NOT NULL THEN 1 ELSE 0 END) * 100 as console_usage_percent,
        AVG(CASE WHEN network_state IS NOT NULL THEN 1 ELSE 0 END) * 100 as network_usage_percent
      FROM v2_error_logs 
      WHERE occurred_at >= NOW() - INTERVAL '1 day'
    `);
    
    const usage = usageCheck.rows[0];
    console.log(`총 에러 로그: ${usage.total_errors}개`);
    console.log(`console_logs 사용: ${usage.has_console_logs}개 (${parseFloat(usage.console_usage_percent).toFixed(1)}%)`);
    console.log(`network_state 사용: ${usage.has_network_state}개 (${parseFloat(usage.network_usage_percent).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkStructure();