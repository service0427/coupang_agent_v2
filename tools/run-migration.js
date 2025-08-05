/**
 * 데이터베이스 마이그레이션 실행 도구
 */

const dbService = require('../lib/services/db-service');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 마이그레이션 시작...');
    
    // 마이그레이션 파일 읽기
    const migrationPath = path.join(__dirname, '..', 'sql', 'v2_migration_20250805.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    // 전체 SQL 파일을 하나의 트랜잭션으로 실행
    const client = await dbService.getClient();
    
    try {
      await client.query('BEGIN');
      console.log('  트랜잭션 시작...');
      
      // 전체 SQL 실행
      await client.query(sql);
      
      await client.query('COMMIT');
      console.log('  트랜잭션 커밋 완료');
    } catch (error) {
      await client.query('ROLLBACK');
      console.log('  트랜잭션 롤백');
      throw error;
    } finally {
      client.release();
    }
    
    console.log('✅ 마이그레이션 완료');
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
    throw error;
  } finally {
    await dbService.close();
  }
}

// 실행
if (require.main === module) {
  runMigration().catch(console.error);
}