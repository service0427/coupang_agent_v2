/**
 * suffix 컬럼 일관성 수정 도구 (컬럼 제거 대신 NULL 처리)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function fixSuffixConsistency() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔧 suffix 일관성 수정 시작...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 기존 suffix 데이터 확인
    try {
      const suffixCheck = await pool.query(`
        SELECT 
          COUNT(*) as total_count,
          COUNT(CASE WHEN suffix IS NOT NULL AND suffix != '' THEN 1 END) as with_suffix,
          STRING_AGG(DISTINCT suffix, ', ') as suffix_values
        FROM v2_test_keywords
      `);
      
      const totalCount = suffixCheck.rows[0].total_count;
      const withSuffix = suffixCheck.rows[0].with_suffix;
      const suffixValues = suffixCheck.rows[0].suffix_values;
      
      console.log(`📊 현재 키워드 데이터: 총 ${totalCount}개`);
      console.log(`   └ suffix 값이 있는 항목: ${withSuffix}개`);
      if (suffixValues) {
        console.log(`   └ suffix 값들: ${suffixValues}`);
      }
      console.log(`   → 이 모든 suffix 값들을 NULL로 정리하고 tracking_key를 keyword:product_code 형태로 통일합니다.\n`);
    } catch (error) {
      console.log('📝 기존 데이터 확인 중 오류\n');
    }

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_suffix_consistency.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 suffix 일관성 수정 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ suffix 일관성 수정 완료!\n');

    // 결과 확인
    const resultCheck = await pool.query(`
      SELECT 
        id, 
        keyword, 
        suffix,
        product_code, 
        tracking_key
      FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log('📋 수정된 키워드 데이터:');
    console.log('─'.repeat(80));
    console.log('   ID | 키워드              | suffix | 상품코드     | tracking_key');
    console.log('─'.repeat(80));
    resultCheck.rows.forEach(row => {
      const suffix = row.suffix || 'NULL';
      console.log(`   ${row.id.toString().padEnd(2)} | ${row.keyword.padEnd(15)} | ${suffix.padEnd(6)} | ${row.product_code.padEnd(12)} | ${row.tracking_key}`);
    });
    console.log('─'.repeat(80));

    // 함수 정의 확인
    const functionResult = await pool.query(`
      SELECT 
        routine_name,
        specific_name
      FROM information_schema.routines 
      WHERE routine_name LIKE '%tracking_key%' 
        AND routine_schema = 'public'
      ORDER BY routine_name, specific_name
    `);
    
    console.log('\n🔧 업데이트된 함수:');
    functionResult.rows.forEach(row => {
      console.log(`   ✓ ${row.routine_name} (${row.specific_name})`);
    });

    console.log('\n🎉 완료! 주요 변경사항:');
    console.log('   • 모든 suffix 데이터를 NULL로 정리');
    console.log('   • tracking_key 생성 로직 통일 (keyword:product_code)');
    console.log('   • v2_test_keywords와 v2_execution_logs 일관성 확보');
    console.log('   • suffix 컬럼은 유지하되 사용하지 않음 (추후 제거 가능)');

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
  fixSuffixConsistency().catch(console.error);
}

module.exports = { fixSuffixConsistency };