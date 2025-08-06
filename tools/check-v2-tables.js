/**
 * V2 테이블 상태 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkV2Tables() {
  try {
    console.log('V2 테이블 상태 확인...\n');
    
    // 현재 v2 테이블 확인
    const v2Tables = await dbServiceV2.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'v2_%'
      ORDER BY tablename
    `);
    
    if (v2Tables.rows.length > 0) {
      console.log('현재 V2 테이블:');
      v2Tables.rows.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
    } else {
      console.log('V2 테이블이 없습니다.');
    }
    
    // old-v2 테이블 확인
    const oldV2Tables = await dbServiceV2.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'old-v2_%'
      ORDER BY tablename
    `);
    
    if (oldV2Tables.rows.length > 0) {
      console.log('\n이전 버전 테이블 (old-v2):');
      oldV2Tables.rows.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
    }
    
    // v2_test_keywords 테이블 구조 확인
    try {
      const columns = await dbServiceV2.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'v2_test_keywords'
        ORDER BY ordinal_position
      `);
      
      if (columns.rows.length > 0) {
        console.log('\nv2_test_keywords 테이블 구조:');
        console.log('컬럼명                          | 타입                | NULL | 기본값');
        console.log('--------------------------------|---------------------|------|--------');
        columns.rows.forEach(col => {
          const name = col.column_name.padEnd(30);
          const type = col.data_type.padEnd(19);
          const nullable = col.is_nullable.padEnd(5);
          const defaultVal = col.column_default ? col.column_default.substring(0, 30) : '';
          console.log(`${name} | ${type} | ${nullable} | ${defaultVal}`);
        });
      }
    } catch (e) {
      console.log('\nv2_test_keywords 테이블이 존재하지 않습니다.');
    }
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

if (require.main === module) {
  checkV2Tables();
}