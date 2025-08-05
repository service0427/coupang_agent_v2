/**
 * 세션 설정 확인
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function checkSessionSettings() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // default1 에이전트의 세션 설정 확인
    console.log('🔍 default1 에이전트 세션 설정:');
    const result = await client.query(`
      SELECT 
        id, 
        keyword, 
        session,
        cache,
        userdata,
        gpu,
        optimize
      FROM v1_keywords
      WHERE agent = 'default1'
      AND runs < max_runs
      ORDER BY id
    `);
    console.table(result.rows);
    
    // v2 매핑 확인
    console.log('\n📋 v2 매핑 확인 (clear_session 반전):');
    const mappingResult = await client.query(`
      SELECT 
        id,
        session as v1_session,
        NOT session as v2_clear_session,
        cache as v1_cache,
        NOT cache as v2_clear_cache
      FROM v1_keywords
      WHERE agent = 'default1'
      AND runs < max_runs
      ORDER BY id
    `);
    console.table(mappingResult.rows);
    
    // 최근 실행 로그에서 세션 설정 확인
    console.log('\n📊 최근 실행 로그 (세션 설정):');
    const execResult = await client.query(`
      SELECT 
        e.id,
        k.keyword,
        e.session,
        e.cache,
        e.executed
      FROM v1_executions e
      JOIN v1_keywords k ON e.keyword_id = k.id
      WHERE k.agent = 'default1'
      ORDER BY e.executed DESC
      LIMIT 5
    `);
    console.table(execResult.rows);
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

checkSessionSettings();