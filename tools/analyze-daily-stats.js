/**
 * 일별 통계 분석 도구
 * - 특정 날짜의 실행 통계만 분석
 * - 기록값 vs 실제 로그 비교
 * - IP 중복 및 오차 원인 파악
 */

const dbService = require('../lib/services/db-service');

async function analyzeDailyStats(options = {}) {
  const {
    date = 'yesterday',  // yesterday, today, 또는 YYYY-MM-DD
    keywordId = null
  } = options;

  // 날짜 설정
  let dateCondition;
  let dateDisplay;
  
  if (date === 'yesterday') {
    dateCondition = "DATE(executed) = CURRENT_DATE - INTERVAL '1 day'";
    dateDisplay = '어제';
  } else if (date === 'today') {
    dateCondition = "DATE(executed) = CURRENT_DATE";
    dateDisplay = '오늘';
  } else {
    dateCondition = `DATE(executed) = '${date}'`;
    dateDisplay = date;
  }

  console.log(`📊 ${dateDisplay} 일일 통계 분석`);
  console.log('='.repeat(150));

  try {
    // 1. 전체 요약 통계
    console.log('\n📈 전체 실행 요약:');
    console.log('─'.repeat(120));
    
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_executions,
        COUNT(DISTINCT keyword_id) as active_keywords,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as total_success,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as total_fail,
        SUM(CASE WHEN cart THEN 1 ELSE 0 END) as total_cart,
        SUM(CASE WHEN found THEN 1 ELSE 0 END) as total_found,
        ROUND(AVG(CASE WHEN success THEN 100 ELSE 0 END), 2) as success_rate,
        ROUND(AVG(CASE WHEN cart AND success THEN 100 ELSE 0 END), 2) as cart_rate,
        ROUND(AVG(duration)/1000.0, 2) as avg_duration_sec,
        COUNT(DISTINCT ip) as unique_ips,
        ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT ip), 0), 2) as ip_reuse_ratio
      FROM v1_executions
      WHERE ${dateCondition}
        ${keywordId ? `AND keyword_id = ${keywordId}` : ''}
    `;
    
    const summary = await dbService.query(summaryQuery);
    const s = summary.rows[0];
    
    if (!s || s.total_executions === 0) {
      console.log(`${dateDisplay}에 실행된 데이터가 없습니다.`);
      await dbService.close();
      return;
    }
    
    console.log(`  총 실행: ${s.total_executions}회`);
    console.log(`  활성 키워드: ${s.active_keywords}개`);
    console.log(`  성공: ${s.total_success}회 (${s.success_rate}%)`);
    console.log(`  실패: ${s.total_fail}회`);
    console.log(`  상품 발견: ${s.total_found}회`);
    console.log(`  장바구니: ${s.total_cart}회 (${s.cart_rate}%)`);
    console.log(`  평균 실행시간: ${s.avg_duration_sec}초`);
    console.log(`  고유 IP: ${s.unique_ips}개 (재사용 비율 ${s.ip_reuse_ratio}:1)`);

    // 2. 키워드별 상세 통계 (기록값 vs 실제)
    console.log('\n📋 키워드별 상세 통계 (기록 vs 실제):');
    console.log('─'.repeat(150));
    
    const keywordStatsQuery = `
      WITH daily_stats AS (
        SELECT 
          k.id,
          k.keyword,
          k.code,
          k.runs as recorded_runs,
          k.succ as recorded_succ,
          k.fail as recorded_fail,
          
          COUNT(e.id) as actual_runs,
          SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as actual_succ,
          SUM(CASE WHEN NOT e.success THEN 1 ELSE 0 END) as actual_fail,
          SUM(CASE WHEN e.cart THEN 1 ELSE 0 END) as actual_cart,
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as actual_found,
          
          AVG(e.rank) as avg_rank,
          AVG(e.pages) as avg_pages,
          COUNT(DISTINCT e.ip) as unique_ips,
          
          -- 오차 계산
          ABS(k.runs - COUNT(e.id)) as run_diff,
          ABS(k.succ - SUM(CASE WHEN e.success THEN 1 ELSE 0 END)) as succ_diff,
          ABS(k.fail - SUM(CASE WHEN NOT e.success THEN 1 ELSE 0 END)) as fail_diff
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        ${keywordId ? `WHERE k.id = ${keywordId}` : ''}
        GROUP BY k.id, k.keyword, k.code, k.runs, k.succ, k.fail
        HAVING COUNT(e.id) > 0
      )
      SELECT * FROM daily_stats
      ORDER BY actual_runs DESC
    `;
    
    const keywordStats = await dbService.query(keywordStatsQuery);
    
    console.log(
      'ID'.padEnd(5) + '| ' +
      '키워드'.padEnd(25) + '| ' +
      'Runs(기록→실제)'.padEnd(18) + '| ' +
      'Succ(기록→실제)'.padEnd(18) + '| ' +
      'Fail(기록→실제)'.padEnd(18) + '| ' +
      '장바구니'.padEnd(10) + '| ' +
      '평균순위'.padEnd(10) + '| ' +
      'IP수'
    );
    console.log('─'.repeat(150));
    
    keywordStats.rows.forEach(row => {
      const runMatch = row.run_diff === 0 ? '✅' : row.run_diff > 10 ? '🔴' : '🟡';
      const succMatch = row.succ_diff === 0 ? '✅' : row.succ_diff > 10 ? '🔴' : '🟡';
      const failMatch = row.fail_diff === 0 ? '✅' : row.fail_diff > 10 ? '🔴' : '🟡';
      
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        row.keyword.substring(0, 23).padEnd(25) + '| ' +
        `${row.recorded_runs}→${row.actual_runs}${runMatch}`.padEnd(20) + '| ' +
        `${row.recorded_succ}→${row.actual_succ}${succMatch}`.padEnd(20) + '| ' +
        `${row.recorded_fail}→${row.actual_fail}${failMatch}`.padEnd(20) + '| ' +
        row.actual_cart.toString().padEnd(10) + '| ' +
        (row.avg_rank ? `#${parseFloat(row.avg_rank).toFixed(1)}` : 'N/A').padEnd(10) + '| ' +
        row.unique_ips
      );
    });

    // 3. 시간대별 실행 패턴
    console.log('\n⏰ 시간대별 실행 패턴:');
    console.log('─'.repeat(120));
    
    const hourlyQuery = `
      SELECT 
        EXTRACT(HOUR FROM executed) as hour,
        COUNT(*) as executions,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN cart THEN 1 ELSE 0 END) as cart,
        ROUND(AVG(CASE WHEN success THEN 100 ELSE 0 END), 2) as success_rate,
        COUNT(DISTINCT ip) as unique_ips
      FROM v1_executions
      WHERE ${dateCondition}
        ${keywordId ? `AND keyword_id = ${keywordId}` : ''}
      GROUP BY hour
      ORDER BY hour
    `;
    
    const hourlyStats = await dbService.query(hourlyQuery);
    
    console.log(
      '시간'.padEnd(8) + '| ' +
      '실행'.padEnd(6) + '| ' +
      '성공'.padEnd(6) + '| ' +
      '장바구니'.padEnd(10) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      'IP수'.padEnd(6) + '| ' +
      '그래프'
    );
    console.log('─'.repeat(120));
    
    const maxExec = Math.max(...hourlyStats.rows.map(r => r.executions));
    
    hourlyStats.rows.forEach(row => {
      const bar = '█'.repeat(Math.round((row.executions / maxExec) * 30));
      
      console.log(
        `${row.hour.toString().padStart(2, '0')}:00`.padEnd(8) + '| ' +
        row.executions.toString().padEnd(6) + '| ' +
        row.success.toString().padEnd(6) + '| ' +
        row.cart.toString().padEnd(10) + '| ' +
        `${row.success_rate}%`.padEnd(8) + '| ' +
        row.unique_ips.toString().padEnd(6) + '| ' +
        bar
      );
    });

    // 4. IP 중복 TOP 10
    console.log('\n🌐 IP 중복 사용 TOP 10:');
    console.log('─'.repeat(120));
    
    const ipDuplicationQuery = `
      SELECT 
        ip,
        COUNT(*) as use_count,
        COUNT(DISTINCT keyword_id) as keywords,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success,
        ROUND(AVG(CASE WHEN success THEN 100 ELSE 0 END), 2) as success_rate,
        STRING_AGG(DISTINCT proxy, ', ') as proxies
      FROM v1_executions
      WHERE ${dateCondition}
        AND ip IS NOT NULL
        ${keywordId ? `AND keyword_id = ${keywordId}` : ''}
      GROUP BY ip
      HAVING COUNT(*) > 1
      ORDER BY use_count DESC
      LIMIT 10
    `;
    
    const ipDuplication = await dbService.query(ipDuplicationQuery);
    
    if (ipDuplication.rows.length > 0) {
      console.log(
        'IP'.padEnd(17) + '| ' +
        '사용수'.padEnd(8) + '| ' +
        '키워드'.padEnd(8) + '| ' +
        '성공'.padEnd(6) + '| ' +
        '성공률'.padEnd(8) + '| ' +
        '프록시'
      );
      console.log('─'.repeat(120));
      
      ipDuplication.rows.forEach(row => {
        const riskIcon = row.use_count > 50 ? '🔴' : row.use_count > 20 ? '🟡' : '🟢';
        
        console.log(
          row.ip.substring(0, 15).padEnd(17) + '| ' +
          `${riskIcon}${row.use_count}`.padEnd(10) + '| ' +
          row.keywords.toString().padEnd(8) + '| ' +
          row.success.toString().padEnd(6) + '| ' +
          `${row.success_rate}%`.padEnd(8) + '| ' +
          (row.proxies || 'Direct').substring(0, 40)
        );
      });
    }

    // 5. 오차 분석 요약
    console.log('\n🔍 오차 분석 요약:');
    console.log('─'.repeat(120));
    
    const errorSummaryQuery = `
      WITH error_summary AS (
        SELECT 
          COUNT(DISTINCT k.id) as total_keywords,
          SUM(CASE WHEN ABS(k.runs - COALESCE(e.actual_runs, 0)) > 0 THEN 1 ELSE 0 END) as run_mismatch,
          SUM(CASE WHEN ABS(k.succ - COALESCE(e.actual_succ, 0)) > 0 THEN 1 ELSE 0 END) as succ_mismatch,
          SUM(CASE WHEN ABS(k.fail - COALESCE(e.actual_fail, 0)) > 0 THEN 1 ELSE 0 END) as fail_mismatch,
          SUM(ABS(k.runs - COALESCE(e.actual_runs, 0))) as total_run_diff,
          SUM(ABS(k.succ - COALESCE(e.actual_succ, 0))) as total_succ_diff,
          SUM(ABS(k.fail - COALESCE(e.actual_fail, 0))) as total_fail_diff
        FROM v1_keywords k
        LEFT JOIN (
          SELECT 
            keyword_id,
            COUNT(*) as actual_runs,
            SUM(CASE WHEN success THEN 1 ELSE 0 END) as actual_succ,
            SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as actual_fail
          FROM v1_executions
          WHERE ${dateCondition}
          GROUP BY keyword_id
        ) e ON k.id = e.keyword_id
        ${keywordId ? `WHERE k.id = ${keywordId}` : ''}
      )
      SELECT * FROM error_summary
    `;
    
    const errorSummary = await dbService.query(errorSummaryQuery);
    const es = errorSummary.rows[0];
    
    console.log(`  분석 키워드 수: ${es.total_keywords}개`);
    console.log(`  Runs 불일치: ${es.run_mismatch}개 키워드 (총 ${es.total_run_diff}건 차이)`);
    console.log(`  Succ 불일치: ${es.succ_mismatch}개 키워드 (총 ${es.total_succ_diff}건 차이)`);
    console.log(`  Fail 불일치: ${es.fail_mismatch}개 키워드 (총 ${es.total_fail_diff}건 차이)`);
    
    // 주요 오차 원인
    if (es.total_run_diff > 0 || es.total_succ_diff > 0) {
      console.log('\n  추정 오차 원인:');
      
      if (s.ip_reuse_ratio > 10) {
        console.log(`    - IP 과도 재사용 (평균 ${s.ip_reuse_ratio}:1)`);
      }
      
      if (es.run_mismatch > es.total_keywords * 0.5) {
        console.log(`    - 데이터 동기화 문제 (${Math.round(es.run_mismatch/es.total_keywords*100)}% 키워드 불일치)`);
      }
      
      const errorRate = (s.total_fail / s.total_executions) * 100;
      if (errorRate > 30) {
        console.log(`    - 높은 에러율 (${errorRate.toFixed(1)}%)`);
      }
    }

    // 6. 에러 유형 분석
    console.log('\n❌ 에러 유형 분석:');
    console.log('─'.repeat(120));
    
    const errorTypeQuery = `
      SELECT 
        CASE 
          WHEN error LIKE '%timeout%' THEN 'Timeout'
          WHEN error LIKE '%selector%' THEN 'Selector Not Found'
          WHEN error LIKE '%network%' THEN 'Network Error'
          WHEN error LIKE '%navigation%' THEN 'Navigation Failed'
          WHEN error IS NOT NULL AND error != '' THEN 'Other'
          ELSE 'No Error'
        END as error_type,
        COUNT(*) as count,
        COUNT(DISTINCT keyword_id) as affected_keywords
      FROM v1_executions
      WHERE ${dateCondition}
        ${keywordId ? `AND keyword_id = ${keywordId}` : ''}
      GROUP BY error_type
      ORDER BY count DESC
    `;
    
    const errorTypes = await dbService.query(errorTypeQuery);
    
    errorTypes.rows.forEach(row => {
      if (row.error_type !== 'No Error') {
        console.log(`  ${row.error_type}: ${row.count}건 (${row.affected_keywords}개 키워드 영향)`);
      }
    });
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 옵션 처리
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--date' && args[index + 1]) {
    options.date = args[index + 1];
  } else if (arg === '--keyword' && args[index + 1]) {
    options.keywordId = parseInt(args[index + 1]);
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-daily-stats.js [옵션]

옵션:
  --date <날짜>     분석할 날짜 (yesterday, today, YYYY-MM-DD)
                   기본값: yesterday
  --keyword <ID>   특정 키워드만 분석
  --help          도움말 표시

예시:
  node analyze-daily-stats.js                    # 어제 통계
  node analyze-daily-stats.js --date today       # 오늘 통계
  node analyze-daily-stats.js --date 2025-08-05  # 특정 날짜
  node analyze-daily-stats.js --keyword 31       # 특정 키워드만
`);
  process.exit(0);
}

// 실행
analyzeDailyStats(options);