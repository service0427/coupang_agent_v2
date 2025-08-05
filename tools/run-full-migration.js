/**
 * 전체 마이그레이션 실행 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function runFullMigration() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. v1_keywords 마이그레이션
    console.log('📋 v1_keywords 마이그레이션 중...');
    const keywordsResult = await client.query(`
      INSERT INTO v1_keywords (
        id, date, keyword, code, agent, proxy, cart, userdata, 
        session, cache, gpu, optimize, max_runs, runs, succ, fail, 
        last_run, created
      )
      SELECT 
        id,
        date,
        CASE 
          WHEN suffix IS NOT NULL AND suffix != '' 
          THEN keyword || ' ' || suffix
          ELSE keyword
        END as keyword,
        product_code,
        COALESCE(agent, 'default'),
        proxy_server,
        COALESCE(cart_click_enabled, false),
        COALESCE(use_persistent, true),
        NOT COALESCE(clear_session, true),
        NOT COALESCE(clear_cache, false),
        NOT COALESCE(gpu_disabled, false),
        COALESCE(optimize, false),
        COALESCE(max_executions, 100),
        COALESCE(current_executions, 0),
        COALESCE(success_count, 0),
        COALESCE(fail_count, 0),
        last_executed_at,
        created_at
      FROM v2_test_keywords
      WHERE id > 1  -- 이미 마이그레이션된 ID 1 제외
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`   ✅ ${keywordsResult.rowCount}건 마이그레이션 완료`);
    
    // 시퀀스 동기화
    await client.query(`SELECT setval('v1_keywords_id_seq', (SELECT MAX(id) FROM v1_keywords))`);
    
    // 2. v1_executions 마이그레이션
    console.log('\n📋 v1_executions 마이그레이션 중...');
    const executionsResult = await client.query(`
      INSERT INTO v1_executions (
        id, keyword_id, agent, executed, success, error, duration,
        query, found, rank, url_rank, pages, referrer, cart, cart_count,
        proxy, ip, traffic, url, optimize, session, cache, userdata, gpu
      )
      SELECT 
        e.id,
        e.keyword_id,
        e.agent,
        e.executed_at,
        e.success,
        e.error_message,
        e.duration_ms,
        e.search_query,
        e.product_found,
        e.product_rank,
        e.url_rank,
        e.pages_searched,
        e.referrer,
        COALESCE(e.cart_clicked, false),
        COALESCE(e.cart_click_count, 0),
        e.proxy_used,
        e.actual_ip,
        e.actual_traffic_mb,
        e.final_url,
        COALESCE(e.optimize_enabled, false),
        NOT COALESCE(e.clear_session, true),
        NOT COALESCE(e.clear_cache, false),
        COALESCE(e.use_persistent, true),
        NOT COALESCE(e.gpu_disabled, false)
      FROM v2_execution_logs e
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`   ✅ ${executionsResult.rowCount}건 마이그레이션 완료`);
    
    // 시퀀스 동기화
    await client.query(`SELECT setval('v1_executions_id_seq', (SELECT MAX(id) FROM v1_executions))`);
    
    // 3. v1_errors 마이그레이션
    console.log('\n📋 v1_errors 마이그레이션 중...');
    const errorsResult = await client.query(`
      INSERT INTO v1_errors (
        id, code, message, occurred, url, proxy, ip, keyword_id, agent
      )
      SELECT 
        id,
        error_code,
        error_message,
        occurred_at,
        page_url,
        proxy_used,
        actual_ip,
        keyword_id,
        agent
      FROM v2_error_logs
      ON CONFLICT (id) DO NOTHING
    `);
    console.log(`   ✅ ${errorsResult.rowCount}건 마이그레이션 완료`);
    
    // 시퀀스 동기화
    await client.query(`SELECT setval('v1_errors_id_seq', (SELECT MAX(id) FROM v1_errors))`);
    
    // 4. browser 컬럼 제거
    console.log('\n📋 v2_error_logs에서 browser 컬럼 제거 중...');
    try {
      await client.query(`ALTER TABLE v2_error_logs DROP COLUMN IF EXISTS browser`);
      console.log('   ✅ browser 컬럼 제거 완료');
    } catch (error) {
      console.log('   ⚠️ browser 컬럼이 이미 제거되었거나 존재하지 않음');
    }
    
    // 5. 최종 결과 확인
    console.log('\n═══════════════════════════════════════');
    console.log('📊 마이그레이션 결과 요약');
    console.log('═══════════════════════════════════════');
    
    const summaryQueries = [
      { name: 'v2_test_keywords', query: 'SELECT COUNT(*) as count FROM v2_test_keywords' },
      { name: 'v1_keywords', query: 'SELECT COUNT(*) as count FROM v1_keywords' },
      { name: 'v2_execution_logs', query: 'SELECT COUNT(*) as count FROM v2_execution_logs' },
      { name: 'v1_executions', query: 'SELECT COUNT(*) as count FROM v1_executions' },
      { name: 'v2_error_logs', query: 'SELECT COUNT(*) as count FROM v2_error_logs' },
      { name: 'v1_errors', query: 'SELECT COUNT(*) as count FROM v1_errors' }
    ];
    
    for (const q of summaryQueries) {
      const result = await client.query(q.query);
      console.log(`   ${q.name}: ${result.rows[0].count}건`);
    }
    
    // Boolean 값 변환 확인
    console.log('\n📋 Boolean 값 변환 확인 (샘플 3건):');
    const boolCheckResult = await client.query(`
      SELECT 
        v2.id,
        v2.clear_session as v2_clear_session,
        v1.session as v1_session,
        v2.clear_cache as v2_clear_cache,
        v1.cache as v1_cache,
        v2.gpu_disabled as v2_gpu_disabled,
        v1.gpu as v1_gpu
      FROM v2_test_keywords v2
      JOIN v1_keywords v1 ON v2.id = v1.id
      LIMIT 3
    `);
    console.table(boolCheckResult.rows);
    
    console.log('\n✅ 전체 마이그레이션 완료!');
    
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error.message);
    console.error('상세:', error.detail || error.hint || '');
  } finally {
    await client.end();
  }
}

runFullMigration();