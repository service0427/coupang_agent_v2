/**
 * cart_count와 referrer 컬럼 제거 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function removeColumns() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. 현재 테이블 구조 확인
    console.log('📋 v1_executions 테이블 현재 구조:');
    const beforeResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'v1_executions'
      AND column_name IN ('cart_count', 'referrer')
      ORDER BY ordinal_position
    `);
    console.table(beforeResult.rows);
    
    // 2. cart_count 컬럼 제거
    console.log('\n📋 cart_count 컬럼 제거 중...');
    try {
      await client.query('ALTER TABLE v1_executions DROP COLUMN IF EXISTS cart_count');
      console.log('   ✅ cart_count 컬럼 제거 완료');
    } catch (error) {
      console.log('   ❌ cart_count 컬럼 제거 오류:', error.message);
    }
    
    // 3. referrer 컬럼 제거
    console.log('\n📋 referrer 컬럼 제거 중...');
    try {
      await client.query('ALTER TABLE v1_executions DROP COLUMN IF EXISTS referrer');
      console.log('   ✅ referrer 컬럼 제거 완료');
    } catch (error) {
      console.log('   ❌ referrer 컬럼 제거 오류:', error.message);
    }
    
    // 4. 최종 테이블 구조 확인
    console.log('\n📋 v1_executions 테이블 최종 구조:');
    const afterResult = await client.query(`
      SELECT column_name, data_type, ordinal_position
      FROM information_schema.columns
      WHERE table_name = 'v1_executions'
      ORDER BY ordinal_position
    `);
    console.table(afterResult.rows);
    
    // 5. 영향받는 뷰 재생성
    console.log('\n📋 관련 뷰 재생성 중...');
    
    // v1_execution_stats 뷰 재생성 (cart_count 제거)
    await client.query(`
      CREATE OR REPLACE VIEW v1_execution_stats AS
      SELECT 
        DATE(executed) as date,
        agent,
        COUNT(*) as total_runs,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as fail_count,
        ROUND(AVG(duration)/1000.0, 2) as avg_duration_sec,
        SUM(CASE WHEN cart THEN 1 ELSE 0 END) as cart_clicks,
        ROUND(AVG(traffic), 2) as avg_traffic_mb,
        SUM(traffic) as total_traffic_mb
      FROM v1_executions
      GROUP BY DATE(executed), agent
      ORDER BY date DESC, agent
    `);
    console.log('   ✅ v1_execution_stats 뷰 재생성 완료');
    
    console.log('\n✅ 컬럼 제거 작업 완료!');
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

removeColumns();