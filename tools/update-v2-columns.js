/**
 * v2_test_keywords 컬럼명 및 기본값 업데이트 도구
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function updateV2Columns() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔧 v2_test_keywords 컬럼 업데이트 시작...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 변경 전 구조 확인
    try {
      const beforeColumns = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'v2_test_keywords' 
          AND table_schema = 'public'
          AND column_name IN ('use_persistent', 'clear_session', 'clear_cache', 'userdata', 'search', 'optimize')
        ORDER BY column_name
      `);
      
      console.log('📋 변경 전 관련 컬럼들:');
      beforeColumns.rows.forEach(col => {
        console.log(`   ${col.column_name.padEnd(20)} | ${col.data_type.padEnd(15)} | 기본값: ${col.column_default || 'NULL'}`);
      });
      console.log('');
      
    } catch (error) {
      console.log('📝 기존 구조 확인 실패\n');
    }

    // SQL 파일 실행
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_update_column_names.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 컬럼 업데이트 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ 컬럼 업데이트 완료!\n');

    // 변경 후 구조 확인
    const afterColumns = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name IN ('userdata', 'clear_cache', 'search', 'optimize')
      ORDER BY column_name
    `);
    
    console.log('📋 변경 후 컬럼들:');
    console.log('─'.repeat(70));
    afterColumns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default || 'NULL';
      console.log(`   ${col.column_name.padEnd(15)} | ${col.data_type.padEnd(15)} | ${nullable.padEnd(8)} | 기본값: ${defaultVal}`);
    });
    console.log('─'.repeat(70));

    // clear_session 제거 확인
    const clearSessionExists = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name = 'clear_session'
    `);
    
    if (clearSessionExists.rows.length === 0) {
      console.log('✅ clear_session 컬럼이 성공적으로 제거되었습니다!');
    } else {
      console.log('❌ clear_session 컬럼이 아직 존재합니다!');
    }

    // use_persistent → userdata 변경 확인
    const usePersistentExists = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name = 'use_persistent'
    `);
    
    const userdataExists = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name = 'userdata'
    `);

    if (usePersistentExists.rows.length === 0 && userdataExists.rows.length > 0) {
      console.log('✅ use_persistent → userdata 컬럼명 변경 성공!');
    } else {
      console.log('❌ 컬럼명 변경에 문제가 있습니다.');
    }

    // 업데이트된 데이터 확인
    const sampleData = await pool.query(`
      SELECT id, keyword, product_code, userdata, clear_cache, search, optimize, cart_click_enabled, tracking_key
      FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log('\n🔑 업데이트된 키워드 데이터:');
    console.log('─'.repeat(100));
    console.log('   ID | 키워드            | userdata | clear_cache | search | optimize | cart | tracking_key');
    console.log('─'.repeat(100));
    sampleData.rows.forEach(row => {
      const userdata = row.userdata ? 'ON ' : 'OFF';
      const clearCache = row.clear_cache ? 'ON ' : 'OFF';
      const search = row.search ? 'ON ' : 'OFF';
      const optimize = row.optimize ? 'ON ' : 'OFF';
      const cart = row.cart_click_enabled ? 'ON ' : 'OFF';
      console.log(`   ${row.id.toString().padEnd(2)} | ${row.keyword.padEnd(15)} | ${userdata.padEnd(8)} | ${clearCache.padEnd(11)} | ${search.padEnd(6)} | ${optimize.padEnd(8)} | ${cart.padEnd(4)} | ${row.tracking_key}`);
    });
    console.log('─'.repeat(100));

    console.log('\n🎉 완료! 주요 변경사항:');
    console.log('   • use_persistent → userdata 컬럼명 변경');
    console.log('   • clear_session 컬럼 제거 (기본값 false 였으므로)');
    console.log('   • clear_cache 기본값 true로 변경');
    console.log('   • search, optimize는 현재 방식 유지');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 데이터베이스 연결 실패!');
    } else if (error.code === '28P01') {
      console.error('\n🔐 인증 실패!');
    } else if (error.code === '42703') {
      console.error('\n📋 컬럼이 존재하지 않거나 이미 변경되었습니다');
    }
    
    console.error('\n스택 추적:', error.stack);
  } finally {
    await pool.end();
    console.log('\n👋 데이터베이스 연결 종료');
  }
}

// 실행
if (require.main === module) {
  updateV2Columns().catch(console.error);
}

module.exports = { updateV2Columns };