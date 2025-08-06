/**
 * v2_test_keywords 기본값 올바른 설정으로 수정
 * - userdata: true (프로필 유지, 삭제하지 않음)
 * - clear_cache: false (캐시 유지, session만 삭제)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function fixV2Defaults() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔧 v2_test_keywords 기본값 올바른 설정으로 수정...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 변경 전 기본값 확인
    try {
      const beforeDefaults = await pool.query(`
        SELECT column_name, column_default
        FROM information_schema.columns 
        WHERE table_name = 'v2_test_keywords' 
          AND table_schema = 'public'
          AND column_name IN ('userdata', 'clear_cache')
        ORDER BY column_name
      `);
      
      console.log('📋 변경 전 기본값:');
      beforeDefaults.rows.forEach(col => {
        console.log(`   ${col.column_name.padEnd(15)} | 기본값: ${col.column_default}`);
      });
      console.log('');
      
    } catch (error) {
      console.log('📝 기존 기본값 확인 실패\n');
    }

    // SQL 파일 실행
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_fix_defaults.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 기본값 수정 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ 기본값 수정 완료!\n');

    // 변경 후 기본값 확인
    const afterDefaults = await pool.query(`
      SELECT column_name, column_default
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name IN ('userdata', 'clear_cache')
      ORDER BY column_name
    `);
    
    console.log('📋 변경 후 기본값:');
    console.log('─'.repeat(50));
    afterDefaults.rows.forEach(col => {
      const meaning = col.column_name === 'userdata' ? 
        (col.column_default === 'true' ? '(프로필 유지)' : '(프로필 삭제)') :
        (col.column_default === 'false' ? '(캐시 유지)' : '(캐시 삭제)');
      
      console.log(`   ${col.column_name.padEnd(15)} | 기본값: ${col.column_default.padEnd(5)} ${meaning}`);
    });
    console.log('─'.repeat(50));

    // 업데이트된 데이터 확인
    const sampleData = await pool.query(`
      SELECT 
        id, keyword, product_code, userdata, clear_cache, search, optimize, 
        cart_click_enabled, tracking_key,
        CASE WHEN userdata THEN '프로필 유지' ELSE '프로필 삭제' END as userdata_meaning,
        CASE WHEN clear_cache THEN '캐시 삭제' ELSE '캐시 유지' END as clear_cache_meaning
      FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log('\n🔑 수정된 키워드 데이터:');
    console.log('─'.repeat(110));
    console.log('ID | 키워드       | userdata | clear_cache | search | optimize | cart | 의미');
    console.log('─'.repeat(110));
    sampleData.rows.forEach(row => {
      const userdata = row.userdata ? 'ON ' : 'OFF';
      const clearCache = row.clear_cache ? 'ON ' : 'OFF';
      const search = row.search ? 'ON ' : 'OFF';
      const optimize = row.optimize ? 'ON ' : 'OFF';
      const cart = row.cart_click_enabled ? 'ON ' : 'OFF';
      const meaning = `${row.userdata_meaning} + ${row.clear_cache_meaning}`;
      console.log(`${row.id.toString().padEnd(2)} | ${row.keyword.padEnd(12)} | ${userdata.padEnd(8)} | ${clearCache.padEnd(11)} | ${search.padEnd(6)} | ${optimize.padEnd(8)} | ${cart.padEnd(4)} | ${meaning}`);
    });
    console.log('─'.repeat(110));

    console.log('\n🎉 올바른 기본값 설정 완료!');
    console.log('\n📖 설정 의미:');
    console.log('   • userdata = true  → 영구 프로필 사용 (유저 폴더 유지)');
    console.log('   • userdata = false → 임시 프로필 사용 (유저 폴더 삭제)');
    console.log('   • clear_cache = false → 캐시 유지 (session만 삭제)');
    console.log('   • clear_cache = true  → 캐시 삭제');
    console.log('\n🔧 브라우저 동작:');
    console.log('   • persistent=true (userdata=true) → 프로필 디렉토리 재사용');
    console.log('   • persistent=false (userdata=false) → 프로필 디렉토리 삭제 후 새로 시작');
    console.log('   • clearCache=false → 브라우저 캐시 유지 (트래픽 절약)'); 
    console.log('   • clearSession=true → 쿠키, 스토리지만 삭제');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 데이터베이스 연결 실패!');
    } else if (error.code === '28P01') {
      console.error('\n🔐 인증 실패!');
    }
    
    console.error('\n스택 추적:', error.stack);
  } finally {
    await pool.end();
    console.log('\n👋 데이터베이스 연결 종료');
  }
}

// 실행
if (require.main === module) {
  fixV2Defaults().catch(console.error);
}

module.exports = { fixV2Defaults };