const dbService = require('../lib/services/db-service-v2');

async function checkFinalTables() {
  console.log('=== 최종 V2 테이블 및 뷰 확인 ===');
  
  // 테이블 확인
  const tableResult = await dbService.query(`
    SELECT table_name, table_type
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'v2_%'
    ORDER BY table_type, table_name
  `);
  
  console.log('\n테이블:');
  tableResult.rows.filter(r => r.table_type === 'BASE TABLE').forEach(row => {
    console.log(`  - ${row.table_name}`);
  });
  
  console.log('\n뷰:');
  tableResult.rows.filter(r => r.table_type === 'VIEW').forEach(row => {
    console.log(`  - ${row.table_name}`);
  });
  
  console.log('\n=== 정리 완료 ===');
  console.log(`총 테이블: ${tableResult.rows.filter(r => r.table_type === 'BASE TABLE').length}개`);
  console.log(`총 뷰: ${tableResult.rows.filter(r => r.table_type === 'VIEW').length}개`);
  
  await dbService.close();
}

checkFinalTables().catch(console.error);