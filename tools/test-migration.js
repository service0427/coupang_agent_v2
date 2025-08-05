/**
 * 마이그레이션 테스트 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function testMigration() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. v1_keywords 테이블 구조 확인
    console.log('📋 v1_keywords 테이블 구조:');
    const structResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'v1_keywords'
      ORDER BY ordinal_position
    `);
    console.table(structResult.rows);
    
    // 2. 수동으로 하나의 레코드만 마이그레이션 테스트
    console.log('\n🔧 단일 레코드 마이그레이션 테스트:');
    try {
      const testResult = await client.query(`
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
        WHERE id = 1
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `);
      
      if (testResult.rows.length > 0) {
        console.log('✅ 마이그레이션 성공:');
        console.table(testResult.rows);
      } else {
        console.log('⚠️ 이미 마이그레이션된 레코드');
      }
    } catch (error) {
      console.log('❌ 마이그레이션 오류:', error.message);
      console.log('상세 오류:', error.detail || error.hint || '');
    }
    
    // 3. v1_keywords 데이터 확인
    console.log('\n📊 v1_keywords 현재 데이터:');
    const dataResult = await client.query('SELECT COUNT(*) as count FROM v1_keywords');
    console.log(`   총 ${dataResult.rows[0].count}건`);
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

testMigration();