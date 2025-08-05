/**
 * v2 테이블 데이터 확인 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function checkData() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // v2 테이블 데이터 건수 확인
    const tables = ['v2_test_keywords', 'v2_execution_logs', 'v2_error_logs'];
    
    console.log('📊 v2 테이블 데이터 건수:');
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table}: ${result.rows[0].count}건`);
      } catch (error) {
        console.log(`   ${table}: ${error.message}`);
      }
    }
    
    // v2_test_keywords 샘플 데이터
    console.log('\n📋 v2_test_keywords 샘플 데이터 (5건):');
    try {
      const result = await client.query(`
        SELECT id, keyword, suffix, product_code, cart_click_enabled, 
               clear_session, clear_cache, gpu_disabled, optimize
        FROM v2_test_keywords
        LIMIT 5
      `);
      console.table(result.rows);
    } catch (error) {
      console.log(`   오류: ${error.message}`);
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

checkData();