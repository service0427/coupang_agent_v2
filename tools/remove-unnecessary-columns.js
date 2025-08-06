/**
 * v2_test_keywords에서 불필요한 컬럼 제거
 * - optimize: 무조건 활성화되므로 컬럼 불필요
 * - search: 유동적으로 변경되므로 컬럼 불필요
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function removeUnnecessaryColumns() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🗑️  v2_test_keywords 불필요한 컬럼 제거...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 제거 전 컬럼 확인
    try {
      const beforeColumns = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns 
        WHERE table_name = 'v2_test_keywords' 
          AND table_schema = 'public'
          AND column_name IN ('optimize', 'search', 'userdata', 'clear_cache', 'cart_click_enabled')
        ORDER BY column_name
      `);
      
      console.log('📋 제거 전 관련 컬럼들:');
      beforeColumns.rows.forEach(col => {
        const indicator = ['optimize', 'search'].includes(col.column_name) ? '🗑️ ' : '   ';
        console.log(`${indicator}${col.column_name.padEnd(20)} | ${col.data_type.padEnd(15)} | 기본값: ${col.column_default || 'NULL'}`);
      });
      console.log('');
      
    } catch (error) {
      console.log('📝 기존 구조 확인 실패\n');
    }

    // SQL 파일 실행
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_remove_unnecessary_columns.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 불필요한 컬럼 제거 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ 불필요한 컬럼 제거 완료!\n');

    // 제거 후 구조 확인
    const afterColumns = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 제거 후 v2_test_keywords 전체 구조:');
    console.log('─'.repeat(80));
    afterColumns.rows.forEach((col, index) => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default || 'NULL';
      
      // 중요 컬럼 하이라이트
      let indicator = '   ';
      if (['userdata', 'clear_cache', 'cart_click_enabled'].includes(col.column_name)) {
        indicator = '🔧 ';
      }
      if (col.column_name === 'tracking_key') {
        indicator = '🔑 ';
      }
      
      console.log(`${indicator}${(index + 1).toString().padEnd(2)} | ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(20)} | ${nullable.padEnd(8)} | ${defaultVal}`);
    });
    console.log('─'.repeat(80));

    // 제거된 컬럼 확인
    const removedColumns = ['optimize', 'search'];
    console.log('\n❌ 제거된 컬럼들 확인:');
    for (const colName of removedColumns) {
      const exists = afterColumns.rows.find(col => col.column_name === colName);
      if (exists) {
        console.log(`   ❌ ${colName}: 아직 존재함!`);
      } else {
        console.log(`   ✅ ${colName}: 성공적으로 제거됨`);
      }
    }

    // 남은 설정 컬럼들 확인
    const remainingColumns = ['userdata', 'clear_cache', 'cart_click_enabled'];
    console.log('\n✅ 남은 설정 컬럼들:');
    for (const colName of remainingColumns) {
      const col = afterColumns.rows.find(c => c.column_name === colName);
      if (col) {
        console.log(`   ✅ ${colName}: 기본값 ${col.column_default}`);
      } else {
        console.log(`   ❌ ${colName}: 존재하지 않음!`);
      }
    }

    // 최종 데이터 확인
    const finalData = await pool.query(`
      SELECT id, keyword, product_code, userdata, clear_cache, cart_click_enabled, tracking_key
      FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log('\n📊 최종 단순화된 키워드 데이터:');
    console.log('─'.repeat(90));
    console.log('ID | 키워드       | userdata | clear_cache | cart_click | tracking_key');
    console.log('─'.repeat(90));
    finalData.rows.forEach(row => {
      const userdata = row.userdata ? 'ON ' : 'OFF';
      const clearCache = row.clear_cache ? 'ON ' : 'OFF';
      const cart = row.cart_click_enabled ? 'ON ' : 'OFF';
      console.log(`${row.id.toString().padEnd(2)} | ${row.keyword.padEnd(12)} | ${userdata.padEnd(8)} | ${clearCache.padEnd(11)} | ${cart.padEnd(10)} | ${row.tracking_key}`);
    });
    console.log('─'.repeat(90));

    console.log('\n🎉 v2_test_keywords 최종 단순화 완료!');
    console.log('\n📖 제거된 컬럼과 이유:');
    console.log('   • optimize → 무조건 활성화되고 v2_test_keywords 컬럼에서 디테일 설정');
    console.log('   • search → goto 기본, 차단 시 search로 유동적 변경');
    console.log('\n🔧 남은 설정 컬럼:');
    console.log('   • userdata (true) → 프로필 유지');
    console.log('   • clear_cache (false) → 캐시 유지, session만 삭제');
    console.log('   • cart_click_enabled → 장바구니 클릭 여부');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 데이터베이스 연결 실패!');
    } else if (error.code === '28P01') {
      console.error('\n🔐 인증 실패!');
    } else if (error.code === '42703') {
      console.error('\n📋 컬럼이 이미 제거되었거나 존재하지 않습니다');
    }
    
    console.error('\n스택 추적:', error.stack);
  } finally {
    await pool.end();
    console.log('\n👋 데이터베이스 연결 종료');
  }
}

// 실행
if (require.main === module) {
  removeUnnecessaryColumns().catch(console.error);
}

module.exports = { removeUnnecessaryColumns };