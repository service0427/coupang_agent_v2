/**
 * v1 뷰 생성 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function createViews() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. v1_keyword_stats 뷰 생성
    console.log('📋 v1_keyword_stats 뷰 생성 중...');
    await client.query(`
      CREATE OR REPLACE VIEW v1_keyword_stats AS
      SELECT 
        k.id,
        k.keyword,
        k.code,
        k.agent,
        k.runs as current_runs,
        k.max_runs,
        k.succ as success_count,
        k.fail as fail_count,
        CASE 
          WHEN (k.succ + k.fail) > 0 
          THEN ROUND((k.succ::NUMERIC / (k.succ + k.fail)) * 100, 2)
          ELSE 0 
        END as success_rate,
        k.last_run
      FROM v1_keywords k
      ORDER BY k.id
    `);
    console.log('   ✅ 완료');
    
    // 2. v1_execution_stats 뷰 생성
    console.log('\n📋 v1_execution_stats 뷰 생성 중...');
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
    console.log('   ✅ 완료');
    
    // 3. v1_error_summary 뷰 생성
    console.log('\n📋 v1_error_summary 뷰 생성 중...');
    await client.query(`
      CREATE OR REPLACE VIEW v1_error_summary AS
      SELECT 
        code as error_code,
        COUNT(*) as error_count,
        MAX(occurred) as last_occurred,
        COUNT(DISTINCT keyword_id) as affected_keywords
      FROM v1_errors
      GROUP BY code
      ORDER BY error_count DESC
    `);
    console.log('   ✅ 완료');
    
    // 뷰 확인
    console.log('\n📊 생성된 뷰 확인:');
    const viewsResult = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
      AND table_name LIKE 'v1_%'
      ORDER BY table_name
    `);
    console.table(viewsResult.rows);
    
    // 샘플 데이터 확인
    console.log('\n📋 v1_keyword_stats 샘플 (성공률 상위 5개):');
    const statsResult = await client.query(`
      SELECT * FROM v1_keyword_stats
      WHERE success_count > 0
      ORDER BY success_rate DESC
      LIMIT 5
    `);
    console.table(statsResult.rows);
    
    console.log('\n✅ 뷰 생성 완료!');
    
  } catch (error) {
    console.error('❌ 뷰 생성 오류:', error.message);
  } finally {
    await client.end();
  }
}

createViews();