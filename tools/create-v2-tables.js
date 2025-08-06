/**
 * V2 테이블 생성 전용 도구
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const config = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!',
  ssl: false
};

async function createV2Tables() {
  const pool = new Pool(config);

  try {
    console.log('🔧 V2 테이블 생성 시작...\n');
    console.log(`📍 서버: ${config.host}`);
    console.log(`📍 데이터베이스: ${config.database}\n`);

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_create_tables.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 SQL 파일 실행 중...');
    await pool.query(sqlContent);

    console.log('✅ V2 테이블 생성 완료!');
    
    // 생성된 테이블 확인
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'v2_%'
      ORDER BY table_name
    `);
    
    console.log('\n📋 생성된 V2 테이블:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // 샘플 데이터 확인
    const keywordCount = await pool.query('SELECT COUNT(*) FROM v2_test_keywords');
    console.log(`\n📊 v2_test_keywords: ${keywordCount.rows[0].count}개 레코드`);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    if (error.stack) {
      console.error('\n스택 추적:', error.stack);
    }
  } finally {
    await pool.end();
  }
}

// 실행
if (require.main === module) {
  createV2Tables();
}

module.exports = { createV2Tables };