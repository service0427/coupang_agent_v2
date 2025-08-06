/**
 * 페이지 로딩 성능 분석 도구
 * - DOMContentLoaded vs Load 시간 비교
 * - 타임아웃 발생률 분석
 * - 핵심 요소 로딩 실패율
 * - 프록시별 성능 차이
 */

const dbService = require('../lib/services/db-service');

async function analyzePageLoadPerformance(options = {}) {
  const { 
    agent = null, 
    days = 7,
    showDetails = false 
  } = options;
  
  console.log('📊 페이지 로딩 성능 분석');
  console.log('='.repeat(100));
  
  try {
    // 1. 전체 로딩 성능 요약
    console.log('\n1️⃣ 전체 로딩 성능 요약');
    console.log('-'.repeat(100));
    
    let whereClause = 'WHERE created_at > CURRENT_TIMESTAMP - INTERVAL \'%s days\'';
    const params = [days];
    let paramIndex = 2;
    
    if (agent) {
      whereClause += ` AND agent = $${paramIndex}`;
      params.push(agent);
      paramIndex++;
    }
    
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_loads,
        COUNT(CASE WHEN click_success = true THEN 1 END) as click_success,
        COUNT(CASE WHEN domcontentloaded_success = true THEN 1 END) as dom_success,
        COUNT(CASE WHEN load_success = true THEN 1 END) as load_success,
        COUNT(CASE WHEN is_blocked = true THEN 1 END) as blocked,
        COUNT(CASE WHEN domcontentloaded_timeout = true THEN 1 END) as dom_timeout,
        COUNT(CASE WHEN load_timeout = true THEN 1 END) as load_timeout,
        COUNT(CASE WHEN load_timeout = true AND is_product_page = true THEN 1 END) as timeout_but_success,
        AVG(CASE WHEN domcontentloaded_duration_ms > 0 THEN domcontentloaded_duration_ms END) as avg_dom_ms,
        AVG(CASE WHEN load_duration_ms > 0 THEN load_duration_ms END) as avg_load_ms,
        AVG(CASE WHEN product_title_load_ms > 0 THEN product_title_load_ms END) as avg_title_ms,
        AVG(CASE WHEN cart_button_load_ms > 0 THEN cart_button_load_ms END) as avg_cart_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY domcontentloaded_duration_ms) as median_dom_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY load_duration_ms) as median_load_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY load_duration_ms) as p95_load_ms
      FROM v2_page_load_metrics
      ${whereClause}
    `;
    
    const summaryResult = await dbService.query(summaryQuery.replace('%s', '$1'), params);
    const summary = summaryResult.rows[0];
    
    console.log(`전체 로딩 시도: ${summary.total_loads}회`);
    console.log(`클릭 성공: ${summary.click_success}회 (${(summary.click_success / summary.total_loads * 100).toFixed(1)}%)`);
    console.log(`DOM 로딩 성공: ${summary.dom_success}회 (${(summary.dom_success / summary.total_loads * 100).toFixed(1)}%)`);
    console.log(`전체 로딩 성공: ${summary.load_success}회 (${(summary.load_success / summary.total_loads * 100).toFixed(1)}%)`);
    console.log(`차단 발생: ${summary.blocked}회 (${(summary.blocked / summary.total_loads * 100).toFixed(1)}%)`);
    console.log('');
    console.log(`타임아웃 통계:`);
    console.log(`  - DOM 타임아웃: ${summary.dom_timeout}회 (${(summary.dom_timeout / summary.total_loads * 100).toFixed(1)}%)`);
    console.log(`  - Load 타임아웃: ${summary.load_timeout}회 (${(summary.load_timeout / summary.total_loads * 100).toFixed(1)}%)`);
    console.log(`  - 타임아웃이지만 이동 성공: ${summary.timeout_but_success}회`);
    console.log('');
    console.log(`로딩 시간 통계:`);
    console.log(`  - DOMContentLoaded: 평균 ${Math.round(summary.avg_dom_ms)}ms, 중앙값 ${Math.round(summary.median_dom_ms)}ms`);
    console.log(`  - Load Complete: 평균 ${Math.round(summary.avg_load_ms)}ms, 중앙값 ${Math.round(summary.median_load_ms)}ms, 95% ${Math.round(summary.p95_load_ms)}ms`);
    console.log(`  - 상품명 로딩: 평균 ${Math.round(summary.avg_title_ms)}ms`);
    console.log(`  - 장바구니 버튼: 평균 ${Math.round(summary.avg_cart_ms)}ms`);
    
    // 2. 에이전트별 성능 비교
    console.log('\n\n2️⃣ 에이전트별 성능 비교');
    console.log('-'.repeat(100));
    
    const agentQuery = `
      SELECT 
        agent,
        COUNT(*) as loads,
        ROUND(COUNT(CASE WHEN click_success = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as click_rate,
        ROUND(COUNT(CASE WHEN load_success = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as load_rate,
        ROUND(COUNT(CASE WHEN is_blocked = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as block_rate,
        ROUND(COUNT(CASE WHEN load_timeout = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as timeout_rate,
        ROUND(AVG(CASE WHEN load_duration_ms > 0 THEN load_duration_ms END), 0) as avg_load_ms,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY load_duration_ms), 0) as median_load_ms
      FROM v2_page_load_metrics
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
      GROUP BY agent
      ORDER BY loads DESC
    `;
    
    const agentResult = await dbService.query(agentQuery);
    
    console.log('Agent'.padEnd(10) + ' | ' +
      'Loads'.padEnd(7) + ' | ' +
      'Click%'.padEnd(8) + ' | ' +
      'Load%'.padEnd(7) + ' | ' +
      'Block%'.padEnd(8) + ' | ' +
      'Timeout%'.padEnd(10) + ' | ' +
      'Avg Load'.padEnd(10) + ' | ' +
      'Median Load'
    );
    console.log('-'.repeat(100));
    
    agentResult.rows.forEach(row => {
      console.log(
        row.agent.padEnd(10) + ' | ' +
        row.loads.toString().padEnd(7) + ' | ' +
        `${row.click_rate}%`.padEnd(8) + ' | ' +
        `${row.load_rate}%`.padEnd(7) + ' | ' +
        `${row.block_rate}%`.padEnd(8) + ' | ' +
        `${row.timeout_rate}%`.padEnd(10) + ' | ' +
        `${row.avg_load_ms}ms`.padEnd(10) + ' | ' +
        `${row.median_load_ms}ms`
      );
    });
    
    // 3. 에러 타입별 분석
    console.log('\n\n3️⃣ 에러 타입별 분석');
    console.log('-'.repeat(100));
    
    const errorQuery = `
      SELECT 
        error_type,
        COUNT(*) as error_count,
        ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM v2_page_load_metrics WHERE error_type IS NOT NULL AND created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days') * 100, 1) as percentage,
        COUNT(DISTINCT agent) as affected_agents
      FROM v2_page_load_metrics
      WHERE error_type IS NOT NULL
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
      GROUP BY error_type
      ORDER BY error_count DESC
    `;
    
    const errorResult = await dbService.query(errorQuery);
    
    console.log('Error Type'.padEnd(15) + ' | ' +
      'Count'.padEnd(8) + ' | ' +
      'Percent'.padEnd(8) + ' | ' +
      'Agents'
    );
    console.log('-'.repeat(50));
    
    errorResult.rows.forEach(row => {
      console.log(
        row.error_type.padEnd(15) + ' | ' +
        row.error_count.toString().padEnd(8) + ' | ' +
        `${row.percentage}%`.padEnd(8) + ' | ' +
        row.affected_agents
      );
    });
    
    // 4. 프록시별 성능 (사용 시)
    console.log('\n\n4️⃣ 프록시별 성능 분석');
    console.log('-'.repeat(100));
    
    const proxyQuery = `
      SELECT 
        COALESCE(proxy_used, 'NO_PROXY') as proxy,
        COUNT(*) as loads,
        ROUND(COUNT(CASE WHEN load_success = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as success_rate,
        ROUND(COUNT(CASE WHEN is_blocked = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as block_rate,
        ROUND(AVG(CASE WHEN load_duration_ms > 0 THEN load_duration_ms END), 0) as avg_load_ms
      FROM v2_page_load_metrics
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
      GROUP BY proxy_used
      HAVING COUNT(*) > 5
      ORDER BY loads DESC
      LIMIT 10
    `;
    
    const proxyResult = await dbService.query(proxyQuery);
    
    if (proxyResult.rows.length > 0) {
      console.log('Proxy'.padEnd(30) + ' | ' +
        'Loads'.padEnd(7) + ' | ' +
        'Success%'.padEnd(10) + ' | ' +
        'Block%'.padEnd(8) + ' | ' +
        'Avg Load'
      );
      console.log('-'.repeat(70));
      
      proxyResult.rows.forEach(row => {
        const proxyDisplay = row.proxy.length > 30 ? row.proxy.substring(0, 27) + '...' : row.proxy;
        console.log(
          proxyDisplay.padEnd(30) + ' | ' +
          row.loads.toString().padEnd(7) + ' | ' +
          `${row.success_rate}%`.padEnd(10) + ' | ' +
          `${row.block_rate}%`.padEnd(8) + ' | ' +
          `${row.avg_load_ms}ms`
        );
      });
    } else {
      console.log('프록시 사용 데이터가 충분하지 않습니다.');
    }
    
    // 5. 시간대별 성능 (선택적)
    if (showDetails) {
      console.log('\n\n5️⃣ 시간대별 성능 추이');
      console.log('-'.repeat(100));
      
      const hourlyQuery = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as loads,
          ROUND(COUNT(CASE WHEN load_success = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as success_rate,
          ROUND(AVG(CASE WHEN load_duration_ms > 0 THEN load_duration_ms END), 0) as avg_load_ms
        FROM v2_page_load_metrics
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 days'
        GROUP BY hour
        ORDER BY hour DESC
        LIMIT 24
      `;
      
      const hourlyResult = await dbService.query(hourlyQuery);
      
      console.log('Time'.padEnd(20) + ' | ' +
        'Loads'.padEnd(7) + ' | ' +
        'Success%'.padEnd(10) + ' | ' +
        'Avg Load'
      );
      console.log('-'.repeat(50));
      
      hourlyResult.rows.forEach(row => {
        console.log(
          new Date(row.hour).toLocaleString('ko-KR').padEnd(20) + ' | ' +
          row.loads.toString().padEnd(7) + ' | ' +
          `${row.success_rate}%`.padEnd(10) + ' | ' +
          `${row.avg_load_ms}ms`
        );
      });
    }
    
    // 6. 핵심 인사이트
    console.log('\n\n💡 핵심 인사이트');
    console.log('-'.repeat(100));
    
    // 타임아웃이지만 성공한 비율
    const timeoutSuccessRate = summary.load_timeout > 0 
      ? (summary.timeout_but_success / summary.load_timeout * 100).toFixed(1)
      : 0;
    
    console.log(`• Load 타임아웃 중 ${timeoutSuccessRate}%는 실제로 상품 페이지 이동에 성공했습니다.`);
    
    // DOM vs Load 시간 차이
    const loadDomRatio = summary.avg_load_ms / summary.avg_dom_ms;
    console.log(`• 전체 로딩 시간은 DOM 로딩 시간의 ${loadDomRatio.toFixed(1)}배입니다.`);
    
    // 차단률이 높은 에이전트
    const highBlockAgents = agentResult.rows.filter(r => r.block_rate > 10);
    if (highBlockAgents.length > 0) {
      console.log(`• 차단률이 10% 이상인 에이전트: ${highBlockAgents.map(a => a.agent).join(', ')}`);
    }
    
  } catch (error) {
    console.error('분석 중 오류:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 옵션 처리
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--agent' && args[index + 1]) {
    options.agent = args[index + 1];
  } else if (arg === '--days' && args[index + 1]) {
    options.days = parseInt(args[index + 1]);
  } else if (arg === '--details') {
    options.showDetails = true;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-page-load-performance.js [옵션]

옵션:
  --agent <에이전트명>  특정 에이전트만 분석
  --days <일수>        분석 기간 (기본: 7일)
  --details           상세 분석 포함 (시간대별 추이)
  --help             도움말 표시

예시:
  node analyze-page-load-performance.js --days 30
  node analyze-page-load-performance.js --agent win11 --details
`);
  process.exit(0);
}

// 실행
analyzePageLoadPerformance(options);