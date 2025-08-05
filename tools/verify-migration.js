/**
 * 마이그레이션 검증 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function verifyMigration() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    console.log('═══════════════════════════════════════');
    console.log('📊 v1 테이블 데이터 검증');
    console.log('═══════════════════════════════════════\n');
    
    // 1. v1_keywords 샘플 데이터
    console.log('📋 v1_keywords 샘플 데이터 (최근 5건):');
    const keywordsResult = await client.query(`
      SELECT id, keyword, code, agent, cart, userdata, session, cache, gpu, optimize, runs, succ, fail
      FROM v1_keywords
      ORDER BY id DESC
      LIMIT 5
    `);
    console.table(keywordsResult.rows);
    
    // 2. suffix 통합 확인
    console.log('\n📋 Suffix 통합 확인:');
    const suffixResult = await client.query(`
      SELECT 
        v2.keyword as v2_keyword,
        v2.suffix as v2_suffix,
        v1.keyword as v1_keyword_merged
      FROM v2_test_keywords v2
      JOIN v1_keywords v1 ON v2.id = v1.id
      WHERE v2.suffix IS NOT NULL AND v2.suffix != ''
      LIMIT 5
    `);
    console.table(suffixResult.rows);
    
    // 3. v1_executions 샘플 데이터
    console.log('\n📋 v1_executions 최근 실행 (5건):');
    const executionsResult = await client.query(`
      SELECT 
        e.id,
        k.keyword,
        e.success,
        e.found,
        e.rank,
        e.cart,
        e.traffic,
        e.optimize,
        e.executed
      FROM v1_executions e
      JOIN v1_keywords k ON e.keyword_id = k.id
      ORDER BY e.executed DESC
      LIMIT 5
    `);
    console.table(executionsResult.rows);
    
    // 4. v1_errors 최근 오류
    console.log('\n📋 v1_errors 최근 오류 (5건):');
    const errorsResult = await client.query(`
      SELECT 
        e.id,
        e.code,
        LEFT(e.message, 50) || '...' as message_preview,
        e.occurred,
        e.agent
      FROM v1_errors e
      ORDER BY e.occurred DESC
      LIMIT 5
    `);
    console.table(errorsResult.rows);
    
    // 5. browser 컬럼 제거 확인
    console.log('\n📋 v2_error_logs browser 컬럼 확인:');
    const columnsResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'v2_error_logs'
      AND column_name = 'browser'
    `);
    if (columnsResult.rows.length === 0) {
      console.log('   ✅ browser 컬럼이 성공적으로 제거됨');
    } else {
      console.log('   ❌ browser 컬럼이 여전히 존재함');
    }
    
    // 6. 통계 뷰 확인
    console.log('\n📋 v1_keyword_stats 뷰 (상위 5개):');
    const statsResult = await client.query(`
      SELECT * FROM v1_keyword_stats
      ORDER BY success_rate DESC
      LIMIT 5
    `);
    console.table(statsResult.rows);
    
    console.log('\n✅ 마이그레이션 검증 완료!');
    
  } catch (error) {
    console.error('❌ 검증 오류:', error.message);
  } finally {
    await client.end();
  }
}

verifyMigration();