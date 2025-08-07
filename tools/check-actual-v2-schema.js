/**
 * 실제 V2 데이터베이스 스키마 확인
 * 현재 데이터베이스에 실제로 존재하는 컬럼들과 비교
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkActualSchema() {
  console.log('🔍 실제 V2 데이터베이스 스키마 확인\n');
  
  try {
    const tables = ['v2_test_keywords', 'v2_execution_logs', 'v2_action_logs', 'v2_error_logs', 'v2_network_logs', 'v2_product_tracking'];
    
    for (const tableName of tables) {
      console.log(`📋 테이블: ${tableName.toUpperCase()}`);
      console.log('-'.repeat(50));
      
      try {
        // PostgreSQL에서 테이블 컬럼 정보 조회
        const result = await dbServiceV2.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = $1 
          ORDER BY ordinal_position
        `, [tableName]);
        
        if (result.rows.length > 0) {
          console.log(`✅ 실제 존재하는 컬럼: ${result.rows.length}개`);
          result.rows.forEach((row, index) => {
            const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(not null)';
            const defaultValue = row.column_default ? ` [기본값: ${row.column_default}]` : '';
            console.log(`   ${(index + 1).toString().padStart(2)}. ${row.column_name.padEnd(25)} ${row.data_type.padEnd(20)} ${nullable}${defaultValue}`);
          });
        } else {
          console.log('❌ 테이블이 존재하지 않음');
        }
        
      } catch (error) {
        console.log(`❌ 테이블 ${tableName} 조회 실패:`, error.message);
      }
      
      console.log('');
    }
    
    // 테이블 크기 정보도 확인
    console.log('📊 테이블 크기 정보');
    console.log('='.repeat(60));
    
    for (const tableName of tables) {
      try {
        const sizeResult = await dbServiceV2.query(`
          SELECT 
            schemaname,
            tablename,
            attname, 
            n_distinct,
            correlation
          FROM pg_stats 
          WHERE tablename = $1
          LIMIT 5
        `, [tableName]);
        
        const countResult = await dbServiceV2.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = countResult.rows[0]?.count || 0;
        
        console.log(`${tableName.padEnd(22)} | 레코드 수: ${count.toString().padStart(6)}`);
        
      } catch (error) {
        console.log(`${tableName.padEnd(22)} | 조회 실패: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ 스키마 확인 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkActualSchema();