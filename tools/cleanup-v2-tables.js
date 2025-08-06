/**
 * V2 테이블 정리 스크립트
 * 사용하지 않는 테이블 삭제
 */

const dbService = require('../lib/services/db-service-v2');

async function cleanupUnusedTables() {
  console.log('=== 불필요한 V2 테이블 삭제 ===\n');
  
  const unusedTables = [
    'v2_execution_logs_backup',
    'v2_execution_logs_ordered', 
    'v2_execution_stats',
    'v2_search_mode_status',
    'v2_search_mode_history',
    'v2_page_load_metrics'
  ];
  
  for (const table of unusedTables) {
    try {
      await dbService.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`✅ ${table} 삭제됨`);
    } catch (error) {
      console.log(`❌ ${table} 삭제 실패: ${error.message}`);
    }
  }
  
  console.log('\n=== 현재 V2 테이블 목록 ===');
  
  const result = await dbService.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'v2_%'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  
  result.rows.forEach(row => {
    console.log(`- ${row.table_name}`);
  });
  
  console.log('\n=== 완료 ===');
  await dbService.close();
}

cleanupUnusedTables().catch(error => {
  console.error('오류:', error);
  process.exit(1);
});