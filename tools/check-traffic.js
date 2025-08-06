const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkTraffic() {
  console.log('=== 최근 실행 트래픽 확인 ===\n');
  
  const result = await dbServiceV2.query(`
    SELECT id, keyword, product_code, total_traffic_mb, started_at 
    FROM v2_execution_logs 
    ORDER BY id DESC 
    LIMIT 5
  `);
  
  result.rows.forEach(row => {
    const date = new Date(row.started_at).toLocaleString('ko-KR');
    console.log(`ID:${row.id} ${row.keyword} (${row.product_code})`);
    console.log(`  트래픽: ${row.total_traffic_mb}MB`);
    console.log(`  시간: ${date}\n`);
  });
  
  await dbServiceV2.close();
}

checkTraffic().catch(console.error);