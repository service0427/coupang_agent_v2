/**
 * v1_keywords 테이블에 log_succ, log_fail 컬럼 추가 및 업데이트
 * 실제 실행 로그 기반으로 정확한 성공/실패 카운트 관리
 */

const dbService = require('../lib/services/db-service');

async function updateLogCounts() {
  console.log('📊 로그 기반 성공/실패 카운트 업데이트');
  console.log('='.repeat(80));
  
  try {
    // 1. log_succ, log_fail 컬럼 추가 (이미 있으면 무시)
    console.log('\n1️⃣ 컬럼 추가 중...');
    try {
      await dbService.query(`
        ALTER TABLE v1_keywords 
        ADD COLUMN IF NOT EXISTS log_succ INTEGER DEFAULT 0
      `);
      await dbService.query(`
        ALTER TABLE v1_keywords 
        ADD COLUMN IF NOT EXISTS log_fail INTEGER DEFAULT 0
      `);
      await dbService.query(`
        ALTER TABLE v1_keywords 
        ADD COLUMN IF NOT EXISTS log_runs INTEGER DEFAULT 0
      `);
      console.log('✅ 컬럼 추가 완료 (log_succ, log_fail, log_runs)');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  컬럼이 이미 존재합니다.');
      } else {
        throw error;
      }
    }
    
    // 2. 실제 로그 기반으로 카운트 업데이트
    console.log('\n2️⃣ 로그 기반 카운트 업데이트 중...');
    const updateQuery = `
      WITH log_counts AS (
        SELECT 
          keyword_id,
          COUNT(*) as total_runs,
          COUNT(CASE WHEN success = true THEN 1 END) as success_count,
          COUNT(CASE WHEN success = false THEN 1 END) as fail_count
        FROM v1_executions
        GROUP BY keyword_id
      )
      UPDATE v1_keywords k
      SET 
        log_runs = COALESCE(lc.total_runs, 0),
        log_succ = COALESCE(lc.success_count, 0),
        log_fail = COALESCE(lc.fail_count, 0)
      FROM log_counts lc
      WHERE k.id = lc.keyword_id
    `;
    
    await dbService.query(updateQuery);
    console.log('✅ 로그 기반 카운트 업데이트 완료');
    
    // 3. 비교 리포트 생성
    console.log('\n3️⃣ 비교 리포트 생성...');
    const compareQuery = `
      SELECT 
        id,
        keyword,
        runs,
        log_runs,
        (runs - log_runs) as runs_diff,
        succ,
        log_succ,
        (succ - log_succ) as succ_diff,
        fail,
        log_fail,
        (fail - log_fail) as fail_diff,
        CASE 
          WHEN log_runs > 0 THEN ROUND((log_succ::NUMERIC / log_runs) * 100, 2)
          ELSE 0 
        END as log_success_rate,
        CASE 
          WHEN runs > 0 THEN ROUND((succ::NUMERIC / runs) * 100, 2)
          ELSE 0 
        END as recorded_success_rate
      FROM v1_keywords
      WHERE runs > 0 OR log_runs > 0
      ORDER BY ABS(runs - log_runs) DESC
    `;
    
    const result = await dbService.query(compareQuery);
    
    // 큰 차이가 있는 키워드들
    console.log('\n📈 카운트 차이가 큰 키워드 TOP 20:');
    console.log('-'.repeat(150));
    console.log('ID   | 키워드                | runs → log | 차이  | succ → log | 차이  | fail → log | 차이  | 성공률(기록) | 성공률(로그)');
    console.log('-'.repeat(150));
    
    result.rows.slice(0, 20).forEach(row => {
      console.log(
        `${row.id.toString().padEnd(4)} | ` +
        `${row.keyword.padEnd(20)} | ` +
        `${row.runs.toString().padStart(4)} → ${row.log_runs.toString().padStart(3)} | ` +
        `${(row.runs_diff >= 0 ? '+' : '') + row.runs_diff.toString().padStart(5)} | ` +
        `${row.succ.toString().padStart(4)} → ${row.log_succ.toString().padStart(3)} | ` +
        `${(row.succ_diff >= 0 ? '+' : '') + row.succ_diff.toString().padStart(5)} | ` +
        `${row.fail.toString().padStart(4)} → ${row.log_fail.toString().padStart(3)} | ` +
        `${(row.fail_diff >= 0 ? '+' : '') + row.fail_diff.toString().padStart(5)} | ` +
        `${row.recorded_success_rate.toString().padStart(12)}% | ` +
        `${row.log_success_rate.toString().padStart(12)}%`
      );
    });
    
    // 4. 통계 요약
    console.log('\n\n📊 전체 통계 요약:');
    console.log('-'.repeat(80));
    
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_keywords,
        SUM(runs) as total_runs,
        SUM(log_runs) as total_log_runs,
        SUM(succ) as total_succ,
        SUM(log_succ) as total_log_succ,
        SUM(fail) as total_fail,
        SUM(log_fail) as total_log_fail,
        COUNT(CASE WHEN runs != log_runs THEN 1 END) as keywords_with_diff,
        COUNT(CASE WHEN runs > log_runs THEN 1 END) as keywords_runs_higher,
        COUNT(CASE WHEN runs < log_runs THEN 1 END) as keywords_runs_lower
      FROM v1_keywords
      WHERE runs > 0 OR log_runs > 0
    `;
    
    const summary = await dbService.query(summaryQuery);
    const s = summary.rows[0];
    
    console.log(`총 키워드 수: ${s.total_keywords}개`);
    console.log(`기록된 총 실행 수: ${s.total_runs}회`);
    console.log(`로그 기반 총 실행 수: ${s.total_log_runs}회`);
    console.log(`차이: ${s.total_runs - s.total_log_runs}회\n`);
    
    console.log(`기록된 총 성공 수: ${s.total_succ}회`);
    console.log(`로그 기반 총 성공 수: ${s.total_log_succ}회`);
    console.log(`차이: ${s.total_succ - s.total_log_succ}회\n`);
    
    console.log(`기록된 총 실패 수: ${s.total_fail}회`);
    console.log(`로그 기반 총 실패 수: ${s.total_log_fail}회`);
    console.log(`차이: ${s.total_fail - s.total_log_fail}회\n`);
    
    console.log(`차이가 있는 키워드: ${s.keywords_with_diff}개`);
    console.log(`기록이 로그보다 많은 키워드: ${s.keywords_runs_higher}개`);
    console.log(`로그가 기록보다 많은 키워드: ${s.keywords_runs_lower}개`);
    
    // 5. ID 31, 32번 상세 비교
    console.log('\n\n🔍 ID 31, 32번 상세 비교:');
    console.log('-'.repeat(100));
    
    const detailQuery = `
      SELECT 
        id,
        keyword,
        runs,
        log_runs,
        succ,
        log_succ,
        fail,
        log_fail,
        CASE 
          WHEN runs > 0 THEN ROUND((succ::NUMERIC / runs) * 100, 2)
          ELSE 0 
        END as recorded_success_rate,
        CASE 
          WHEN log_runs > 0 THEN ROUND((log_succ::NUMERIC / log_runs) * 100, 2)
          ELSE 0 
        END as log_success_rate
      FROM v1_keywords
      WHERE id IN (31, 32)
    `;
    
    const detailResult = await dbService.query(detailQuery);
    
    console.log('ID  | 키워드                | runs(기록/로그) | succ(기록/로그) | fail(기록/로그) | 성공률(기록/로그)');
    console.log('-'.repeat(100));
    
    detailResult.rows.forEach(row => {
      console.log(
        `${row.id.toString().padEnd(3)} | ` +
        `${row.keyword.padEnd(20)} | ` +
        `${row.runs.toString().padStart(4)}/${row.log_runs.toString().padEnd(4)} | ` +
        `${row.succ.toString().padStart(4)}/${row.log_succ.toString().padEnd(4)} | ` +
        `${row.fail.toString().padStart(4)}/${row.log_fail.toString().padEnd(4)} | ` +
        `${row.recorded_success_rate.toString().padStart(6)}%/${row.log_success_rate.toString().padEnd(6)}%`
      );
    });
    
    // 6. 로그가 더 많은 키워드 (새로운 실행이 있었음)
    console.log('\n\n🆕 최근 실행이 있었던 키워드 (로그 > 기록):');
    console.log('-'.repeat(120));
    
    const recentQuery = `
      SELECT 
        k.id,
        k.keyword,
        k.runs,
        k.log_runs,
        (k.log_runs - k.runs) as new_runs,
        k.succ,
        k.log_succ,
        (k.log_succ - k.succ) as new_succ,
        k.fail,
        k.log_fail,
        (k.log_fail - k.fail) as new_fail,
        MAX(e.executed) as last_execution
      FROM v1_keywords k
      LEFT JOIN v1_executions e ON k.id = e.keyword_id
      WHERE k.log_runs > k.runs
      GROUP BY k.id, k.keyword, k.runs, k.log_runs, k.succ, k.log_succ, k.fail, k.log_fail
      ORDER BY k.log_runs - k.runs DESC
      LIMIT 10
    `;
    
    const recentResult = await dbService.query(recentQuery);
    
    if (recentResult.rows.length > 0) {
      console.log('ID  | 키워드                | 새 실행 | 새 성공 | 새 실패 | 마지막 실행');
      console.log('-'.repeat(120));
      
      recentResult.rows.forEach(row => {
        console.log(
          `${row.id.toString().padEnd(3)} | ` +
          `${row.keyword.padEnd(20)} | ` +
          `${row.new_runs.toString().padStart(7)} | ` +
          `${row.new_succ.toString().padStart(7)} | ` +
          `${row.new_fail.toString().padStart(7)} | ` +
          `${new Date(row.last_execution).toLocaleString('ko-KR')}`
        );
      });
    }
    
  } catch (error) {
    console.error('오류 발생:', error.message);
    console.error(error.stack);
  } finally {
    await dbService.close();
  }
}

// 실행
updateLogCounts();