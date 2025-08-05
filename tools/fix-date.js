/**
 * 날짜 문제 해결
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function fixDate() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 시간대 확인
    console.log('🕐 시간대 정보:');
    const tzResult = await client.query("SHOW timezone");
    console.log(`   DB Timezone: ${tzResult.rows[0].TimeZone}`);
    
    const nowResult = await client.query("SELECT NOW() as now, CURRENT_DATE as today, CURRENT_TIMESTAMP as timestamp");
    console.log(`   NOW(): ${nowResult.rows[0].now}`);
    console.log(`   CURRENT_DATE: ${nowResult.rows[0].today}`);
    console.log(`   CURRENT_TIMESTAMP: ${nowResult.rows[0].timestamp}`);
    
    // 한국 시간대로 날짜 확인
    const koreaResult = await client.query("SELECT NOW() AT TIME ZONE 'Asia/Seoul' as korea_time");
    console.log(`   한국 시간: ${koreaResult.rows[0].korea_time}`);
    
    // 오늘 날짜를 명시적으로 설정 (2025-08-05)
    console.log('\n🔧 날짜를 2025-08-05로 업데이트...');
    const updateResult = await client.query(`
      UPDATE v1_keywords 
      SET date = '2025-08-05'::date
      WHERE runs < max_runs
    `);
    console.log(`   ✅ ${updateResult.rowCount}개 키워드 업데이트 완료`);
    
    // default1 키워드 확인
    console.log('\n🔍 default1 에이전트 키워드 확인:');
    const checkResult = await client.query(`
      SELECT id, keyword, code, runs, max_runs, date
      FROM v1_keywords
      WHERE agent = 'default1'
      AND runs < max_runs
      ORDER BY id
    `);
    console.table(checkResult.rows);
    
    // CURRENT_DATE와 비교
    console.log('\n📋 날짜 매칭 확인:');
    const matchResult = await client.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN date = CURRENT_DATE THEN 1 ELSE 0 END) as matches_current_date,
        SUM(CASE WHEN date = '2025-08-05'::date THEN 1 ELSE 0 END) as matches_20250805
      FROM v1_keywords
      WHERE agent = 'default1'
      AND runs < max_runs
    `);
    console.table(matchResult.rows);
    
    console.log('\n✅ 날짜 수정 완료!');
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

fixDate();