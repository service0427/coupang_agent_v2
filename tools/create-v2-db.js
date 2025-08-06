/**
 * V2 데이터베이스 테이블 생성 도구
 * - 기존 v2 테이블을 old-v2로 변경
 * - 새로운 v2 테이블 생성
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const config = require('../environment');

async function executeSQL(pool, sqlFile, description) {
  try {
    console.log(`\n🔄 ${description}...`);
    
    const sqlPath = path.join(__dirname, '..', 'sql', sqlFile);
    const sql = await fs.readFile(sqlPath, 'utf8');
    
    // SQL을 개별 명령으로 분리 (세미콜론 기준)
    const commands = sql
      .split(/;\s*$/m)
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    let successCount = 0;
    for (const command of commands) {
      try {
        // SELECT 문은 결과 출력
        if (command.toUpperCase().includes('SELECT')) {
          const result = await pool.query(command + ';');
          if (result.rows.length > 0) {
            console.log('   ', result.rows[0]);
          }
        } else {
          await pool.query(command + ';');
        }
        successCount++;
      } catch (error) {
        if (error.message.includes('NOTICE')) {
          // NOTICE는 정보성 메시지이므로 계속 진행
          console.log('   ℹ️ ', error.message);
          successCount++;
        } else {
          console.error(`   ❌ 명령 실행 실패:`, error.message);
          console.error(`   명령:`, command.substring(0, 100) + '...');
        }
      }
    }
    
    console.log(`   ✅ ${description} 완료 (${successCount}/${commands.length} 명령 성공)`);
    return true;
  } catch (error) {
    console.error(`   ❌ ${description} 실패:`, error.message);
    return false;
  }
}

async function main() {
  console.log('=====================================================');
  console.log('V2 데이터베이스 테이블 생성');
  console.log('=====================================================');
  
  const pool = new Pool({
    ...config.database,
    connectionTimeoutMillis: 10000
  });
  
  try {
    // 연결 테스트
    console.log('\n🔗 데이터베이스 연결 확인...');
    const testResult = await pool.query('SELECT current_database() as db, current_user as user');
    console.log(`   ✅ 연결 성공: ${testResult.rows[0].db} (${testResult.rows[0].user})`);
    
    // 기존 v2 테이블 백업
    const renameSuccess = await executeSQL(
      pool,
      'rename_v2_to_old_v2.sql',
      '[1/2] 기존 v2 테이블을 old-v2로 이름 변경'
    );
    
    if (!renameSuccess) {
      console.log('\n⚠️  기존 테이블이 없거나 이미 변경되었을 수 있습니다. 계속 진행합니다.');
    }
    
    // 새 v2 테이블 생성
    const createSuccess = await executeSQL(
      pool,
      'v2_create_tables_final_with_traffic.sql',
      '[2/2] 새로운 V2 테이블 생성 (네트워크 트래픽 포함)'
    );
    
    if (createSuccess) {
      // 생성된 테이블 확인
      console.log('\n📊 생성된 테이블 확인...');
      const tableCheck = await pool.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'v2_%'
        ORDER BY tablename
      `);
      
      console.log('   생성된 V2 테이블:');
      tableCheck.rows.forEach(row => {
        console.log(`   - ${row.tablename}`);
      });
      
      console.log('\n✅ V2 테이블 생성 완료!');
      console.log('\n💡 사용 방법:');
      console.log('   1. 환경변수 설정: USE_V2_TABLES=true');
      console.log('   2. 또는 코드에서 직접 V2 메서드 사용');
      console.log('      예: dbService.getKeywordsV2()');
    } else {
      console.error('\n❌ V2 테이블 생성 실패');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔚 데이터베이스 연결 종료');
  }
}

// 스크립트 실행
if (require.main === module) {
  main().catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
}