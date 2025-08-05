/**
 * URL 파싱 관련 컬럼 추가 스크립트
 */

const { Client } = require('pg');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function addNewColumns() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. 새로운 컬럼 추가
    console.log('📋 새로운 컬럼 추가 중...');
    
    try {
      await client.query('ALTER TABLE v1_executions ADD COLUMN IF NOT EXISTS item_id BIGINT');
      console.log('   ✅ item_id 컬럼 추가 완료');
    } catch (error) {
      console.log('   ⚠️ item_id 컬럼 추가 오류:', error.message);
    }
    
    try {
      await client.query('ALTER TABLE v1_executions ADD COLUMN IF NOT EXISTS vendor_item_id BIGINT');
      console.log('   ✅ vendor_item_id 컬럼 추가 완료');
    } catch (error) {
      console.log('   ⚠️ vendor_item_id 컬럼 추가 오류:', error.message);
    }
    
    try {
      await client.query('ALTER TABLE v1_executions ADD COLUMN IF NOT EXISTS real_rank INTEGER');
      console.log('   ✅ real_rank 컬럼 추가 완료');
    } catch (error) {
      console.log('   ⚠️ real_rank 컬럼 추가 오류:', error.message);
    }
    
    // 2. 코멘트 추가
    console.log('\n📋 컬럼 설명 추가 중...');
    await client.query(`
      COMMENT ON COLUMN v1_executions.item_id IS 'URL에서 추출한 itemId';
      COMMENT ON COLUMN v1_executions.vendor_item_id IS 'URL에서 추출한 vendorItemId';
      COMMENT ON COLUMN v1_executions.real_rank IS '광고 제외 실제 순위';
    `);
    console.log('   ✅ 컬럼 설명 추가 완료');
    
    // 3. 최종 테이블 구조 확인
    console.log('\n📋 v1_executions 테이블 최종 구조:');
    const result = await client.query(`
      SELECT column_name, data_type, ordinal_position
      FROM information_schema.columns
      WHERE table_name = 'v1_executions'
      ORDER BY ordinal_position
    `);
    console.table(result.rows);
    
    // 4. v1_create_tables_new.sql 업데이트 필요
    console.log('\n⚠️  주의: v1_create_tables_new.sql 파일도 업데이트 필요');
    
    console.log('\n✅ 컬럼 추가 작업 완료!');
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.end();
  }
}

addNewColumns();