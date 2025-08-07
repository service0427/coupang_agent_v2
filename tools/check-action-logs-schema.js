/**
 * v2_action_logs 테이블 스키마 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkSchema() {
  try {
    // 테이블 스키마 확인
    const schemaResult = await dbServiceV2.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_action_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 v2_action_logs 테이블 스키마:');
    console.log('─'.repeat(40));
    schemaResult.rows.forEach(row => {
      console.log(`${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // 샘플 데이터 확인
    const sampleResult = await dbServiceV2.query(`
      SELECT * FROM v2_action_logs LIMIT 3
    `);
    
    console.log('\n📄 샘플 데이터:');
    console.log('─'.repeat(40));
    console.log('컬럼들:', Object.keys(sampleResult.rows[0] || {}));
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkSchema();