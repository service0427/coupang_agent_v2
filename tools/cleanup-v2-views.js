/**
 * V2 뷰 정리 스크립트
 * 사용하지 않는 뷰 삭제
 */

const dbService = require('../lib/services/db-service-v2');

async function cleanupUnusedViews() {
  console.log('=== 불필요한 V2 뷰 삭제 ===\n');
  
  const unusedViews = [
    'v2_execution_logs_ordered',
    'v2_execution_stats'
  ];
  
  for (const view of unusedViews) {
    try {
      await dbService.query(`DROP VIEW IF EXISTS ${view} CASCADE`);
      console.log(`✅ ${view} 뷰 삭제됨`);
    } catch (error) {
      console.log(`❌ ${view} 뷰 삭제 실패: ${error.message}`);
    }
  }
  
  console.log('\n=== 현재 V2 뷰 목록 ===');
  
  const result = await dbService.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name LIKE 'v2_%'
    AND table_type = 'VIEW'
    ORDER BY table_name
  `);
  
  result.rows.forEach(row => {
    console.log(`- ${row.table_name}`);
  });
  
  console.log('\n=== 완료 ===');
  await dbService.close();
}

cleanupUnusedViews().catch(error => {
  console.error('오류:', error);
  process.exit(1);
});