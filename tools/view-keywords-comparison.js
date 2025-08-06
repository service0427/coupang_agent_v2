/**
 * v1_keywords의 기록된 카운트와 로그 기반 카운트를 비교 시각화
 */

const dbService = require('../lib/services/db-service');

async function viewKeywordsComparison(options = {}) {
  const { 
    limit = 30, 
    orderBy = 'diff',  // diff, id, success_rate_diff
    showOnlyDiff = false,
    keywordIds = null 
  } = options;
  
  console.log('📊 키워드 성공/실패 카운트 비교 (기록 vs 로그)');
  console.log('='.repeat(150));
  
  try {
    // 정렬 기준 설정
    let orderClause;
    switch(orderBy) {
      case 'id':
        orderClause = 'id';
        break;
      case 'success_rate_diff':
        orderClause = 'ABS(recorded_success_rate - log_success_rate) DESC';
        break;
      case 'diff':
      default:
        orderClause = 'ABS(runs - log_runs) DESC';
    }
    
    // WHERE 절 구성
    let whereClause = 'WHERE (runs > 0 OR log_runs > 0)';
    const params = [];
    
    if (showOnlyDiff) {
      whereClause += ' AND (runs != log_runs OR succ != log_succ OR fail != log_fail)';
    }
    
    if (keywordIds) {
      whereClause += ` AND id = ANY($${params.length + 1})`;
      params.push(keywordIds);
    }
    
    const query = `
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
        END as log_success_rate,
        ABS(runs - log_runs) as runs_diff,
        ABS(succ - log_succ) as succ_diff,
        ABS(fail - log_fail) as fail_diff
      FROM v1_keywords
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ${limit}
    `;
    
    const result = await dbService.query(query, params);
    
    // 헤더 출력
    console.log('\n' + '─'.repeat(150));
    console.log(
      'ID'.padEnd(5) + '| ' +
      '키워드'.padEnd(30) + '| ' +
      'RUNS'.padEnd(15) + '| ' +
      'SUCCESS'.padEnd(15) + '| ' +
      'FAIL'.padEnd(15) + '| ' +
      '성공률'.padEnd(15) + '| ' +
      '차이'
    );
    console.log(
      ' '.padEnd(5) + '| ' +
      ' '.padEnd(30) + '| ' +
      '기록 → 로그'.padEnd(15) + '| ' +
      '기록 → 로그'.padEnd(15) + '| ' +
      '기록 → 로그'.padEnd(15) + '| ' +
      '기록 → 로그'.padEnd(15) + '| ' +
      'R/S/F'
    );
    console.log('─'.repeat(150));
    
    // 데이터 출력
    result.rows.forEach(row => {
      // 차이가 있는 항목은 색상으로 표시 (콘솔에서는 이모지로 대체)
      const runsDiffIcon = row.runs !== row.log_runs ? '⚠️' : '✅';
      const succDiffIcon = row.succ !== row.log_succ ? '⚠️' : '✅';
      const failDiffIcon = row.fail !== row.log_fail ? '⚠️' : '✅';
      const rateDiffIcon = Math.abs(row.recorded_success_rate - row.log_success_rate) > 5 ? '📊' : '✅';
      
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        row.keyword.substring(0, 28).padEnd(30) + '| ' +
        `${row.runs.toString().padStart(4)} → ${row.log_runs.toString().padStart(4)} ${runsDiffIcon}`.padEnd(17) + '| ' +
        `${row.succ.toString().padStart(4)} → ${row.log_succ.toString().padStart(4)} ${succDiffIcon}`.padEnd(17) + '| ' +
        `${row.fail.toString().padStart(4)} → ${row.log_fail.toString().padStart(4)} ${failDiffIcon}`.padEnd(17) + '| ' +
        `${parseFloat(row.recorded_success_rate).toFixed(1).padStart(5)}% → ${parseFloat(row.log_success_rate).toFixed(1).padStart(5)}% ${rateDiffIcon}`.padEnd(17) + '| ' +
        `${row.runs_diff}/${row.succ_diff}/${row.fail_diff}`
      );
    });
    
    console.log('─'.repeat(150));
    
    // 범례
    console.log('\n📖 범례:');
    console.log('  ✅ = 일치, ⚠️ = 불일치, 📊 = 성공률 5% 이상 차이');
    console.log('  차이 = R(runs)/S(success)/F(fail) 차이값');
    
    // 요약 통계
    console.log('\n📊 요약 통계:');
    const summaryQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN runs = log_runs AND succ = log_succ AND fail = log_fail THEN 1 END) as perfect_match,
        COUNT(CASE WHEN runs != log_runs THEN 1 END) as runs_mismatch,
        COUNT(CASE WHEN succ != log_succ THEN 1 END) as succ_mismatch,
        COUNT(CASE WHEN fail != log_fail THEN 1 END) as fail_mismatch,
        AVG(ABS(
          CASE WHEN runs > 0 THEN (succ::NUMERIC / runs) * 100 ELSE 0 END -
          CASE WHEN log_runs > 0 THEN (log_succ::NUMERIC / log_runs) * 100 ELSE 0 END
        )) as avg_success_rate_diff
      FROM v1_keywords
      WHERE runs > 0 OR log_runs > 0
    `;
    
    const summary = await dbService.query(summaryQuery);
    const s = summary.rows[0];
    
    console.log(`  전체 키워드: ${s.total}개`);
    console.log(`  완전 일치: ${s.perfect_match}개 (${(s.perfect_match / s.total * 100).toFixed(1)}%)`);
    console.log(`  runs 불일치: ${s.runs_mismatch}개`);
    console.log(`  succ 불일치: ${s.succ_mismatch}개`);
    console.log(`  fail 불일치: ${s.fail_mismatch}개`);
    console.log(`  평균 성공률 차이: ${parseFloat(s.avg_success_rate_diff).toFixed(2)}%`);
    
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
  if (arg === '--limit' && args[index + 1]) {
    options.limit = parseInt(args[index + 1]);
  } else if (arg === '--order' && args[index + 1]) {
    options.orderBy = args[index + 1];
  } else if (arg === '--diff-only') {
    options.showOnlyDiff = true;
  } else if (arg === '--id' && args[index + 1]) {
    options.keywordIds = [parseInt(args[index + 1])];
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node view-keywords-comparison.js [옵션]

옵션:
  --limit <숫자>     표시할 키워드 수 (기본: 30)
  --order <기준>     정렬 기준: diff(기본), id, success_rate_diff
  --diff-only        차이가 있는 항목만 표시
  --id <키워드ID>    특정 키워드만 표시
  --help            도움말 표시

예시:
  node view-keywords-comparison.js --limit 50 --order success_rate_diff
  node view-keywords-comparison.js --diff-only
  node view-keywords-comparison.js --id 31
`);
  process.exit(0);
}

// 실행
viewKeywordsComparison(options);