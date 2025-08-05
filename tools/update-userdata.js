/**
 * userdata 설정 업데이트
 * 세션 유지를 위해 userdata를 true로 설정
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function updateUserdata() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // default1의 userdata를 true로 업데이트
    console.log('🔧 default1 에이전트의 userdata 설정 업데이트...');
    const updateResult = await client.query(`
      UPDATE v1_keywords
      SET userdata = true
      WHERE agent = 'default1'
      AND runs < max_runs
    `);
    console.log(`   ✅ ${updateResult.rowCount}개 키워드 업데이트 완료`);
    
    // 업데이트 결과 확인
    console.log('\n📊 업데이트 후 설정:');
    const checkResult = await client.query(`
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
    console.table(checkResult.rows);
    
    console.log('\n💡 설명:');
    console.log('   - session=true: 세션 유지 (쿠키 보존)');
    console.log('   - userdata=true: 영구 프로필 사용 (브라우저 데이터 저장)');
    console.log('   - cache=true: 캐시 유지 (트래픽 절감)');
    console.log('\n이제 쿠키가 세션 간에 유지됩니다!');
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

updateUserdata();