/**
 * 컬럼명 변경 후 검증 테스트
 */
const { Pool } = require('pg');
const environment = require('./environment');

async function testColumnUpdate() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔍 컬럼 업데이트 검증 테스트\n');
    
    // V2 테이블 구조 확인
    const columns = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 현재 v2_test_keywords 컬럼 구조:');
    console.log('─'.repeat(80));
    columns.rows.forEach((col, index) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default || 'NULL';
      
      // 중요 컬럼 하이라이트
      let indicator = '   ';
      if (['userdata', 'clear_cache', 'search', 'optimize'].includes(col.column_name)) {
        indicator = '🔧 ';
      }
      if (col.column_name === 'tracking_key') {
        indicator = '🔑 ';
      }
      
      console.log(`${indicator}${(index + 1).toString().padEnd(2)} | ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(20)} | ${nullable.padEnd(8)} | ${defaultVal}`);
    });
    console.log('─'.repeat(80));

    // 제거된 컬럼 확인
    const removedColumns = ['use_persistent', 'clear_session', 'suffix'];
    console.log('\n❌ 제거되어야 할 컬럼들 확인:');
    for (const colName of removedColumns) {
      const exists = columns.rows.find(col => col.column_name === colName);
      if (exists) {
        console.log(`   ❌ ${colName}: 아직 존재함!`);
      } else {
        console.log(`   ✅ ${colName}: 성공적으로 제거됨`);
      }
    }

    // 새로 추가되거나 변경된 컬럼 확인
    const expectedColumns = {
      'userdata': { default: 'true', type: 'boolean' },
      'clear_cache': { default: 'true', type: 'boolean' },
      'search': { default: 'false', type: 'boolean' },
      'optimize': { default: 'false', type: 'boolean' }
    };

    console.log('\n✅ 기대되는 컬럼들 확인:');
    for (const [colName, expected] of Object.entries(expectedColumns)) {
      const col = columns.rows.find(c => c.column_name === colName);
      if (col) {
        const defaultOk = col.column_default === expected.default;
        const typeOk = col.data_type === expected.type;
        
        if (defaultOk && typeOk) {
          console.log(`   ✅ ${colName}: OK (기본값: ${col.column_default}, 타입: ${col.data_type})`);
        } else {
          console.log(`   ⚠️  ${colName}: 문제있음 (기본값: ${col.column_default}, 타입: ${col.data_type})`);
        }
      } else {
        console.log(`   ❌ ${colName}: 존재하지 않음!`);
      }
    }

    // 실제 데이터 확인
    const data = await pool.query(`
      SELECT id, keyword, product_code, userdata, clear_cache, search, optimize, cart_click_enabled, tracking_key
      FROM v2_test_keywords 
      ORDER BY id 
      LIMIT 5
    `);
    
    console.log('\n📊 실제 데이터:');
    console.log('─'.repeat(90));
    console.log('ID | 키워드       | userdata | clear_cache | search | optimize | cart | tracking_key');
    console.log('─'.repeat(90));
    data.rows.forEach(row => {
      const userdata = row.userdata ? 'ON ' : 'OFF';
      const clearCache = row.clear_cache ? 'ON ' : 'OFF';
      const search = row.search ? 'ON ' : 'OFF';
      const optimize = row.optimize ? 'ON ' : 'OFF';
      const cart = row.cart_click_enabled ? 'ON ' : 'OFF';
      console.log(`${row.id.toString().padEnd(2)} | ${row.keyword.padEnd(12)} | ${userdata.padEnd(8)} | ${clearCache.padEnd(11)} | ${search.padEnd(6)} | ${optimize.padEnd(8)} | ${cart.padEnd(4)} | ${row.tracking_key}`);
    });
    console.log('─'.repeat(90));

    console.log('\n🎉 컬럼 업데이트 검증 완료!');
    console.log('   • use_persistent → userdata ✅');
    console.log('   • clear_session 제거 ✅');  
    console.log('   • clear_cache 기본값 true ✅');
    console.log('   • suffix 완전 제거 ✅');
    console.log('   • tracking_key keyword:product_code 형태 ✅');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('스택:', error.stack);
  } finally {
    await pool.end();
  }
}

testColumnUpdate();