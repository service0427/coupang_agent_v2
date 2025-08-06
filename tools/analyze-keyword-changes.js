/**
 * 키워드 변경 이력 및 영향 분석
 * 검색어 변경이 통계에 미친 영향 파악
 */

const dbService = require('../lib/services/db-service');

async function analyzeKeywordChanges(options = {}) {
  const {
    startId = 31,
    endId = 71
  } = options;

  console.log(`🔄 키워드 변경 이력 분석 (ID ${startId}~${endId})`);
  console.log('='.repeat(150));

  try {
    // 1. 실행 로그의 query 필드와 키워드 비교
    console.log('\n📊 키워드와 실제 검색어(query) 불일치 분석:');
    console.log('─'.repeat(150));
    
    const queryMismatchQuery = `
      WITH keyword_queries AS (
        SELECT 
          k.id,
          k.keyword,
          k.code,
          e.query,
          e.executed,
          e.success,
          e.found,
          -- 키워드와 query 비교
          CASE 
            WHEN e.query IS NULL THEN 'NULL'
            WHEN e.query = k.keyword THEN '일치'
            WHEN e.query LIKE '%' || k.code || '%' THEN '코드 포함'
            WHEN k.keyword LIKE '%' || e.query || '%' THEN '부분 일치'
            ELSE '불일치'
          END as match_status,
          -- 키워드에서 실제 검색어 추출 ([] 뒤 부분)
          CASE 
            WHEN k.keyword ~ '\\[.*\\]' 
            THEN TRIM(SUBSTRING(k.keyword FROM '\\]\\s*(.*)$'))
            ELSE k.keyword
          END as extracted_keyword
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        WHERE k.id BETWEEN $1 AND $2
          AND e.id IS NOT NULL
      )
      SELECT 
        id,
        keyword,
        code,
        COUNT(*) as total_executions,
        COUNT(DISTINCT query) as unique_queries,
        SUM(CASE WHEN match_status = '일치' THEN 1 ELSE 0 END) as exact_matches,
        SUM(CASE WHEN match_status = '불일치' THEN 1 ELSE 0 END) as mismatches,
        SUM(CASE WHEN match_status = 'NULL' THEN 1 ELSE 0 END) as null_queries,
        -- 성공률 by match status
        AVG(CASE WHEN match_status = '일치' AND success THEN 100.0 ELSE 0 END) as match_success_rate,
        AVG(CASE WHEN match_status != '일치' AND success THEN 100.0 ELSE 0 END) as mismatch_success_rate,
        -- 다양한 query 리스트
        STRING_AGG(DISTINCT query, ' | ' ORDER BY query) as query_variations
      FROM keyword_queries
      GROUP BY id, keyword, code
      HAVING COUNT(DISTINCT query) > 1 OR SUM(CASE WHEN match_status = '불일치' THEN 1 ELSE 0 END) > 0
      ORDER BY unique_queries DESC, id
    `;
    
    const queryMismatches = await dbService.query(queryMismatchQuery, [startId, endId]);
    
    if (queryMismatches.rows.length > 0) {
      console.log('검색어 변경이 감지된 키워드:');
      console.log(
        'ID'.padEnd(5) + '| ' +
        '키워드'.padEnd(35) + '| ' +
        '실행'.padEnd(6) + '| ' +
        'Query수'.padEnd(8) + '| ' +
        '불일치'.padEnd(8) + '| ' +
        '성공률(일치/불일치)'
      );
      console.log('─'.repeat(150));
      
      queryMismatches.rows.forEach(row => {
        console.log(
          row.id.toString().padEnd(5) + '| ' +
          row.keyword.substring(0, 33).padEnd(35) + '| ' +
          row.total_executions.toString().padEnd(6) + '| ' +
          row.unique_queries.toString().padEnd(8) + '| ' +
          row.mismatches.toString().padEnd(8) + '| ' +
          `${parseFloat(row.match_success_rate).toFixed(1)}% / ${parseFloat(row.mismatch_success_rate).toFixed(1)}%`
        );
        
        if (row.query_variations && row.query_variations.length > 0) {
          console.log('       사용된 검색어: ' + row.query_variations.substring(0, 100));
        }
      });
    } else {
      console.log('  검색어 변경이 감지되지 않았습니다.');
    }

    // 2. 시간대별 키워드 변경 패턴
    console.log('\n⏰ 시간대별 검색어 사용 패턴:');
    console.log('─'.repeat(150));
    
    const timePatternQuery = `
      SELECT 
        k.id,
        k.keyword,
        DATE(e.executed) as exec_date,
        EXTRACT(HOUR FROM e.executed) as exec_hour,
        e.query,
        COUNT(*) as count,
        AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
        AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as found_rate
      FROM v1_keywords k
      JOIN v1_executions e ON k.id = e.keyword_id
      WHERE k.id BETWEEN $1 AND $2
        AND e.query IS NOT NULL
      GROUP BY k.id, k.keyword, exec_date, exec_hour, e.query
      HAVING COUNT(*) > 1
      ORDER BY k.id, exec_date, exec_hour
    `;
    
    const timePatterns = await dbService.query(timePatternQuery, [startId, endId]);
    
    if (timePatterns.rows.length > 0) {
      let currentId = null;
      timePatterns.rows.forEach(row => {
        if (row.id !== currentId) {
          currentId = row.id;
          console.log(`\n📌 ID ${row.id}: ${row.keyword.substring(0, 40)}`);
        }
        console.log(
          `   ${row.exec_date.toLocaleDateString('ko-KR')} ${row.exec_hour.toString().padStart(2, '0')}시 | ` +
          `"${row.query?.substring(0, 30) || 'NULL'}" | ` +
          `${row.count}회 | ` +
          `성공 ${parseFloat(row.success_rate).toFixed(0)}% | ` +
          `발견 ${parseFloat(row.found_rate).toFixed(0)}%`
        );
      });
    }

    // 3. Query NULL 값 분석
    console.log('\n❓ Query NULL 값 분석:');
    console.log('─'.repeat(150));
    
    const nullQueryQuery = `
      SELECT 
        k.id,
        k.keyword,
        COUNT(e.id) as total_execs,
        SUM(CASE WHEN e.query IS NULL THEN 1 ELSE 0 END) as null_queries,
        SUM(CASE WHEN e.query = '' THEN 1 ELSE 0 END) as empty_queries,
        SUM(CASE WHEN e.query IS NOT NULL AND e.query != '' THEN 1 ELSE 0 END) as valid_queries,
        -- NULL query의 성공률
        AVG(CASE WHEN e.query IS NULL AND e.success THEN 100.0 
                 WHEN e.query IS NULL THEN 0.0 
                 ELSE NULL END) as null_success_rate,
        -- Valid query의 성공률
        AVG(CASE WHEN e.query IS NOT NULL AND e.query != '' AND e.success THEN 100.0 
                 WHEN e.query IS NOT NULL AND e.query != '' THEN 0.0 
                 ELSE NULL END) as valid_success_rate
      FROM v1_keywords k
      LEFT JOIN v1_executions e ON k.id = e.keyword_id
      WHERE k.id BETWEEN $1 AND $2
      GROUP BY k.id, k.keyword
      HAVING SUM(CASE WHEN e.query IS NULL OR e.query = '' THEN 1 ELSE 0 END) > 0
      ORDER BY null_queries DESC
    `;
    
    const nullQueries = await dbService.query(nullQueryQuery, [startId, endId]);
    
    if (nullQueries.rows.length > 0) {
      console.log(
        'ID'.padEnd(5) + '| ' +
        '키워드'.padEnd(35) + '| ' +
        '총실행'.padEnd(8) + '| ' +
        'NULL'.padEnd(6) + '| ' +
        '빈값'.padEnd(6) + '| ' +
        '정상'.padEnd(6) + '| ' +
        '성공률(NULL/정상)'
      );
      console.log('─'.repeat(150));
      
      nullQueries.rows.forEach(row => {
        console.log(
          row.id.toString().padEnd(5) + '| ' +
          row.keyword.substring(0, 33).padEnd(35) + '| ' +
          row.total_execs.toString().padEnd(8) + '| ' +
          row.null_queries.toString().padEnd(6) + '| ' +
          row.empty_queries.toString().padEnd(6) + '| ' +
          row.valid_queries.toString().padEnd(6) + '| ' +
          `${parseFloat(row.null_success_rate || 0).toFixed(0)}% / ${parseFloat(row.valid_success_rate || 0).toFixed(0)}%`
        );
      });
    }

    // 4. 키워드 변경이 통계에 미친 영향
    console.log('\n📈 검색어 일관성과 성능 상관관계:');
    console.log('─'.repeat(150));
    
    const consistencyQuery = `
      WITH keyword_consistency AS (
        SELECT 
          k.id,
          k.keyword,
          COUNT(DISTINCT e.query) as query_variety,
          COUNT(e.id) as total_execs,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as found_rate,
          -- 예상 노출과 실제 차이
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]' THEN
              ABS(
                CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER) - 
                SUM(CASE WHEN e.found THEN 1 ELSE 0 END)
              )
            ELSE NULL
          END as exposure_diff
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.id, k.keyword
        HAVING COUNT(e.id) > 0
      )
      SELECT 
        CASE 
          WHEN query_variety = 0 THEN 'Query 없음'
          WHEN query_variety = 1 THEN '일관된 검색어'
          WHEN query_variety <= 3 THEN '약간 변경 (2-3개)'
          ELSE '자주 변경 (4개+)'
        END as consistency_level,
        COUNT(*) as keyword_count,
        AVG(success_rate) as avg_success_rate,
        AVG(found_rate) as avg_found_rate,
        AVG(exposure_diff) as avg_exposure_diff
      FROM keyword_consistency
      GROUP BY consistency_level
      ORDER BY 
        CASE consistency_level
          WHEN 'Query 없음' THEN 1
          WHEN '일관된 검색어' THEN 2
          WHEN '약간 변경 (2-3개)' THEN 3
          ELSE 4
        END
    `;
    
    const consistency = await dbService.query(consistencyQuery, [startId, endId]);
    
    console.log(
      '검색어 일관성'.padEnd(20) + '| ' +
      '키워드수'.padEnd(10) + '| ' +
      '평균 성공률'.padEnd(12) + '| ' +
      '평균 발견률'.padEnd(12) + '| ' +
      '평균 노출차이'
    );
    console.log('─'.repeat(150));
    
    consistency.rows.forEach(row => {
      const impactIcon = row.avg_exposure_diff > 30 ? '🔴' :
                         row.avg_exposure_diff > 15 ? '🟡' : '🟢';
      
      console.log(
        row.consistency_level.padEnd(20) + '| ' +
        row.keyword_count.toString().padEnd(10) + '| ' +
        `${parseFloat(row.avg_success_rate).toFixed(1)}%`.padEnd(12) + '| ' +
        `${parseFloat(row.avg_found_rate).toFixed(1)}%`.padEnd(12) + '| ' +
        `${impactIcon} ${parseFloat(row.avg_exposure_diff || 0).toFixed(1)}`
      );
    });

    // 5. 결론
    console.log('\n💡 분석 결론:');
    console.log('─'.repeat(150));
    
    const impactSummaryQuery = `
      SELECT 
        COUNT(DISTINCT k.id) as total_keywords,
        COUNT(DISTINCT CASE WHEN e.query IS NOT NULL THEN k.id END) as keywords_with_query,
        COUNT(DISTINCT CASE WHEN e.query != k.keyword THEN k.id END) as keywords_with_changes,
        AVG(CASE WHEN e.query = k.keyword AND e.success THEN 100.0 
                 WHEN e.query = k.keyword THEN 0.0 
                 ELSE NULL END) as same_query_success,
        AVG(CASE WHEN e.query != k.keyword AND e.success THEN 100.0 
                 WHEN e.query != k.keyword THEN 0.0 
                 ELSE NULL END) as diff_query_success
      FROM v1_keywords k
      LEFT JOIN v1_executions e ON k.id = e.keyword_id
      WHERE k.id BETWEEN $1 AND $2
    `;
    
    const impactSummary = await dbService.query(impactSummaryQuery, [startId, endId]);
    const summary = impactSummary.rows[0];
    
    console.log(`  분석 대상: ${summary.total_keywords}개 키워드`);
    console.log(`  Query 기록 있음: ${summary.keywords_with_query}개`);
    console.log(`  검색어 변경 감지: ${summary.keywords_with_changes}개`);
    
    if (summary.same_query_success && summary.diff_query_success) {
      console.log(`\n  성공률 비교:`);
      console.log(`    동일 검색어: ${parseFloat(summary.same_query_success).toFixed(1)}%`);
      console.log(`    변경된 검색어: ${parseFloat(summary.diff_query_success).toFixed(1)}%`);
      
      const diff = summary.same_query_success - summary.diff_query_success;
      if (Math.abs(diff) > 10) {
        console.log(`    ⚠️ 검색어 변경이 성공률에 ${diff > 0 ? '부정적' : '긍정적'} 영향 (${Math.abs(diff).toFixed(1)}% 차이)`);
      } else {
        console.log(`    ✅ 검색어 변경이 성공률에 큰 영향 없음 (${Math.abs(diff).toFixed(1)}% 차이)`);
      }
    }
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 실행
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--start' && args[index + 1]) {
    options.startId = parseInt(args[index + 1]);
  } else if (arg === '--end' && args[index + 1]) {
    options.endId = parseInt(args[index + 1]);
  }
});

if (args.includes('--help')) {
  console.log(`
사용법: node analyze-keyword-changes.js [옵션]

옵션:
  --start <ID>     시작 키워드 ID (기본: 31)
  --end <ID>       종료 키워드 ID (기본: 71)
  --help          도움말 표시
`);
  process.exit(0);
}

analyzeKeywordChanges(options);