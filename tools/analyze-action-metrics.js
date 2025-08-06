/**
 * 검색/노출/클릭/장바구니 액션 메트릭 분석 도구
 * - runs = 검색량 + 노출 (검색 시도 횟수)
 * - succ = 클릭 (성공적인 상품 클릭)
 * - cart = 장바구니 (장바구니 추가 액션)
 * - 각 메트릭 간의 전환율 분석
 */

const dbService = require('../lib/services/db-service');

async function analyzeActionMetrics(options = {}) {
  const {
    keywordId = null,
    days = 7,
    showDetails = false,
    compareWithLog = true
  } = options;

  console.log('📊 검색/노출/클릭/장바구니 액션 메트릭 분석');
  console.log('='.repeat(150));
  console.log('📌 메트릭 정의:');
  console.log('  - runs (검색/노출): 검색 시도 및 결과 노출 횟수');
  console.log('  - succ (클릭): 상품 페이지 성공적 진입');
  console.log('  - cart (장바구니): 장바구니 추가 완료');
  console.log('='.repeat(150));

  try {
    // 1. 키워드별 액션 메트릭 현황
    console.log('\n📈 키워드별 액션 메트릭 및 전환율:');
    console.log('─'.repeat(150));
    
    let whereClause = '';
    const params = [];
    
    if (keywordId) {
      params.push(keywordId);
      whereClause = `WHERE k.id = $${params.length}`;
    }
    
    const metricsQuery = `
      WITH keyword_metrics AS (
        SELECT 
          k.id,
          k.keyword,
          k.code,
          k.runs as search_exposure,  -- 검색/노출
          k.succ as clicks,            -- 클릭
          k.cart as cart_enabled,      -- 장바구니 기능 활성화 여부
          
          -- 실제 실행 로그에서 집계
          (SELECT COUNT(*) 
           FROM v1_executions e 
           WHERE e.keyword_id = k.id
             AND e.executed >= NOW() - INTERVAL '${days} days') as log_total,
          
          (SELECT COUNT(*) 
           FROM v1_executions e 
           WHERE e.keyword_id = k.id 
             AND e.success = true
             AND e.executed >= NOW() - INTERVAL '${days} days') as log_success,
          
          (SELECT COUNT(*) 
           FROM v1_executions e 
           WHERE e.keyword_id = k.id 
             AND e.cart = true
             AND e.executed >= NOW() - INTERVAL '${days} days') as log_cart,
          
          (SELECT COUNT(*) 
           FROM v1_executions e 
           WHERE e.keyword_id = k.id 
             AND e.found = true
             AND e.executed >= NOW() - INTERVAL '${days} days') as log_found,
          
          (SELECT AVG(e.rank) 
           FROM v1_executions e 
           WHERE e.keyword_id = k.id 
             AND e.rank IS NOT NULL
             AND e.executed >= NOW() - INTERVAL '${days} days') as avg_rank,
          
          (SELECT AVG(e.pages) 
           FROM v1_executions e 
           WHERE e.keyword_id = k.id 
             AND e.pages IS NOT NULL
             AND e.executed >= NOW() - INTERVAL '${days} days') as avg_pages
        FROM v1_keywords k
        ${whereClause}
      )
      SELECT 
        id,
        keyword,
        code,
        cart_enabled,
        search_exposure,
        clicks,
        log_total,
        log_success,
        log_cart,
        log_found,
        
        -- 전환율 계산
        CASE 
          WHEN search_exposure > 0 
          THEN ROUND((clicks::NUMERIC / search_exposure) * 100, 2)
          ELSE 0 
        END as click_rate,
        
        CASE 
          WHEN clicks > 0 AND cart_enabled
          THEN ROUND((log_cart::NUMERIC / clicks) * 100, 2)
          ELSE 0 
        END as cart_conversion,
        
        CASE 
          WHEN log_total > 0
          THEN ROUND((log_found::NUMERIC / log_total) * 100, 2)
          ELSE 0
        END as find_rate,
        
        ROUND(avg_rank, 1) as avg_rank,
        ROUND(avg_pages, 1) as avg_pages
      FROM keyword_metrics
      ORDER BY search_exposure DESC
      LIMIT 30
    `;
    
    const metrics = await dbService.query(metricsQuery, params);
    
    console.log(
      'ID'.padEnd(5) + '| ' +
      '키워드'.padEnd(25) + '| ' +
      '검색/노출'.padEnd(10) + '| ' +
      '클릭'.padEnd(8) + '| ' +
      '장바구니'.padEnd(10) + '| ' +
      '클릭률'.padEnd(8) + '| ' +
      '장바구니율'.padEnd(12) + '| ' +
      '발견율'.padEnd(8) + '| ' +
      '평균순위'
    );
    console.log('─'.repeat(150));
    
    metrics.rows.forEach(row => {
      // 전환율에 따른 아이콘
      const clickIcon = row.click_rate > 50 ? '🟢' : 
                       row.click_rate > 30 ? '🟡' : 
                       row.click_rate > 10 ? '🟠' : '🔴';
      
      const cartIcon = row.cart_conversion > 70 ? '🛒' : 
                      row.cart_conversion > 50 ? '🛍️' : '';
      
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        row.keyword.substring(0, 23).padEnd(25) + '| ' +
        row.search_exposure.toString().padEnd(10) + '| ' +
        row.clicks.toString().padEnd(8) + '| ' +
        row.log_cart.toString().padEnd(10) + '| ' +
        `${clickIcon}${row.click_rate}%`.padEnd(10) + '| ' +
        `${cartIcon}${row.cart_conversion}%`.padEnd(14) + '| ' +
        `${row.find_rate}%`.padEnd(8) + '| ' +
        (row.avg_rank ? `#${row.avg_rank}` : 'N/A')
      );
    });

    // 2. 로그 기반 vs 기록 값 비교
    if (compareWithLog) {
      console.log('\n🔄 기록값 vs 실제 로그 비교:');
      console.log('─'.repeat(150));
      
      const comparisonQuery = `
        WITH comparison AS (
          SELECT 
            k.id,
            k.keyword,
            k.runs as recorded_runs,
            k.succ as recorded_succ,
            
            COUNT(e.id) as actual_runs,
            SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as actual_succ,
            SUM(CASE WHEN e.cart THEN 1 ELSE 0 END) as actual_cart,
            
            ABS(k.runs - COUNT(e.id)) as run_diff,
            ABS(k.succ - SUM(CASE WHEN e.success THEN 1 ELSE 0 END)) as succ_diff
          FROM v1_keywords k
          LEFT JOIN v1_executions e ON k.id = e.keyword_id
            AND e.executed >= NOW() - INTERVAL '${days} days'
          ${whereClause}
          GROUP BY k.id, k.keyword, k.runs, k.succ
          HAVING COUNT(e.id) > 0 OR k.runs > 0
        )
        SELECT 
          id,
          keyword,
          recorded_runs,
          actual_runs,
          run_diff,
          recorded_succ,
          actual_succ,
          succ_diff,
          actual_cart,
          CASE 
            WHEN recorded_runs > 0 
            THEN ROUND(((recorded_runs - actual_runs)::NUMERIC / recorded_runs) * 100, 2)
            ELSE 0
          END as run_variance_pct,
          CASE 
            WHEN recorded_succ > 0 
            THEN ROUND(((recorded_succ - actual_succ)::NUMERIC / recorded_succ) * 100, 2)
            ELSE 0
          END as succ_variance_pct
        FROM comparison
        WHERE run_diff > 0 OR succ_diff > 0
        ORDER BY run_diff DESC
        LIMIT 20
      `;
      
      const comparison = await dbService.query(comparisonQuery, params);
      
      if (comparison.rows.length > 0) {
        console.log(
          'ID'.padEnd(5) + '| ' +
          '키워드'.padEnd(25) + '| ' +
          '검색(기록→실제)'.padEnd(18) + '| ' +
          '차이'.padEnd(6) + '| ' +
          '클릭(기록→실제)'.padEnd(18) + '| ' +
          '차이'.padEnd(6) + '| ' +
          '장바구니'.padEnd(10) + '| ' +
          '오차율'
        );
        console.log('─'.repeat(150));
        
        comparison.rows.forEach(row => {
          const runMismatch = row.run_diff > 0 ? '⚠️' : '✅';
          const succMismatch = row.succ_diff > 0 ? '⚠️' : '✅';
          
          console.log(
            row.id.toString().padEnd(5) + '| ' +
            row.keyword.substring(0, 23).padEnd(25) + '| ' +
            `${row.recorded_runs}→${row.actual_runs}`.padEnd(18) + '| ' +
            `${runMismatch}${row.run_diff}`.padEnd(8) + '| ' +
            `${row.recorded_succ}→${row.actual_succ}`.padEnd(18) + '| ' +
            `${succMismatch}${row.succ_diff}`.padEnd(8) + '| ' +
            row.actual_cart.toString().padEnd(10) + '| ' +
            `R:${Math.abs(row.run_variance_pct)}% S:${Math.abs(row.succ_variance_pct)}%`
          );
        });
      }
    }

    // 3. 액션 퍼널 분석
    console.log('\n🔻 액션 퍼널 분석 (최근 ' + days + '일):');
    console.log('─'.repeat(120));
    
    const funnelQuery = `
      WITH funnel_data AS (
        SELECT 
          COUNT(*) as total_searches,
          SUM(CASE WHEN found THEN 1 ELSE 0 END) as products_found,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_clicks,
          SUM(CASE WHEN cart THEN 1 ELSE 0 END) as cart_additions,
          AVG(CASE WHEN rank IS NOT NULL THEN rank END) as avg_product_rank,
          AVG(CASE WHEN pages IS NOT NULL THEN pages END) as avg_pages_viewed
        FROM v1_executions
        WHERE executed >= NOW() - INTERVAL '${days} days'
          ${keywordId ? `AND keyword_id = $1` : ''}
      )
      SELECT 
        total_searches,
        products_found,
        successful_clicks,
        cart_additions,
        ROUND((products_found::NUMERIC / NULLIF(total_searches, 0)) * 100, 2) as find_rate,
        ROUND((successful_clicks::NUMERIC / NULLIF(products_found, 0)) * 100, 2) as click_rate,
        ROUND((cart_additions::NUMERIC / NULLIF(successful_clicks, 0)) * 100, 2) as cart_rate,
        ROUND(avg_product_rank, 1) as avg_rank,
        ROUND(avg_pages_viewed, 1) as avg_pages
      FROM funnel_data
    `;
    
    const funnelParams = keywordId ? [keywordId] : [];
    const funnel = await dbService.query(funnelQuery, funnelParams);
    
    if (funnel.rows.length > 0) {
      const f = funnel.rows[0];
      const maxWidth = 50;
      
      console.log('\n단계별 전환 퍼널:');
      console.log(`1. 🔍 검색 시도: ${f.total_searches}회 ${'█'.repeat(maxWidth)}`);
      console.log(`2. 👁️ 상품 발견: ${f.products_found}회 ${'█'.repeat(Math.round(f.products_found / f.total_searches * maxWidth))} (${f.find_rate}%)`);
      console.log(`3. 🖱️ 클릭 성공: ${f.successful_clicks}회 ${'█'.repeat(Math.round(f.successful_clicks / f.total_searches * maxWidth))} (${f.click_rate}%)`);
      console.log(`4. 🛒 장바구니: ${f.cart_additions}회 ${'█'.repeat(Math.round(f.cart_additions / f.total_searches * maxWidth))} (${f.cart_rate}%)`);
      
      console.log(`\n📊 평균 지표:`);
      console.log(`  - 평균 상품 순위: ${f.avg_rank || 'N/A'}위`);
      console.log(`  - 평균 조회 페이지: ${f.avg_pages || 'N/A'}페이지`);
    }

    // 4. 시간대별 액션 패턴
    if (showDetails) {
      console.log('\n⏰ 시간대별 액션 성공률:');
      console.log('─'.repeat(120));
      
      const hourlyQuery = `
        SELECT 
          EXTRACT(HOUR FROM executed) as hour,
          COUNT(*) as total,
          SUM(CASE WHEN found THEN 1 ELSE 0 END) as found,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN cart THEN 1 ELSE 0 END) as cart,
          ROUND(AVG(CASE WHEN success THEN 100 ELSE 0 END), 2) as success_rate,
          ROUND(AVG(CASE WHEN cart AND success THEN 100 ELSE 0 END), 2) as cart_rate
        FROM v1_executions
        WHERE executed >= NOW() - INTERVAL '${days} days'
          ${keywordId ? `AND keyword_id = $1` : ''}
        GROUP BY hour
        HAVING COUNT(*) >= 5
        ORDER BY hour
      `;
      
      const hourlyStats = await dbService.query(hourlyQuery, funnelParams);
      
      console.log(
        '시간'.padEnd(8) + '| ' +
        '실행'.padEnd(6) + '| ' +
        '발견'.padEnd(6) + '| ' +
        '클릭'.padEnd(6) + '| ' +
        '장바구니'.padEnd(10) + '| ' +
        '클릭률'.padEnd(8) + '| ' +
        '장바구니율'.padEnd(12) + '| ' +
        '성능'
      );
      console.log('─'.repeat(120));
      
      hourlyStats.rows.forEach(row => {
        const perfBar = '█'.repeat(Math.round(row.success_rate / 10));
        
        console.log(
          `${row.hour.toString().padStart(2, '0')}:00`.padEnd(8) + '| ' +
          row.total.toString().padEnd(6) + '| ' +
          row.found.toString().padEnd(6) + '| ' +
          row.success.toString().padEnd(6) + '| ' +
          row.cart.toString().padEnd(10) + '| ' +
          `${row.success_rate}%`.padEnd(8) + '| ' +
          `${row.cart_rate}%`.padEnd(12) + '| ' +
          perfBar
        );
      });
    }

    // 5. 오차 원인 분석
    console.log('\n🔍 오차 원인 분석:');
    console.log('─'.repeat(150));
    
    const errorAnalysisQuery = `
      WITH error_analysis AS (
        SELECT 
          k.id,
          k.keyword,
          k.runs - COUNT(e.id) as run_diff,
          k.succ - SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as succ_diff,
          
          -- 에러 유형별 카운트
          SUM(CASE WHEN e.error LIKE '%timeout%' THEN 1 ELSE 0 END) as timeout_errors,
          SUM(CASE WHEN e.error LIKE '%selector%' THEN 1 ELSE 0 END) as selector_errors,
          SUM(CASE WHEN e.error LIKE '%network%' THEN 1 ELSE 0 END) as network_errors,
          SUM(CASE WHEN e.error IS NOT NULL AND e.error != '' THEN 1 ELSE 0 END) as total_errors,
          
          -- IP 중복도
          COUNT(DISTINCT e.ip) as unique_ips,
          COUNT(e.id) as total_executions,
          
          -- 프록시 사용 패턴
          COUNT(DISTINCT e.proxy) as proxy_variety
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
          AND e.executed >= NOW() - INTERVAL '${days} days'
        ${whereClause}
        GROUP BY k.id, k.keyword, k.runs, k.succ
        HAVING ABS(k.runs - COUNT(e.id)) > 5 OR ABS(k.succ - SUM(CASE WHEN e.success THEN 1 ELSE 0 END)) > 5
      )
      SELECT 
        id,
        keyword,
        run_diff,
        succ_diff,
        total_errors,
        timeout_errors,
        selector_errors,
        network_errors,
        unique_ips,
        total_executions,
        ROUND(total_executions::NUMERIC / NULLIF(unique_ips, 0), 2) as ip_reuse_ratio,
        proxy_variety
      FROM error_analysis
      ORDER BY ABS(run_diff) + ABS(succ_diff) DESC
      LIMIT 10
    `;
    
    const errorAnalysis = await dbService.query(errorAnalysisQuery, params);
    
    if (errorAnalysis.rows.length > 0) {
      console.log('오차가 큰 키워드의 원인 분석:');
      
      errorAnalysis.rows.forEach(row => {
        console.log(`\n📌 ${row.keyword} (ID: ${row.id})`);
        console.log(`  오차: runs ${row.run_diff > 0 ? '+' : ''}${row.run_diff}, succ ${row.succ_diff > 0 ? '+' : ''}${row.succ_diff}`);
        
        // 주요 원인 파악
        const causes = [];
        
        if (row.total_errors > row.total_executions * 0.3) {
          causes.push(`높은 에러율 (${row.total_errors}/${row.total_executions})`);
        }
        
        if (row.ip_reuse_ratio > 10) {
          causes.push(`IP 과도 재사용 (평균 ${row.ip_reuse_ratio}회)`);
        }
        
        if (row.timeout_errors > 5) {
          causes.push(`타임아웃 빈발 (${row.timeout_errors}회)`);
        }
        
        if (row.selector_errors > 5) {
          causes.push(`셀렉터 문제 (${row.selector_errors}회)`);
        }
        
        if (row.proxy_variety < 2 && row.total_executions > 20) {
          causes.push(`프록시 다양성 부족 (${row.proxy_variety}개)`);
        }
        
        if (causes.length > 0) {
          console.log('  추정 원인:');
          causes.forEach(cause => console.log(`    - ${cause}`));
        } else {
          console.log('  추정 원인: 데이터 동기화 지연 또는 집계 시점 차이');
        }
      });
    }
    
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
  if (arg === '--keyword' && args[index + 1]) {
    options.keywordId = parseInt(args[index + 1]);
  } else if (arg === '--days' && args[index + 1]) {
    options.days = parseInt(args[index + 1]);
  } else if (arg === '--details') {
    options.showDetails = true;
  } else if (arg === '--no-compare') {
    options.compareWithLog = false;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-action-metrics.js [옵션]

옵션:
  --keyword <ID>    특정 키워드만 분석
  --days <숫자>     분석 기간 (기본: 7일)
  --details        시간대별 상세 정보 표시
  --no-compare     로그 비교 생략
  --help           도움말 표시

예시:
  node analyze-action-metrics.js --days 30 --details
  node analyze-action-metrics.js --keyword 31
  node analyze-action-metrics.js --days 1 --details
`);
  process.exit(0);
}

// 실행
analyzeActionMetrics(options);