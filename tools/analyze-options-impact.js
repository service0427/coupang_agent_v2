/**
 * 브라우저 옵션별 영향 분석 도구
 * ID 31~71 키워드의 다양한 옵션 조합과 성능 영향 분석
 * 
 * 옵션 설명:
 * - userdata: true=프로필 유지(로그인 상태 유지), false=새 프로필
 * - session: true=세션 유지, false=새 세션(쿠키 삭제)
 * - cache: true=캐시 유지, false=캐시 삭제
 * - gpu: GPU 가속 사용 여부
 * - optimize: true=네트워크 최적화(이미지/폰트 차단), false=전체 로드
 */

const dbService = require('../lib/services/db-service');

async function analyzeOptionsImpact(options = {}) {
  const {
    startId = 31,
    endId = 71,
    date = 'yesterday',
    showDetails = false
  } = options;

  // 날짜 설정
  let dateCondition;
  let dateDisplay;
  
  if (date === 'yesterday') {
    dateCondition = "DATE(e.executed) = CURRENT_DATE - INTERVAL '1 day'";
    dateDisplay = '어제';
  } else if (date === 'today') {
    dateCondition = "DATE(e.executed) = CURRENT_DATE";
    dateDisplay = '오늘';
  } else if (date === 'all') {
    dateCondition = "1=1";
    dateDisplay = '전체 기간';
  } else {
    dateCondition = `DATE(e.executed) = '${date}'`;
    dateDisplay = date;
  }

  console.log(`🔧 브라우저 옵션별 영향 분석 (ID ${startId}~${endId})`);
  console.log(`📅 분석 날짜: ${dateDisplay}`);
  console.log('='.repeat(150));

  try {
    // 1. 전체 옵션 조합별 통계
    console.log('\n📊 옵션 조합별 성능 통계:');
    console.log('─'.repeat(150));
    
    const optionCombinationQuery = `
      WITH option_stats AS (
        SELECT 
          k.id,
          k.keyword,
          k.userdata,
          k.session,
          k.cache,
          k.gpu,
          k.optimize,
          
          -- 기록값 파싱 (키워드에서 [검색/노출/클릭/장바구니] 추출)
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
            THEN CAST(SUBSTRING(k.keyword FROM '\\[(\\d+)/\\d+/\\d+/\\d+\\]') AS INTEGER)
            ELSE NULL
          END as expected_searches,
          
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
            THEN CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER)
            ELSE NULL
          END as expected_exposures,
          
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
            THEN CAST(SUBSTRING(k.keyword FROM '\\[\\d+/\\d+/(\\d+)/\\d+\\]') AS INTEGER)
            ELSE NULL
          END as expected_clicks,
          
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
            THEN CAST(SUBSTRING(k.keyword FROM '\\[\\d+/\\d+/\\d+/(\\d+)\\]') AS INTEGER)
            ELSE NULL
          END as expected_carts,
          
          -- 실제 실행 통계
          COUNT(e.id) as actual_executions,
          SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as actual_success,
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as actual_found,
          SUM(CASE WHEN e.cart THEN 1 ELSE 0 END) as actual_cart,
          
          -- 성공률
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as found_rate,
          
          -- 성능 지표
          AVG(e.duration) / 1000.0 as avg_duration_sec,
          AVG(e.traffic) as avg_traffic_mb,
          AVG(e.pages) as avg_pages,
          AVG(e.rank) as avg_rank,
          
          -- IP 관련
          COUNT(DISTINCT e.ip) as unique_ips,
          COUNT(e.id)::NUMERIC / NULLIF(COUNT(DISTINCT e.ip), 0) as ip_reuse_ratio
          
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.id, k.keyword, k.userdata, k.session, k.cache, k.gpu, k.optimize
      )
      SELECT 
        id,
        keyword,
        userdata,
        session,
        cache,
        gpu,
        optimize,
        expected_exposures,
        actual_found,
        actual_executions,
        actual_success,
        actual_cart,
        ROUND(success_rate, 2) as success_rate,
        ROUND(found_rate, 2) as found_rate,
        ROUND(avg_duration_sec, 2) as avg_duration_sec,
        ROUND(avg_traffic_mb, 2) as avg_traffic_mb,
        ROUND(avg_pages, 1) as avg_pages,
        ROUND(avg_rank, 1) as avg_rank,
        unique_ips,
        ROUND(ip_reuse_ratio, 2) as ip_reuse_ratio,
        
        -- 노출 차이 계산
        ABS(COALESCE(expected_exposures, 0) - actual_found) as exposure_diff
        
      FROM option_stats
      ORDER BY id
    `;
    
    const optionStats = await dbService.query(optionCombinationQuery, [startId, endId]);
    
    console.log(
      'ID'.padEnd(5) + '| ' +
      '옵션(U/S/C/G/O)'.padEnd(17) + '| ' +
      '실행'.padEnd(6) + '| ' +
      '성공'.padEnd(6) + '| ' +
      '노출(예상→실제)'.padEnd(18) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      '평균시간'.padEnd(10) + '| ' +
      '트래픽'.padEnd(8) + '| ' +
      'IP재사용'
    );
    console.log('─'.repeat(150));
    
    optionStats.rows.forEach(row => {
      // 옵션 조합 표시 (T/F로 간단히)
      const optionStr = `${row.userdata ? 'T' : 'F'}/${row.session ? 'T' : 'F'}/${row.cache ? 'T' : 'F'}/${row.gpu ? 'T' : 'F'}/${row.optimize ? 'T' : 'F'}`;
      
      // 노출 차이에 따른 표시
      const exposureMatch = row.exposure_diff === 0 ? '✅' : 
                           row.exposure_diff > 10 ? '🔴' : '🟡';
      
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        optionStr.padEnd(17) + '| ' +
        (row.actual_executions || 0).toString().padEnd(6) + '| ' +
        (row.actual_success || 0).toString().padEnd(6) + '| ' +
        `${row.expected_exposures || '?'}→${row.actual_found || 0}${exposureMatch}`.padEnd(20) + '| ' +
        `${row.success_rate || 0}%`.padEnd(8) + '| ' +
        `${row.avg_duration_sec || 0}초`.padEnd(10) + '| ' +
        `${row.avg_traffic_mb || 0}MB`.padEnd(8) + '| ' +
        `${row.ip_reuse_ratio || 0}:1`
      );
    });

    // 2. 옵션별 집계 분석
    console.log('\n📈 개별 옵션별 영향 분석:');
    console.log('─'.repeat(150));
    
    const individualOptionQuery = `
      WITH option_analysis AS (
        SELECT 
          'userdata' as option_name,
          k.userdata as option_value,
          COUNT(DISTINCT k.id) as keyword_count,
          COUNT(e.id) as total_executions,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as avg_success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as avg_found_rate,
          AVG(e.duration) / 1000.0 as avg_duration_sec,
          AVG(e.traffic) as avg_traffic_mb
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.userdata
        
        UNION ALL
        
        SELECT 
          'session' as option_name,
          k.session as option_value,
          COUNT(DISTINCT k.id) as keyword_count,
          COUNT(e.id) as total_executions,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as avg_success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as avg_found_rate,
          AVG(e.duration) / 1000.0 as avg_duration_sec,
          AVG(e.traffic) as avg_traffic_mb
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.session
        
        UNION ALL
        
        SELECT 
          'cache' as option_name,
          k.cache as option_value,
          COUNT(DISTINCT k.id) as keyword_count,
          COUNT(e.id) as total_executions,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as avg_success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as avg_found_rate,
          AVG(e.duration) / 1000.0 as avg_duration_sec,
          AVG(e.traffic) as avg_traffic_mb
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.cache
        
        UNION ALL
        
        SELECT 
          'optimize' as option_name,
          k.optimize as option_value,
          COUNT(DISTINCT k.id) as keyword_count,
          COUNT(e.id) as total_executions,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as avg_success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as avg_found_rate,
          AVG(e.duration) / 1000.0 as avg_duration_sec,
          AVG(e.traffic) as avg_traffic_mb
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.optimize
      )
      SELECT 
        option_name,
        option_value,
        keyword_count,
        total_executions,
        ROUND(avg_success_rate, 2) as success_rate,
        ROUND(avg_found_rate, 2) as found_rate,
        ROUND(avg_duration_sec, 2) as avg_duration_sec,
        ROUND(avg_traffic_mb, 2) as avg_traffic_mb
      FROM option_analysis
      ORDER BY option_name, option_value DESC
    `;
    
    const individualOptions = await dbService.query(individualOptionQuery, [startId, endId]);
    
    console.log(
      '옵션'.padEnd(12) + '| ' +
      '값'.padEnd(6) + '| ' +
      '키워드수'.padEnd(10) + '| ' +
      '실행수'.padEnd(8) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      '발견률'.padEnd(8) + '| ' +
      '평균시간'.padEnd(10) + '| ' +
      '트래픽'.padEnd(8) + '| ' +
      '영향도'
    );
    console.log('─'.repeat(150));
    
    let currentOption = '';
    individualOptions.rows.forEach(row => {
      if (row.option_name !== currentOption) {
        currentOption = row.option_name;
        console.log('─'.repeat(150));
      }
      
      // 영향도 계산 (True vs False 비교)
      let impact = '';
      if (row.option_value === true) {
        const falseRow = individualOptions.rows.find(r => 
          r.option_name === row.option_name && r.option_value === false
        );
        if (falseRow) {
          const successDiff = row.success_rate - falseRow.success_rate;
          const timeDiff = row.avg_duration_sec - falseRow.avg_duration_sec;
          
          if (Math.abs(successDiff) > 5) {
            impact = successDiff > 0 ? '🟢 +성공률' : '🔴 -성공률';
          }
          if (Math.abs(timeDiff) > 5) {
            impact += timeDiff < 0 ? ' ⚡빠름' : ' 🐌느림';
          }
        }
      }
      
      const optionLabel = {
        'userdata': '프로필유지',
        'session': '세션유지',
        'cache': '캐시유지',
        'optimize': '최적화'
      }[row.option_name] || row.option_name;
      
      console.log(
        optionLabel.padEnd(12) + '| ' +
        (row.option_value ? 'ON' : 'OFF').padEnd(6) + '| ' +
        row.keyword_count.toString().padEnd(10) + '| ' +
        row.total_executions.toString().padEnd(8) + '| ' +
        `${row.success_rate}%`.padEnd(8) + '| ' +
        `${row.found_rate}%`.padEnd(8) + '| ' +
        `${row.avg_duration_sec}초`.padEnd(10) + '| ' +
        `${row.avg_traffic_mb}MB`.padEnd(8) + '| ' +
        impact
      );
    });

    // 3. 최적 조합 찾기
    console.log('\n🏆 최적 옵션 조합 TOP 5:');
    console.log('─'.repeat(150));
    
    const bestCombinationQuery = `
      WITH combination_performance AS (
        SELECT 
          CONCAT(
            CASE WHEN k.userdata THEN 'U' ELSE '-' END,
            CASE WHEN k.session THEN 'S' ELSE '-' END,
            CASE WHEN k.cache THEN 'C' ELSE '-' END,
            CASE WHEN k.gpu THEN 'G' ELSE '-' END,
            CASE WHEN k.optimize THEN 'O' ELSE '-' END
          ) as option_combo,
          k.userdata,
          k.session,
          k.cache,
          k.gpu,
          k.optimize,
          COUNT(DISTINCT k.id) as keyword_count,
          COUNT(e.id) as total_executions,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as found_rate,
          AVG(e.duration) / 1000.0 as avg_duration_sec,
          AVG(e.traffic) as avg_traffic_mb,
          
          -- 노출 정확도
          AVG(
            CASE 
              WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]' THEN
                ABS(
                  CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER) - 
                  SUM(CASE WHEN e.found THEN 1 ELSE 0 END) OVER (PARTITION BY k.id)
                )
              ELSE NULL
            END
          ) as avg_exposure_diff
          
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.userdata, k.session, k.cache, k.gpu, k.optimize
        HAVING COUNT(e.id) > 0
      )
      SELECT 
        option_combo,
        keyword_count,
        total_executions,
        ROUND(success_rate, 2) as success_rate,
        ROUND(found_rate, 2) as found_rate,
        ROUND(avg_duration_sec, 2) as avg_duration_sec,
        ROUND(avg_traffic_mb, 2) as avg_traffic_mb,
        ROUND(avg_exposure_diff, 1) as avg_exposure_diff,
        
        -- 종합 점수 (성공률 50% + 속도 30% + 노출정확도 20%)
        ROUND(
          (success_rate * 0.5) + 
          ((100 - LEAST(avg_duration_sec, 100)) * 0.3) + 
          ((100 - LEAST(COALESCE(avg_exposure_diff, 0), 100)) * 0.2),
          2
        ) as overall_score
        
      FROM combination_performance
      ORDER BY overall_score DESC
      LIMIT 5
    `;
    
    const bestCombinations = await dbService.query(bestCombinationQuery, [startId, endId]);
    
    console.log(
      '순위'.padEnd(6) + '| ' +
      '조합'.padEnd(10) + '| ' +
      '키워드'.padEnd(8) + '| ' +
      '실행'.padEnd(6) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      '발견률'.padEnd(8) + '| ' +
      '속도'.padEnd(8) + '| ' +
      '노출차이'.padEnd(10) + '| ' +
      '종합점수'
    );
    console.log('─'.repeat(150));
    
    bestCombinations.rows.forEach((row, index) => {
      console.log(
        `#${index + 1}`.padEnd(6) + '| ' +
        row.option_combo.padEnd(10) + '| ' +
        row.keyword_count.toString().padEnd(8) + '| ' +
        row.total_executions.toString().padEnd(6) + '| ' +
        `${row.success_rate}%`.padEnd(8) + '| ' +
        `${row.found_rate}%`.padEnd(8) + '| ' +
        `${row.avg_duration_sec}초`.padEnd(8) + '| ' +
        `±${row.avg_exposure_diff || 0}`.padEnd(10) + '| ' +
        `${row.overall_score}점`
      );
    });
    
    console.log('\n📌 조합 범례: U=Userdata, S=Session, C=Cache, G=GPU, O=Optimize');

    // 4. 노출 정확도 분석
    console.log('\n🎯 노출 정확도 분석 (예상 vs 실제):');
    console.log('─'.repeat(150));
    
    const exposureAccuracyQuery = `
      WITH exposure_analysis AS (
        SELECT 
          k.id,
          k.keyword,
          CONCAT(
            CASE WHEN k.userdata THEN 'U' ELSE '-' END,
            CASE WHEN k.session THEN 'S' ELSE '-' END,
            CASE WHEN k.cache THEN 'C' ELSE '-' END,
            CASE WHEN k.optimize THEN 'O' ELSE '-' END
          ) as options,
          
          -- 예상 노출 (키워드에서 파싱)
          CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER) as expected_exposure,
          
          -- 실제 발견
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as actual_found,
          COUNT(e.id) as total_executions,
          
          -- 차이
          ABS(
            CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER) - 
            SUM(CASE WHEN e.found THEN 1 ELSE 0 END)
          ) as exposure_diff
          
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id AND ${dateCondition}
        WHERE k.id BETWEEN $1 AND $2
          AND k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
        GROUP BY k.id, k.keyword, k.userdata, k.session, k.cache, k.optimize
        HAVING COUNT(e.id) > 0
      )
      SELECT 
        id,
        SUBSTRING(keyword FROM 1 FOR 30) as keyword_short,
        options,
        expected_exposure,
        actual_found,
        exposure_diff,
        CASE 
          WHEN exposure_diff = 0 THEN '✅ 정확'
          WHEN exposure_diff <= 5 THEN '🟢 양호'
          WHEN exposure_diff <= 10 THEN '🟡 보통'
          ELSE '🔴 불량'
        END as accuracy_level
      FROM exposure_analysis
      ORDER BY exposure_diff DESC
      LIMIT 10
    `;
    
    const exposureAccuracy = await dbService.query(exposureAccuracyQuery, [startId, endId]);
    
    console.log(
      'ID'.padEnd(5) + '| ' +
      '키워드'.padEnd(32) + '| ' +
      '옵션'.padEnd(8) + '| ' +
      '예상노출'.padEnd(10) + '| ' +
      '실제발견'.padEnd(10) + '| ' +
      '차이'.padEnd(6) + '| ' +
      '정확도'
    );
    console.log('─'.repeat(150));
    
    exposureAccuracy.rows.forEach(row => {
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        row.keyword_short.padEnd(32) + '| ' +
        row.options.padEnd(8) + '| ' +
        row.expected_exposure.toString().padEnd(10) + '| ' +
        row.actual_found.toString().padEnd(10) + '| ' +
        row.exposure_diff.toString().padEnd(6) + '| ' +
        row.accuracy_level
      );
    });

    // 5. 결론 및 권장사항
    console.log('\n💡 분석 결론:');
    console.log('─'.repeat(150));
    
    // 각 옵션의 영향도 계산
    const optionImpacts = {};
    ['userdata', 'session', 'cache', 'optimize'].forEach(optName => {
      const onRow = individualOptions.rows.find(r => r.option_name === optName && r.option_value === true);
      const offRow = individualOptions.rows.find(r => r.option_name === optName && r.option_value === false);
      
      if (onRow && offRow) {
        optionImpacts[optName] = {
          successDiff: onRow.success_rate - offRow.success_rate,
          foundDiff: onRow.found_rate - offRow.found_rate,
          timeDiff: onRow.avg_duration_sec - offRow.avg_duration_sec,
          trafficDiff: onRow.avg_traffic_mb - offRow.avg_traffic_mb
        };
      }
    });
    
    console.log('📊 옵션별 영향도:');
    Object.entries(optionImpacts).forEach(([option, impact]) => {
      console.log(`\n  ${option.toUpperCase()}:`);
      console.log(`    성공률: ${impact.successDiff > 0 ? '+' : ''}${impact.successDiff.toFixed(2)}%`);
      console.log(`    발견률: ${impact.foundDiff > 0 ? '+' : ''}${impact.foundDiff.toFixed(2)}%`);
      console.log(`    속도: ${impact.timeDiff > 0 ? '+' : ''}${impact.timeDiff.toFixed(2)}초`);
      console.log(`    트래픽: ${impact.trafficDiff > 0 ? '+' : ''}${impact.trafficDiff.toFixed(2)}MB`);
    });
    
    console.log('\n📌 권장 설정:');
    
    // 최적 조합 추천
    if (bestCombinations.rows.length > 0) {
      const best = bestCombinations.rows[0];
      console.log(`  최적 조합: ${best.option_combo}`);
      console.log(`  - 성공률: ${best.success_rate}%`);
      console.log(`  - 평균 속도: ${best.avg_duration_sec}초`);
      console.log(`  - 노출 정확도: ±${best.avg_exposure_diff || 0}`);
    }
    
    // 개별 옵션 권장사항
    console.log('\n  개별 옵션 권장:');
    Object.entries(optionImpacts).forEach(([option, impact]) => {
      if (impact.successDiff > 5) {
        console.log(`  ✅ ${option}: ON 권장 (성공률 +${impact.successDiff.toFixed(1)}%)`);
      } else if (impact.successDiff < -5) {
        console.log(`  ⚠️ ${option}: OFF 권장 (성공률 ${impact.successDiff.toFixed(1)}%)`);
      } else {
        console.log(`  ➖ ${option}: 영향 미미 (±${Math.abs(impact.successDiff).toFixed(1)}%)`);
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
  if (arg === '--start' && args[index + 1]) {
    options.startId = parseInt(args[index + 1]);
  } else if (arg === '--end' && args[index + 1]) {
    options.endId = parseInt(args[index + 1]);
  } else if (arg === '--date' && args[index + 1]) {
    options.date = args[index + 1];
  } else if (arg === '--details') {
    options.showDetails = true;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-options-impact.js [옵션]

옵션:
  --start <ID>     시작 키워드 ID (기본: 31)
  --end <ID>       종료 키워드 ID (기본: 71)
  --date <날짜>    분석 날짜 (yesterday, today, all, YYYY-MM-DD)
                  기본값: yesterday
  --details       상세 정보 표시
  --help          도움말 표시

예시:
  node analyze-options-impact.js                      # ID 31~71, 어제
  node analyze-options-impact.js --start 1 --end 100  # ID 1~100
  node analyze-options-impact.js --date all           # 전체 기간
  node analyze-options-impact.js --date 2025-08-05    # 특정 날짜
`);
  process.exit(0);
}

// 실행
analyzeOptionsImpact(options);