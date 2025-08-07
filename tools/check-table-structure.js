const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkTableStructure() {
  try {
    console.log('=== 테이블 구조 확인 ===\n');
    
    // v2_execution_logs 테이블 구조
    const execColumns = await dbServiceV2.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'v2_execution_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 v2_execution_logs 컬럼:');
    execColumns.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // v2_action_log 테이블 구조
    const actionColumns = await dbServiceV2.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'v2_action_log'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 v2_action_log 컬럼:');
    actionColumns.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // v2_product_tracking 테이블 구조
    const productColumns = await dbServiceV2.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'v2_product_tracking'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 v2_product_tracking 컬럼:');
    productColumns.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // 샘플 데이터 확인
    console.log('\n📊 샘플 데이터 확인:');
    const sampleExec = await dbServiceV2.query(`
      SELECT * FROM v2_execution_logs WHERE keyword_id = 25 LIMIT 3
    `);
    
    console.log('\nv2_execution_logs 샘플:');
    sampleExec.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ID: ${row.id}, keyword_id: ${row.keyword_id}`);
      Object.keys(row).forEach(key => {
        if (key.includes('stage') || key.includes('status')) {
          console.log(`   ${key}: ${row[key]}`);
        }
      });
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

checkTableStructure();