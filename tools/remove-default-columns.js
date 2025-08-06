/**
 * v2_test_keywords에서 기본값 고정 컬럼들 제거
 * - userdata: 항상 true (프로필 유지) - 하드코딩
 * - clear_cache: 항상 false (캐시 유지, session만 삭제) - 하드코딩
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function removeDefaultColumns() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🗑️  v2_test_keywords 기본값 고정 컬럼 제거...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 제거 전 컬럼 확인
    try {
      const beforeColumns = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns 
        WHERE table_name = 'v2_test_keywords' 
          AND table_schema = 'public'
          AND column_name IN ('userdata', 'clear_cache', 'cart_click_enabled', 'keyword', 'product_code')
        ORDER BY column_name
      `);
      
      console.log('📋 제거 전 관련 컬럼들:');
      beforeColumns.rows.forEach(col => {
        const indicator = ['userdata', 'clear_cache'].includes(col.column_name) ? '🗑️ ' : '   ';
        console.log(`${indicator}${col.column_name.padEnd(20)} | ${col.data_type.padEnd(15)} | 기본값: ${col.column_default || 'NULL'}`);
      });
      console.log('');
      
    } catch (error) {
      console.log('📝 기존 구조 확인 실패\n');
    }

    // SQL 파일 실행
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_remove_default_columns.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 기본값 고정 컬럼 제거 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ 기본값 고정 컬럼 제거 완료!\n');

    // 제거 후 전체 구조 확인
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
      
      // 핵심 컬럼 하이라이트
      let indicator = '   ';
      if (['keyword', 'product_code', 'cart_click_enabled'].includes(col.column_name)) {
        indicator = '🔧 ';
      }
      if (col.column_name === 'tracking_key') {
        indicator = '🔑 ';
      }
      
      console.log(`${indicator}${(index + 1).toString().padEnd(2)} | ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(20)} | ${nullable.padEnd(8)} | ${defaultVal}`);
    });
    console.log('─'.repeat(80));

    // 제거된 컬럼 확인
    const removedColumns = ['userdata', 'clear_cache'];
    console.log('\n❌ 제거된 기본값 고정 컬럼들:');
    for (const colName of removedColumns) {
      const exists = afterColumns.rows.find(col => col.column_name === colName);
      if (exists) {
        console.log(`   ❌ ${colName}: 아직 존재함!`);
      } else {
        console.log(`   ✅ ${colName}: 성공적으로 제거됨 (하드코딩으로 대체)`);
      }
    }

    // 남은 핵심 컬럼들
    const coreColumns = ['keyword', 'product_code', 'cart_click_enabled'];
    console.log('\n✅ 남은 핵심 설정 컬럼들:');
    for (const colName of coreColumns) {
      const col = afterColumns.rows.find(c => c.column_name === colName);
      if (col) {
        console.log(`   ✅ ${colName}: ${col.data_type} (기본값: ${col.column_default || 'NULL'})`);
      } else {
        console.log(`   ❌ ${colName}: 존재하지 않음!`);
      }
    }

    // 최종 초심플 데이터 확인
    const finalData = await pool.query(`
      SELECT id, keyword, product_code, agent, cart_click_enabled, tracking_key
      FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log('\n📊 최종 초심플 키워드 데이터:');
    console.log('─'.repeat(80));
    console.log('ID | 키워드       | 상품코드    | 에이전트 | 장바구니 | tracking_key');
    console.log('─'.repeat(80));
    finalData.rows.forEach(row => {
      const cart = row.cart_click_enabled ? 'ON ' : 'OFF';
      console.log(`${row.id.toString().padEnd(2)} | ${row.keyword.padEnd(12)} | ${row.product_code.padEnd(11)} | ${(row.agent || '').padEnd(8)} | ${cart.padEnd(8)} | ${row.tracking_key}`);
    });
    console.log('─'.repeat(80));

    console.log('\n🎉 v2_test_keywords 초심플 버전 완료!');
    console.log('\n📖 제거된 컬럼들과 하드코딩 값:');
    console.log('   • userdata → 하드코딩: true (영구 프로필 사용)');
    console.log('   • clear_cache → 하드코딩: false (캐시 유지, session만 삭제)');
    console.log('   • optimize → 하드코딩: true (무조건 활성화)');
    console.log('   • search → 동적: goto 기본, 차단 시 search 모드');
    console.log('\n🔧 남은 유일한 설정 컬럼:');
    console.log('   • cart_click_enabled → 장바구니 클릭 여부만 제어');
    console.log('\n💡 이제 v2_test_keywords는 순수하게 키워드 + 상품코드 + 장바구니옵션만!');

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
  removeDefaultColumns().catch(console.error);
}

module.exports = { removeDefaultColumns };