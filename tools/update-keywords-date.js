/**
 * v1_keywords 날짜 업데이트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function updateKeywordDates() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 현재 날짜 확인
    const dateResult = await client.query('SELECT CURRENT_DATE as today');
    console.log(`📅 오늘 날짜: ${dateResult.rows[0].today}\n`);
    
    // 업데이트 전 상태 확인
    console.log('📊 업데이트 전 상태:');
    const beforeResult = await client.query(`
      SELECT agent, date, COUNT(*) as count
      FROM v1_keywords
      WHERE runs < max_runs
      GROUP BY agent, date
      ORDER BY agent, date
    `);
    console.table(beforeResult.rows);
    
    // 날짜 업데이트 실행
    console.log('\n🔧 날짜 업데이트 실행 중...');
    const updateResult = await client.query(`
      UPDATE v1_keywords 
      SET date = CURRENT_DATE 
      WHERE runs < max_runs
      AND date != CURRENT_DATE
    `);
    console.log(`   ✅ ${updateResult.rowCount}개 키워드 업데이트 완료`);
    
    // 업데이트 후 상태 확인
    console.log('\n📊 업데이트 후 상태:');
    const afterResult = await client.query(`
      SELECT agent, date, COUNT(*) as count
      FROM v1_keywords
      WHERE runs < max_runs
      GROUP BY agent, date
      ORDER BY agent, date
    `);
    console.table(afterResult.rows);
    
    // default1 에이전트 확인
    console.log('\n🔍 default1 에이전트 키워드 (업데이트 후):');
    const default1Result = await client.query(`
      SELECT id, keyword, code, runs, max_runs, date
      FROM v1_keywords
      WHERE agent = 'default1'
      AND runs < max_runs
      AND date = CURRENT_DATE
      ORDER BY id
      LIMIT 5
    `);
    console.table(default1Result.rows);
    
    console.log('\n✅ 날짜 업데이트 완료!');
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

updateKeywordDates();