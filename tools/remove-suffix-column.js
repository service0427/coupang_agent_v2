/**
 * suffix 컬럼 제거 및 tracking_key 일관성 개선 도구
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const environment = require('../environment');

async function removeSuffixColumn() {
  const pool = new Pool({
    host: environment.database.host,
    port: environment.database.port,
    database: environment.database.database,
    user: environment.database.user,
    password: environment.database.password
  });

  try {
    console.log('🔧 suffix 컬럼 제거 및 일관성 개선 시작...\n');
    console.log(`📍 서버: ${environment.database.host}`);
    console.log(`📍 데이터베이스: ${environment.database.database}\n`);

    // 기존 suffix 데이터 확인
    try {
      const suffixCheck = await pool.query(`
        SELECT 
          COUNT(*) as total_count,
          COUNT(CASE WHEN suffix IS NOT NULL AND suffix != '' THEN 1 END) as with_suffix
        FROM v2_test_keywords
      `);
      
      const totalCount = suffixCheck.rows[0].total_count;
      const withSuffix = suffixCheck.rows[0].with_suffix;
      
      console.log(`📊 현재 키워드 데이터: 총 ${totalCount}개`);
      console.log(`   └ suffix 값이 있는 항목: ${withSuffix}개`);
      
      if (parseInt(withSuffix) > 0) {
        console.log('⚠️  suffix 데이터가 있습니다. 제거 후 tracking_key가 변경될 수 있습니다.\n');
      } else {
        console.log('✓ suffix 데이터가 없어 안전하게 컬럼 제거 가능합니다.\n');
      }
    } catch (error) {
      console.log('📝 기존 데이터 확인 중 오류 (테이블이 없을 수 있음)\n');
    }

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'sql', 'v2_remove_suffix.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 suffix 제거 스크립트 실행 중...');
    await pool.query(sqlContent);
    
    console.log('✅ suffix 컬럼 제거 및 일관성 개선 완료!\n');

    // 업데이트된 구조 확인
    const columnResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name IN ('keyword', 'suffix', 'product_code', 'tracking_key')
      ORDER BY 
        CASE column_name 
          WHEN 'keyword' THEN 1
          WHEN 'suffix' THEN 2  
          WHEN 'product_code' THEN 3
          WHEN 'tracking_key' THEN 4
        END
    `);
    
    console.log('📋 키 관련 컬럼 상태:');
    console.log('─'.repeat(50));
    columnResult.rows.forEach(row => {
      const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`   ${row.column_name.padEnd(20)} | ${row.data_type.padEnd(15)} | ${nullable}`);
    });
    console.log('─'.repeat(50));

    // tracking_key 샘플 확인
    const trackingKeyResult = await pool.query(`
      SELECT 
        id, 
        keyword, 
        product_code, 
        tracking_key
      FROM v2_test_keywords 
      WHERE tracking_key IS NOT NULL
      ORDER BY id 
      LIMIT 5
    `);
    
    console.log('\n🔑 생성된 tracking_key 샘플:');
    console.log('─'.repeat(70));
    trackingKeyResult.rows.forEach(row => {
      console.log(`   ID:${row.id} | ${row.keyword} → ${row.product_code} = ${row.tracking_key}`);
    });
    console.log('─'.repeat(70));

    // 함수 정의 확인
    const functionResult = await pool.query(`
      SELECT 
        routine_name,
        routine_definition
      FROM information_schema.routines 
      WHERE routine_name LIKE '%tracking_key%' 
        AND routine_schema = 'public'
      ORDER BY routine_name
    `);
    
    console.log('\n🔧 업데이트된 함수:');
    functionResult.rows.forEach(row => {
      console.log(`   ✓ ${row.routine_name}`);
    });

    console.log('\n🎉 완료! 주요 변경사항:');
    console.log('   • suffix 컬럼 완전 제거');
    console.log('   • tracking_key 생성 함수 단순화 (keyword:product_code)');
    console.log('   • 기존 데이터의 tracking_key 재생성');
    console.log('   • v2_test_keywords와 v2_execution_logs 일관성 확보');

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
  removeSuffixColumn().catch(console.error);
}

module.exports = { removeSuffixColumn };