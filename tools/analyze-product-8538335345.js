const dbServiceV2 = require('../lib/services/db-service-v2');

async function analyzeProduct8538335345() {
  try {
    console.log('=== 상품코드 8538335345 특이 현상 분석 ===\n');
    
    // 1. 해당 상품코드로 클릭한 모든 키워드들 확인
    const productResult = await dbServiceV2.query(`
      SELECT 
        keyword_id, 
        keyword,
        COUNT(*) as total_clicks,
        COUNT(CASE WHEN final_status = 'stage4_success' THEN 1 END) as success_clicks,
        AVG(stage1_duration_ms) as avg_search_time,
        AVG(stage3_duration_ms) as avg_click_time,
        AVG(duration_ms) as avg_total_time,
        COUNT(CASE WHEN stage2_product_rank = 1 THEN 1 END) as rank1_count,
        COUNT(CASE WHEN stage2_product_rank > 1 THEN 1 END) as rank_other_count
      FROM v2_execution_logs 
      WHERE product_code = '8538335345'
      GROUP BY keyword_id, keyword
      ORDER BY keyword_id
    `);
    
    console.log('📋 상품코드 8538335345를 클릭한 모든 키워드:');
    productResult.rows.forEach(row => {
      const successRate = ((row.success_clicks / row.total_clicks) * 100).toFixed(1);
      console.log(`\nID ${row.keyword_id}: ${row.keyword}`);
      console.log(`  총 클릭: ${row.total_clicks}회, 성공: ${row.success_clicks}회 (${successRate}%)`);
      console.log(`  평균 검색시간: ${Math.round(row.avg_search_time)}ms`);
      console.log(`  평균 클릭시간: ${Math.round(row.avg_click_time)}ms`);
      console.log(`  평균 총시간: ${Math.round(row.avg_total_time)}ms`);
      console.log(`  1위 발견: ${row.rank1_count}회, 기타 순위: ${row.rank_other_count}회`);
    });
    
    // 2. 다른 상품코드들과 비교 (26-29번 키워드들)
    console.log('\n🔍 정상 상품들과 성능 비교:');
    const comparisonResult = await dbServiceV2.query(`
      SELECT 
        product_code,
        COUNT(DISTINCT keyword_id) as keyword_count,
        COUNT(*) as total_clicks,
        COUNT(CASE WHEN final_status = 'stage4_success' THEN 1 END) as success_clicks,
        AVG(stage1_duration_ms) as avg_search_time,
        AVG(stage3_duration_ms) as avg_click_time,
        AVG(duration_ms) as avg_total_time,
        COUNT(CASE WHEN stage2_product_rank = 1 THEN 1 END) as rank1_count,
        COUNT(CASE WHEN stage2_product_rank > 1 THEN 1 END) as rank_other_count
      FROM v2_execution_logs 
      WHERE keyword_id BETWEEN 25 AND 29 
        AND final_status = 'stage4_success'
        AND product_code IS NOT NULL
      GROUP BY product_code
      ORDER BY product_code
    `);
    
    comparisonResult.rows.forEach(row => {
      const successRate = ((row.success_clicks / row.total_clicks) * 100).toFixed(1);
      const rank1Rate = ((row.rank1_count / row.total_clicks) * 100).toFixed(1);
      
      console.log(`\n상품코드: ${row.product_code}`);
      console.log(`  사용 키워드: ${row.keyword_count}개`);
      console.log(`  총 클릭: ${row.total_clicks}회, 성공: ${row.success_clicks}회 (${successRate}%)`);
      console.log(`  평균 검색시간: ${Math.round(row.avg_search_time)}ms`);
      console.log(`  평균 클릭시간: ${Math.round(row.avg_click_time)}ms`);
      console.log(`  평균 총시간: ${Math.round(row.avg_total_time)}ms`);
      console.log(`  1위 발견율: ${rank1Rate}% (${row.rank1_count}/${row.total_clicks}회)`);
      
      if (row.product_code === '8538335345') {
        console.log(`  🚨 문제 상품: 검색 순위가 불안정함`);
      }
    });
    
    // 3. 8538335345 상품의 검색 순위 패턴 상세 분석
    console.log('\n📊 상품 8538335345의 검색 순위 분포:');
    const rankResult = await dbServiceV2.query(`
      SELECT 
        stage2_product_rank,
        COUNT(*) as count,
        AVG(stage3_duration_ms) as avg_click_time
      FROM v2_execution_logs 
      WHERE product_code = '8538335345'
        AND stage2_product_rank IS NOT NULL
      GROUP BY stage2_product_rank
      ORDER BY stage2_product_rank
    `);
    
    rankResult.rows.forEach(row => {
      console.log(`  ${row.stage2_product_rank}위: ${row.count}회 (평균 클릭시간: ${Math.round(row.avg_click_time)}ms)`);
    });
    
    // 4. 시간대별 성능 변화 분석
    console.log('\n⏰ 상품 8538335345의 시간대별 성능:');
    const timeResult = await dbServiceV2.query(`
      SELECT 
        DATE_TRUNC('hour', started_at) as hour_bucket,
        COUNT(*) as executions,
        AVG(stage2_product_rank) as avg_rank,
        AVG(stage3_duration_ms) as avg_click_time
      FROM v2_execution_logs 
      WHERE product_code = '8538335345'
        AND started_at IS NOT NULL
        AND stage2_product_rank IS NOT NULL
      GROUP BY DATE_TRUNC('hour', started_at)
      ORDER BY hour_bucket
    `);
    
    timeResult.rows.forEach(row => {
      console.log(`  ${row.hour_bucket}: 실행 ${row.executions}회, 평균 순위 ${parseFloat(row.avg_rank).toFixed(1)}위, 클릭시간 ${Math.round(row.avg_click_time)}ms`);
    });
    
    // 5. 결론 및 추정 원인
    console.log('\n🎯 상품 8538335345 문제점 분석:');
    
    const summary = await dbServiceV2.query(`
      SELECT 
        COUNT(CASE WHEN stage2_product_rank = 1 THEN 1 END) as rank1_count,
        COUNT(CASE WHEN stage2_product_rank > 1 THEN 1 END) as rank_other_count,
        COUNT(*) as total_count,
        AVG(CASE WHEN stage2_product_rank = 1 THEN stage3_duration_ms END) as rank1_click_time,
        AVG(CASE WHEN stage2_product_rank > 1 THEN stage3_duration_ms END) as rank_other_click_time
      FROM v2_execution_logs 
      WHERE product_code = '8538335345'
        AND stage2_product_rank IS NOT NULL
    `);
    
    const row = summary.rows[0];
    const rank1_rate = ((row.rank1_count / row.total_count) * 100).toFixed(1);
    const rank_other_rate = ((row.rank_other_count / row.total_count) * 100).toFixed(1);
    
    console.log(`\n📈 검색 순위 안정성:`);
    console.log(`  1위 발견: ${row.rank1_count}회 (${rank1_rate}%)`);
    console.log(`  2위 이하: ${row.rank_other_count}회 (${rank_other_rate}%)`);
    console.log(`  1위일 때 클릭시간: ${Math.round(row.rank1_click_time)}ms`);
    console.log(`  2위 이하일 때 클릭시간: ${Math.round(row.rank_other_click_time)}ms`);
    
    console.log(`\n💡 추정 원인:`);
    console.log(`  1. 검색 순위 불안정 (1위 ${rank1_rate}% vs 다른 상품들 90%+ 1위)`);
    console.log(`  2. 순위가 낮을 때 더 긴 클릭시간 (${Math.round(row.rank_other_click_time - row.rank1_click_time)}ms 차이)`);
    console.log(`  3. 쿠팡 알고리즘에서 해당 상품의 노출 우선순위가 낮음`);
    console.log(`  4. 경쟁 상품들이 더 높은 순위를 차지`);
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeProduct8538335345();