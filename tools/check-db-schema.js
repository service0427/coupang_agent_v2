const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkDbSchema() {
  try {
    console.log('=== v2_execution_logs 테이블 구조 확인 ===');
    
    // 샘플 데이터 확인
    const sampleResult = await dbServiceV2.query('SELECT * FROM v2_execution_logs LIMIT 3');
    if (sampleResult.rows.length > 0) {
      console.log('컬럼들:', Object.keys(sampleResult.rows[0]));
      console.log('\n샘플 데이터:');
      sampleResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}:`, row);
      });
    }
    
    // 스키마 정보 확인
    const schemaResult = await dbServiceV2.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_execution_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== 테이블 스키마 ===');
    schemaResult.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'}`);
    });
    
    // v2_test_keywords도 확인
    console.log('\n=== v2_test_keywords 샘플 데이터 ===');
    const keywordSample = await dbServiceV2.query('SELECT id, keyword, current_executions, success_count, fail_count FROM v2_test_keywords LIMIT 5');
    keywordSample.rows.forEach(row => {
      console.log(`ID ${row.id}: ${row.keyword} (실행: ${row.current_executions}, 성공: ${row.success_count}, 실패: ${row.fail_count})`);
    });
    
  } catch (error) {
    console.error('오류 발생:', error);
  } finally {
    await dbServiceV2.close();
  }
}

checkDbSchema();