/**
 * 실제 데이터베이스 구조 확인
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function checkDatabaseStructure() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 현재 존재하는 테이블 목록
    console.log('📋 현재 존재하는 테이블:');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%keyword%' OR table_name LIKE '%execution%' OR table_name LIKE '%error%'
      ORDER BY table_name
    `);
    console.table(tables.rows);
    
    // v1_keywords 테이블 구조
    console.log('\n📋 v1_keywords 테이블 구조:');
    const v1Keywords = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns
      WHERE table_name = 'v1_keywords' 
      ORDER BY ordinal_position
    `);
    console.table(v1Keywords.rows);
    
    // v1_executions 테이블 구조
    console.log('\n📋 v1_executions 테이블 구조:');
    const v1Executions = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns
      WHERE table_name = 'v1_executions' 
      ORDER BY ordinal_position
    `);
    console.table(v1Executions.rows);
    
    // v1_errors 테이블 구조
    console.log('\n📋 v1_errors 테이블 구조:');
    const v1Errors = await client.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns
      WHERE table_name = 'v1_errors' 
      ORDER BY ordinal_position
    `);
    console.table(v1Errors.rows);
    
    // v2 테이블들도 확인 (있다면)
    const v2Tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'v2_%'
      ORDER BY table_name
    `);
    
    if (v2Tables.rows.length > 0) {
      console.log('\n📋 v2 테이블들:');
      console.table(v2Tables.rows);
    }
    
    // 인덱스 정보
    console.log('\n📋 인덱스 정보:');
    const indexes = await client.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename LIKE 'v1_%'
      ORDER BY tablename, indexname
    `);
    console.table(indexes.rows);
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

checkDatabaseStructure();