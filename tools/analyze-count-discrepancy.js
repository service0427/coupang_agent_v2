/**
 * v1_keywords 테이블의 runs, succ, fail 카운트와 
 * v1_executions 테이블의 실제 실행 로그 비교 분석
 */

const dbService = require('../lib/services/db-service');

async function analyzeCountDiscrepancy() {
  console.log('📊 키워드 카운트와 실제 실행 로그 차이 분석');
  console.log('='.repeat(80));
  
  try {
    // 1. 키워드별 실제 실행 로그 집계
    const actualCountsQuery = `
      WITH execution_counts AS (
        SELECT 
          keyword_id,
          COUNT(*) as actual_runs,
          COUNT(CASE WHEN success = true THEN 1 END) as actual_success,
          COUNT(CASE WHEN success = false THEN 1 END) as actual_fail,
          COUNT(CASE WHEN success = true AND error IS NOT NULL THEN 1 END) as success_with_error,
          COUNT(CASE WHEN success = true AND (error LIKE '%ERR_HTTP2_PROTOCOL_ERROR%' OR error LIKE '%차단%' OR error LIKE '%timeout%') THEN 1 END) as blocked_but_success
        FROM v1_executions
        GROUP BY keyword_id
      )
      SELECT 
        k.id,
        k.keyword,
        k.runs as keyword_runs,
        k.succ as keyword_succ,
        k.fail as keyword_fail,
        COALESCE(e.actual_runs, 0) as actual_runs,
        COALESCE(e.actual_success, 0) as actual_success,
        COALESCE(e.actual_fail, 0) as actual_fail,
        COALESCE(e.success_with_error, 0) as success_with_error,
        COALESCE(e.blocked_but_success, 0) as blocked_but_success,
        (k.runs - COALESCE(e.actual_runs, 0)) as runs_diff,
        (k.succ - COALESCE(e.actual_success, 0)) as succ_diff,
        (k.fail - COALESCE(e.actual_fail, 0)) as fail_diff
      FROM v1_keywords k
      LEFT JOIN execution_counts e ON k.id = e.keyword_id
      WHERE k.runs > 0
      ORDER BY ABS(k.runs - COALESCE(e.actual_runs, 0)) DESC
    `;
    
    const result = await dbService.query(actualCountsQuery);
    
    console.log('\n📈 카운트 차이가 큰 키워드 TOP 10:');
    console.log('-'.repeat(120));
    console.log('ID  | 키워드                | K.runs | A.runs | 차이 | K.succ | A.succ | 차이 | K.fail | A.fail | 차이 | 차단성공 | 에러성공');
    console.log('-'.repeat(120));
    
    result.rows.slice(0, 10).forEach(row => {
      console.log(
        `${row.id.toString().padEnd(3)} | ` +
        `${row.keyword.padEnd(20)} | ` +
        `${row.keyword_runs.toString().padStart(6)} | ` +
        `${row.actual_runs.toString().padStart(6)} | ` +
        `${(row.runs_diff >= 0 ? '+' : '') + row.runs_diff.toString().padStart(4)} | ` +
        `${row.keyword_succ.toString().padStart(6)} | ` +
        `${row.actual_success.toString().padStart(6)} | ` +
        `${(row.succ_diff >= 0 ? '+' : '') + row.succ_diff.toString().padStart(4)} | ` +
        `${row.keyword_fail.toString().padStart(6)} | ` +
        `${row.actual_fail.toString().padStart(6)} | ` +
        `${(row.fail_diff >= 0 ? '+' : '') + row.fail_diff.toString().padStart(4)} | ` +
        `${row.blocked_but_success.toString().padStart(8)} | ` +
        `${row.success_with_error.toString().padStart(8)}`
      );
    });
    
    // 2. 차단/타임아웃 에러인데 성공으로 기록된 케이스 상세
    console.log('\n\n🚫 차단/타임아웃 에러인데 성공으로 기록된 케이스:');
    console.log('-'.repeat(100));
    
    const blockedSuccessQuery = `
      SELECT 
        e.id,
        e.keyword_id,
        k.keyword,
        e.executed,
        e.error,
        e.duration,
        e.url
      FROM v1_executions e
      JOIN v1_keywords k ON e.keyword_id = k.id
      WHERE e.success = true 
      AND e.error IS NOT NULL
      AND (
        e.error LIKE '%ERR_HTTP2_PROTOCOL_ERROR%' 
        OR e.error LIKE '%차단%' 
        OR e.error LIKE '%timeout%'
        OR e.error LIKE '%Timeout%'
        OR e.error LIKE '%blocked%'
      )
      ORDER BY e.executed DESC
      LIMIT 20
    `;
    
    const blockedResult = await dbService.query(blockedSuccessQuery);
    
    if (blockedResult.rows.length > 0) {
      console.log('실행ID | 키워드ID | 키워드               | 실행시간            | 에러메시지');
      console.log('-'.repeat(100));
      
      blockedResult.rows.forEach(row => {
        console.log(
          `${row.id.toString().padEnd(6)} | ` +
          `${row.keyword_id.toString().padEnd(8)} | ` +
          `${row.keyword.padEnd(20)} | ` +
          `${new Date(row.executed).toLocaleString('ko-KR')} | ` +
          `${row.error.substring(0, 50)}...`
        );
      });
    } else {
      console.log('차단/타임아웃 에러인데 성공으로 기록된 케이스가 없습니다.');
    }
    
    // 3. ID 31, 32번 상세 분석
    console.log('\n\n🔍 ID 31, 32번 키워드 상세 분석:');
    console.log('-'.repeat(80));
    
    const detailQuery = `
      SELECT 
        keyword_id,
        success,
        error,
        COUNT(*) as count,
        AVG(duration) as avg_duration,
        MAX(executed) as last_execution
      FROM v1_executions
      WHERE keyword_id IN (31, 32)
      GROUP BY keyword_id, success, error
      ORDER BY keyword_id, success DESC, count DESC
    `;
    
    const detailResult = await dbService.query(detailQuery);
    
    console.log('ID  | 성공여부 | 횟수 | 평균시간(ms) | 마지막실행          | 에러메시지');
    console.log('-'.repeat(80));
    
    detailResult.rows.forEach(row => {
      console.log(
        `${row.keyword_id.toString().padEnd(3)} | ` +
        `${(row.success ? '✅ 성공' : '❌ 실패').padEnd(8)} | ` +
        `${row.count.toString().padStart(4)} | ` +
        `${Math.round(row.avg_duration).toString().padStart(11)} | ` +
        `${new Date(row.last_execution).toLocaleString('ko-KR')} | ` +
        `${row.error || '정상'}`
      );
    });
    
    // 4. 전체 통계
    console.log('\n\n📊 전체 통계:');
    console.log('-'.repeat(60));
    
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT keyword_id) as total_keywords,
        SUM(CASE WHEN ABS(runs_diff) > 0 THEN 1 ELSE 0 END) as keywords_with_diff,
        SUM(ABS(runs_diff)) as total_runs_diff,
        SUM(ABS(succ_diff)) as total_succ_diff,
        SUM(ABS(fail_diff)) as total_fail_diff,
        SUM(blocked_but_success) as total_blocked_success,
        SUM(success_with_error) as total_success_with_error
      FROM (
        WITH execution_counts AS (
          SELECT 
            keyword_id,
            COUNT(*) as actual_runs,
            COUNT(CASE WHEN success = true THEN 1 END) as actual_success,
            COUNT(CASE WHEN success = false THEN 1 END) as actual_fail,
            COUNT(CASE WHEN success = true AND error IS NOT NULL THEN 1 END) as success_with_error,
            COUNT(CASE WHEN success = true AND (error LIKE '%ERR_HTTP2_PROTOCOL_ERROR%' OR error LIKE '%차단%' OR error LIKE '%timeout%') THEN 1 END) as blocked_but_success
          FROM v1_executions
          GROUP BY keyword_id
        )
        SELECT 
          k.id as keyword_id,
          (k.runs - COALESCE(e.actual_runs, 0)) as runs_diff,
          (k.succ - COALESCE(e.actual_success, 0)) as succ_diff,
          (k.fail - COALESCE(e.actual_fail, 0)) as fail_diff,
          COALESCE(e.blocked_but_success, 0) as blocked_but_success,
          COALESCE(e.success_with_error, 0) as success_with_error
        FROM v1_keywords k
        LEFT JOIN execution_counts e ON k.id = e.keyword_id
        WHERE k.runs > 0
      ) as diffs
    `;
    
    const summaryResult = await dbService.query(summaryQuery);
    const summary = summaryResult.rows[0];
    
    console.log(`총 키워드 수: ${summary.total_keywords}개`);
    console.log(`차이가 있는 키워드: ${summary.keywords_with_diff}개`);
    console.log(`총 실행횟수 차이: ${summary.total_runs_diff}회`);
    console.log(`총 성공횟수 차이: ${summary.total_succ_diff}회`);
    console.log(`총 실패횟수 차이: ${summary.total_fail_diff}회`);
    console.log(`차단되었지만 성공으로 기록: ${summary.total_blocked_success}회`);
    console.log(`에러가 있지만 성공으로 기록: ${summary.total_success_with_error}회`);
    
  } catch (error) {
    console.error('분석 중 오류:', error.message);
  } finally {
    await dbService.close();
  }
}

// 실행
analyzeCountDiscrepancy();