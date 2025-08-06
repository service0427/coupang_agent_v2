/**
 * V2 테이블 구조 단순화 업데이트 도구
 * - execution_logs를 4단계 중심 구조로 변경
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function updateV2Simplified() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔧 V2 테이블 구조 단순화 시작...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 기존 데이터 확인
    try {
      const existingData = await pool.query('SELECT COUNT(*) FROM v2_execution_logs');
      const count = existingData.rows[0].count;
      
      if (parseInt(count) > 0) {
        console.log(`⚠️  기존 execution_logs에 ${count}개의 데이터가 있습니다.`);
        console.log('   백업을 생성한 후 테이블 구조를 변경합니다.\n');
      } else {
        console.log('📝 기존 데이터가 없어 안전하게 구조 변경을 진행합니다.\n');
      }
    } catch (error) {
      console.log('📝 v2_execution_logs 테이블이 존재하지 않거나 접근할 수 없습니다.\n');
    }

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_update_simplified.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 단순화 스크립트 실행 중...');
    const result = await pool.query(sqlContent);
    
    console.log('✅ 테이블 구조 단순화 완료!\n');

    // 업데이트된 구조 확인
    const columnResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'v2_execution_logs' 
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 새로운 v2_execution_logs 컬럼 구조:');
    console.log('─'.repeat(70));
    
    let stageCount = 0;
    columnResult.rows.forEach(row => {
      if (row.column_name.startsWith('stage')) {
        stageCount++;
      }
      const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = row.column_default ? ` (기본값: ${row.column_default})` : '';
      console.log(`   ${row.column_name.padEnd(25)} | ${row.data_type.padEnd(20)} | ${nullable}${defaultVal}`);
    });
    
    console.log('─'.repeat(70));
    console.log(`📊 총 컬럼 수: ${columnResult.rows.length}개`);
    console.log(`🎯 단계별 컬럼: ${stageCount}개 (4단계 x 4~5개 속성)`);

    // 뷰 확인
    const viewResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'v2_%'
      ORDER BY table_name
    `);
    
    console.log('\n📈 생성된 분석 뷰:');
    viewResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // 인덱스 확인
    const indexResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'v2_execution_logs' 
        AND schemaname = 'public'
      ORDER BY indexname
    `);
    
    console.log('\n🗂️ 생성된 인덱스:');
    indexResult.rows.forEach(row => {
      console.log(`   ✓ ${row.indexname}`);
    });

    console.log('\n🎉 단순화 완료! 주요 변경사항:');
    console.log('   • 4단계 중심 구조 (search → find → click → cart)');
    console.log('   • 각 단계별 상태, 시간, 오류 메시지 추적');
    console.log('   • 상품 발견 페이지 추적 (stage2_product_found_page)');
    console.log('   • 단계별 실패 분석 뷰 추가');
    console.log('   • 불필요한 boolean 컬럼들 제거');

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 데이터베이스 연결 실패!');
      console.error('   - 서버 주소와 포트를 확인하세요');
    } else if (error.code === '28P01') {
      console.error('\n🔐 인증 실패!');
      console.error('   - 사용자명과 비밀번호를 확인하세요');
    }
    
    console.error('\n스택 추적:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n👋 데이터베이스 연결 종료');
  }
}

// 실행
if (require.main === module) {
  updateV2Simplified().catch(console.error);
}

module.exports = { updateV2Simplified };