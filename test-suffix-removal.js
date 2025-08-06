/**
 * suffix 제거 후 테스트
 */
const { Pool } = require('pg');
const environment = require('./environment');

async function testSuffixRemoval() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔍 suffix 제거 후 V2 키워드 조회 테스트\n');
    
    // V2 테이블 직접 조회
    const result = await pool.query('SELECT * FROM v2_test_keywords ORDER BY id');
    const keywords = result.rows;
    
    console.log('📋 V2 키워드 데이터:');
    keywords.forEach(k => {
      console.log(`   ID:${k.id} | "${k.keyword}" → ${k.product_code} | tracking_key: ${k.tracking_key || 'NULL'}`);
      console.log(`      ├ suffix 컬럼: ${k.suffix !== undefined ? `"${k.suffix}"` : '없음 (완전 제거됨)'}`);
      console.log(`      └ 설정: 검색=${k.search ? 'ON' : 'OFF'}, 장바구니=${k.cart_click_enabled ? 'ON' : 'OFF'}`);
    });
    
    console.log(`\n✅ 총 ${keywords.length}개 V2 키워드 확인 완료`);
    
    if (keywords.length > 0 && keywords[0].suffix === undefined) {
      console.log('🎉 suffix 컬럼이 완전히 제거되어 조회 결과에 포함되지 않음!');
    }
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('스택:', error.stack);
  } finally {
    await pool.end();
  }
}

testSuffixRemoval();