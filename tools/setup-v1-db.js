/**
 * v1 데이터베이스 설정 스크립트
 * - 기존 v1 테이블 삭제
 * - 새로운 v1 테이블 생성
 * - v2에서 v1로 데이터 마이그레이션
 * - browser 컬럼 제거
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const dbConfig = {
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'coupang_test',
  user: 'techb_pp',
  password: 'Tech1324!'
};

async function runSQLFile(client, filename, description) {
  try {
    console.log(`\n📄 ${description}...`);
    const sqlPath = path.join(__dirname, '..', 'sql', filename);
    const sql = await fs.readFile(sqlPath, 'utf8');
    
    // SQL 파일을 개별 명령으로 분리 (세미콜론 기준)
    const commands = sql
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    for (const command of commands) {
      try {
        await client.query(command);
      } catch (error) {
        // SELECT 문의 경우 결과를 출력
        if (command.toUpperCase().trim().startsWith('SELECT')) {
          if (error.code === '42P01') { // 테이블이 존재하지 않음
            console.log(`   ⚠️ 테이블이 존재하지 않음`);
          } else {
            const result = await client.query(command);
            console.table(result.rows);
          }
        } else {
          console.log(`   ❌ 오류: ${error.message}`);
        }
      }
    }
    
    console.log(`   ✅ 완료`);
  } catch (error) {
    console.error(`   ❌ 파일 읽기 오류: ${error.message}`);
    throw error;
  }
}

async function setupDatabase() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스 연결 성공\n');
    
    // 1. 기존 v1 테이블 삭제
    console.log('═══════════════════════════════════════');
    console.log('1단계: 기존 v1 테이블 삭제');
    console.log('═══════════════════════════════════════');
    await runSQLFile(client, 'drop_old_v1_tables.sql', '기존 v1 테이블 삭제');
    
    // 2. 새로운 v1 테이블 생성
    console.log('\n═══════════════════════════════════════');
    console.log('2단계: 새로운 v1 테이블 생성');
    console.log('═══════════════════════════════════════');
    await runSQLFile(client, 'v1_create_tables_new.sql', '새로운 v1 테이블 생성');
    
    // 3. v2에서 v1로 데이터 마이그레이션
    console.log('\n═══════════════════════════════════════');
    console.log('3단계: v2 → v1 데이터 마이그레이션');
    console.log('═══════════════════════════════════════');
    await runSQLFile(client, 'migrate_v2_to_v1.sql', 'v2에서 v1로 데이터 마이그레이션');
    
    // 4. browser 컬럼 제거
    console.log('\n═══════════════════════════════════════');
    console.log('4단계: browser 컬럼 제거');
    console.log('═══════════════════════════════════════');
    await runSQLFile(client, 'remove_browser_column.sql', 'v2_error_logs에서 browser 컬럼 제거');
    
    // 5. 결과 확인
    console.log('\n═══════════════════════════════════════');
    console.log('5단계: 설정 결과 확인');
    console.log('═══════════════════════════════════════');
    
    // v1 테이블 데이터 건수 확인
    const countQueries = [
      { table: 'v1_keywords', query: 'SELECT COUNT(*) as count FROM v1_keywords' },
      { table: 'v1_executions', query: 'SELECT COUNT(*) as count FROM v1_executions' },
      { table: 'v1_errors', query: 'SELECT COUNT(*) as count FROM v1_errors' }
    ];
    
    console.log('\n📊 v1 테이블 데이터 건수:');
    for (const q of countQueries) {
      try {
        const result = await client.query(q.query);
        console.log(`   ${q.table}: ${result.rows[0].count}건`);
      } catch (error) {
        console.log(`   ${q.table}: 오류 - ${error.message}`);
      }
    }
    
    // v1_keywords 샘플 데이터 확인
    console.log('\n📋 v1_keywords 샘플 데이터 (최근 5건):');
    try {
      const sampleResult = await client.query(`
        SELECT id, keyword, code, agent, cart, userdata, session, cache, gpu, optimize
        FROM v1_keywords
        ORDER BY id DESC
        LIMIT 5
      `);
      console.table(sampleResult.rows);
    } catch (error) {
      console.log(`   오류: ${error.message}`);
    }
    
    console.log('\n✅ 데이터베이스 설정 완료!');
    
  } catch (error) {
    console.error('❌ 데이터베이스 설정 실패:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// 실행
setupDatabase();