/**
 * v1_keywords 테이블 데이터 확인
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function checkKeywords() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. 전체 키워드 개수 확인
    console.log('📊 전체 키워드 통계:');
    const totalResult = await client.query('SELECT COUNT(*) as count FROM v1_keywords');
    console.log(`   총 키워드: ${totalResult.rows[0].count}개\n`);
    
    // 2. 날짜별 키워드 확인
    console.log('📅 날짜별 키워드:');
    const dateResult = await client.query(`
      SELECT date, COUNT(*) as count
      FROM v1_keywords
      GROUP BY date
      ORDER BY date DESC
      LIMIT 5
    `);
    console.table(dateResult.rows);
    
    // 3. 오늘 날짜 키워드 확인
    console.log('\n📋 오늘 날짜 키워드:');
    const todayResult = await client.query(`
      SELECT id, keyword, code, agent, runs, max_runs, date
      FROM v1_keywords
      WHERE date = CURRENT_DATE
      ORDER BY id
      LIMIT 10
    `);
    
    if (todayResult.rows.length === 0) {
      console.log('   ⚠️ 오늘 날짜의 키워드가 없습니다!');
      
      // 가장 최근 날짜 확인
      const recentResult = await client.query(`
        SELECT MAX(date) as latest_date
        FROM v1_keywords
      `);
      console.log(`   가장 최근 날짜: ${recentResult.rows[0].latest_date}`);
    } else {
      console.table(todayResult.rows);
    }
    
    // 4. agent별 키워드 확인
    console.log('\n📊 Agent별 키워드 통계:');
    const agentResult = await client.query(`
      SELECT agent, COUNT(*) as count
      FROM v1_keywords
      WHERE runs < max_runs
      GROUP BY agent
      ORDER BY agent
    `);
    console.table(agentResult.rows);
    
    // 5. default1 에이전트 키워드 확인
    console.log('\n🔍 default1 에이전트 키워드:');
    const default1Result = await client.query(`
      SELECT id, keyword, code, runs, max_runs, date
      FROM v1_keywords
      WHERE agent = 'default1'
      AND runs < max_runs
      ORDER BY id
      LIMIT 5
    `);
    
    if (default1Result.rows.length === 0) {
      console.log('   ⚠️ default1 에이전트의 실행 가능한 키워드가 없습니다!');
    } else {
      console.table(default1Result.rows);
    }
    
    // 6. 날짜 업데이트가 필요한지 확인
    console.log('\n🔧 날짜 업데이트 제안:');
    const updateResult = await client.query(`
      SELECT COUNT(*) as count
      FROM v1_keywords
      WHERE date != CURRENT_DATE
      AND runs < max_runs
    `);
    
    if (updateResult.rows[0].count > 0) {
      console.log(`   ${updateResult.rows[0].count}개의 키워드를 오늘 날짜로 업데이트할 수 있습니다.`);
      console.log(`   UPDATE v1_keywords SET date = CURRENT_DATE WHERE runs < max_runs;`);
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

checkKeywords();