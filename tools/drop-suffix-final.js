/**
 * suffix 컬럼 완전 제거 도구 (CASCADE 강제 삭제)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function dropSuffixFinal() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🗑️  suffix 컬럼 완전 제거 시작...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 현재 테이블 구조 확인
    try {
      const beforeColumns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'v2_test_keywords' 
          AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      console.log('📋 현재 v2_test_keywords 컬럼:');
      beforeColumns.rows.forEach(col => {
        const indicator = col.column_name === 'suffix' ? '🗑️ ' : '   ';
        console.log(`${indicator}${col.column_name} (${col.data_type})`);
      });
      console.log('');
      
    } catch (error) {
      console.log('📝 테이블 구조 확인 실패 (테이블이 없을 수 있음)\n');
    }

    // SQL 파일 실행
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_drop_suffix_final.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔥 강제 삭제 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ suffix 컬럼 완전 제거 완료!\n');

    // 제거 후 구조 확인
    const afterColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 제거 후 v2_test_keywords 구조:');
    console.log('─'.repeat(50));
    afterColumns.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`   ${col.column_name.padEnd(25)} | ${col.data_type.padEnd(15)} | ${nullable}`);
    });
    console.log('─'.repeat(50));

    // suffix 컬럼이 정말로 없어졌는지 확인
    const suffixExists = afterColumns.rows.find(col => col.column_name === 'suffix');
    if (suffixExists) {
      console.log('❌ suffix 컬럼이 아직 존재합니다!');
    } else {
      console.log('✅ suffix 컬럼이 완전히 제거되었습니다!');
    }

    // 함수 확인
    const functions = await pool.query(`
      SELECT routine_name, specific_name
      FROM information_schema.routines 
      WHERE routine_name LIKE '%tracking_key%' 
        AND routine_schema = 'public'
      ORDER BY routine_name
    `);
    
    console.log('\n🔧 생성된 함수들:');
    functions.rows.forEach(func => {
      console.log(`   ✓ ${func.routine_name}`);
    });

    // tracking_key 샘플 확인
    const sampleData = await pool.query(`
      SELECT id, keyword, product_code, tracking_key
      FROM v2_test_keywords 
      ORDER BY id 
      LIMIT 5
    `);
    
    console.log('\n🔑 tracking_key 샘플:');
    sampleData.rows.forEach(row => {
      console.log(`   ID:${row.id} | ${row.keyword} + ${row.product_code} → ${row.tracking_key}`);
    });

    console.log('\n🎉 완료! 주요 변경사항:');
    console.log('   • suffix 컬럼 완전 제거 (CASCADE)');
    console.log('   • 관련 함수들 2개 파라미터로 단순화');
    console.log('   • 뷰와 트리거 모두 suffix 없이 재생성');
    console.log('   • tracking_key: keyword:product_code 형태로 고정');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 데이터베이스 연결 실패!');
    } else if (error.code === '28P01') {
      console.error('\n🔐 인증 실패!');
    } else if (error.code === '42703') {
      console.error('\n📋 컬럼이 이미 제거되었습니다');
    }
    
    console.error('\n스택 추적:', error.stack);
  } finally {
    await pool.end();
    console.log('\n👋 데이터베이스 연결 종료');
  }
}

// 실행
if (require.main === module) {
  dropSuffixFinal().catch(console.error);
}

module.exports = { dropSuffixFinal };