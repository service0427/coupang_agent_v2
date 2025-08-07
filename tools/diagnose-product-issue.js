/**
 * 상품이 안 나타나는 문제 진단 도구
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function diagnoseProductIssue() {
  console.log('🔍 상품 안 나타나는 문제 진단 시작\n');
  
  try {
    // 1. 최근 실행 결과 분석
    console.log('📊 최근 실행 결과 분석');
    console.log('─'.repeat(50));
    
    const recentExecutions = await dbServiceV2.query(`
      SELECT 
        id, started_at, keyword, product_code, agent,
        final_status, overall_success, 
        stage2_find_status, stage2_total_products, stage2_pages_searched,
        last_successful_stage, critical_error_message
      FROM v2_execution_logs 
      WHERE started_at >= NOW() - INTERVAL '1 hour'
      ORDER BY started_at DESC
      LIMIT 10
    `);
    
    console.log(`최근 1시간 실행: ${recentExecutions.rows.length}개`);
    
    let stage2FailCount = 0;
    let noProductsCount = 0;
    let successCount = 0;
    
    recentExecutions.rows.forEach(row => {
      const timeAgo = Math.round((Date.now() - new Date(row.started_at)) / (1000 * 60));
      const status = row.overall_success ? '✅' : '❌';
      
      console.log(`  ${status} ID ${row.id} (${timeAgo}분 전): ${row.keyword}`);
      console.log(`     최종상태: ${row.final_status} | 단계: ${row.last_successful_stage} | 상품수: ${row.stage2_total_products || 0}`);
      
      if (row.stage2_find_status === 'failed') stage2FailCount++;
      if (row.stage2_total_products === 0) noProductsCount++;
      if (row.overall_success) successCount++;
      
      if (row.critical_error_message) {
        console.log(`     오류: ${row.critical_error_message.substring(0, 100)}...`);
      }
      console.log('');
    });
    
    console.log(`📈 통계:`)
    console.log(`   성공: ${successCount}개`);
    console.log(`   2단계 실패: ${stage2FailCount}개`);
    console.log(`   상품 0개: ${noProductsCount}개`);
    
    // 2. 최근 에러 패턴 분석
    console.log('\n🚨 최근 에러 패턴 분석');
    console.log('─'.repeat(50));
    
    const recentErrors = await dbServiceV2.query(`
      SELECT 
        error_code, error_message, agent, keyword,
        occurred_at
      FROM v2_error_logs 
      WHERE occurred_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY occurred_at DESC
      LIMIT 5
    `);
    
    if (recentErrors.rows.length > 0) {
      console.log(`최근 30분간 에러: ${recentErrors.rows.length}개`);
      recentErrors.rows.forEach(row => {
        const timeAgo = Math.round((Date.now() - new Date(row.occurred_at)) / (1000 * 60));
        console.log(`  • ${row.error_code} (${timeAgo}분 전): ${row.keyword}`);
        console.log(`    ${row.error_message.substring(0, 80)}...`);
      });
    } else {
      console.log('✅ 최근 30분간 에러 없음');
    }
    
    // 3. 상품 추적 데이터 분석
    console.log('\n📦 상품 추적 데이터 분석');
    console.log('─'.repeat(50));
    
    const productTracking = await dbServiceV2.query(`
      SELECT 
        page_number, products_in_page, target_found, 
        page_load_success, product_list_found, error_message,
        (SELECT keyword FROM v2_execution_logs WHERE id = pt.execution_id) as keyword
      FROM v2_product_tracking pt
      WHERE pt.execution_id IN (
        SELECT id FROM v2_execution_logs 
        WHERE started_at >= NOW() - INTERVAL '30 minutes'
      )
      ORDER BY pt.execution_id DESC, pt.page_number
      LIMIT 10
    `);
    
    if (productTracking.rows.length > 0) {
      console.log(`최근 30분간 상품 추적: ${productTracking.rows.length}개`);
      
      let pageLoadFailures = 0;
      let productListNotFound = 0;
      let zeroCounts = 0;
      
      productTracking.rows.forEach(row => {
        console.log(`  페이지 ${row.page_number}: ${row.keyword}`);
        console.log(`    상품수: ${row.products_in_page} | 타겟발견: ${row.target_found ? '✅' : '❌'}`);
        console.log(`    페이지로드: ${row.page_load_success ? '✅' : '❌'} | 상품목록: ${row.product_list_found ? '✅' : '❌'}`);
        
        if (!row.page_load_success) pageLoadFailures++;
        if (!row.product_list_found) productListNotFound++;
        if (row.products_in_page === 0) zeroCounts++;
        
        if (row.error_message) {
          console.log(`    오류: ${row.error_message}`);
        }
        console.log('');
      });
      
      console.log(`📊 추적 통계:`);
      console.log(`   페이지 로드 실패: ${pageLoadFailures}개`);
      console.log(`   상품 목록 못찾음: ${productListNotFound}개`);
      console.log(`   상품 수 0개: ${zeroCounts}개`);
      
    } else {
      console.log('⚠️ 최근 30분간 상품 추적 데이터 없음');
    }
    
    // 4. 키워드별 성능 분석
    console.log('\n🔑 키워드별 성능 분석');
    console.log('─'.repeat(50));
    
    const keywordStats = await dbServiceV2.query(`
      SELECT 
        keyword, product_code,
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN overall_success = true THEN 1 END) as successes,
        AVG(stage2_total_products) as avg_products,
        MAX(started_at) as last_attempt
      FROM v2_execution_logs 
      WHERE started_at >= NOW() - INTERVAL '2 hours'
      GROUP BY keyword, product_code
      ORDER BY total_attempts DESC
    `);
    
    keywordStats.rows.forEach(row => {
      const successRate = row.total_attempts > 0 ? 
        ((row.successes / row.total_attempts) * 100).toFixed(1) : 0;
      const avgProducts = row.avg_products ? parseFloat(row.avg_products).toFixed(1) : 0;
      
      console.log(`  ${row.keyword} (${row.product_code})`);
      console.log(`    시도: ${row.total_attempts}회 | 성공률: ${successRate}% | 평균상품수: ${avgProducts}`);
    });
    
    // 5. 진단 결론
    console.log('\n🔍 진단 결론');
    console.log('='.repeat(50));
    
    if (noProductsCount > recentExecutions.rows.length * 0.5) {
      console.log('❌ 문제 발견: 상품이 전혀 추출되지 않음');
      console.log('   가능한 원인:');
      console.log('   1. 쿠팡 페이지 구조 변경 (셀렉터 문제)');
      console.log('   2. 봇 탐지로 인한 빈 페이지 응답');
      console.log('   3. 네트워크 최적화 설정으로 중요 리소스 차단');
    } else if (stage2FailCount > successCount) {
      console.log('⚠️ 문제 발견: 2단계(상품 찾기) 실패 다수');
      console.log('   가능한 원인:');
      console.log('   1. 상품 목록 추출 로직 문제');
      console.log('   2. 페이지 로딩 타이밍 이슈');
    } else if (successCount === 0) {
      console.log('🚨 심각한 문제: 모든 실행 실패');
      console.log('   즉시 확인 필요');
    } else {
      console.log('✅ 전반적으로 정상 작동 중');
      console.log(`   성공률: ${((successCount / recentExecutions.rows.length) * 100).toFixed(1)}%`);
    }
    
  } catch (error) {
    console.error('❌ 진단 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

diagnoseProductIssue();