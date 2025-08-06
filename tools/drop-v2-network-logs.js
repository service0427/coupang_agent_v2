const dbServiceV2 = require('../lib/services/db-service-v2');

async function dropNetworkLogsTable() {
  console.log('🗑️  v2_network_logs 테이블 삭제 시작...');
  
  try {
    // 테이블 삭제
    await dbServiceV2.query('DROP TABLE IF EXISTS v2_network_logs CASCADE');
    console.log('✅ v2_network_logs 테이블 삭제 완료');
    
    // 삭제 확인
    const result = await dbServiceV2.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'v2_%'
      ORDER BY table_name
    `);
    
    console.log('\n📋 남은 V2 테이블:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ 테이블 삭제 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

dropNetworkLogsTable();