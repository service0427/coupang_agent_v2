/**
 * v2 테이블 생성 도구
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../config/environment');

async function createTables() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔧 v2 테이블 생성 시작...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_create_tables_safe.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // SQL 실행
    await pool.query(sql);

    console.log('✅ v2 테이블 생성 완료!\n');

    // 생성된 테이블 확인
    const checkResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'v2_%'
      ORDER BY table_name
    `);

    console.log('📋 생성된 테이블:');
    checkResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // 샘플 데이터 입력 여부 확인
    const keywordCount = await pool.query('SELECT COUNT(*) FROM v2_test_keywords');
    
    if (keywordCount.rows[0].count === '0') {
      console.log('\n📝 샘플 데이터 입력 중...');
      
      await pool.query(`
        INSERT INTO v2_test_keywords (keyword, suffix, product_code, agent, use_persistent, clear_session) 
        VALUES 
          ('노트북', NULL, '76174145', 'default', true, false),
          ('노트북', '게이밍', '87654321', 'default', true, false),
          ('노트북', '업무용', '12345678', 'default', true, false)
      `);
      
      console.log('✅ 샘플 데이터 입력 완료!');
    } else {
      console.log(`\n📊 기존 키워드: ${keywordCount.rows[0].count}개`);
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 데이터베이스 연결 실패!');
      console.error('   - 서버 주소와 포트를 확인하세요');
      console.error('   - 방화벽 설정을 확인하세요');
    } else if (error.code === '28P01') {
      console.error('\n🔐 인증 실패!');
      console.error('   - 사용자명과 비밀번호를 확인하세요');
    } else if (error.code === '42P07') {
      console.error('\n⚠️ 테이블이 이미 존재합니다');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n👋 데이터베이스 연결 종료');
  }
}

// 실행
if (require.main === module) {
  createTables().catch(console.error);
}

module.exports = { createTables };