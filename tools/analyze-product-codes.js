const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzeProductCodes() {
  try {
    console.log('=== ID 25-29번 실제 클릭한 상품 코드 분석 ===\n');
    
    // 1. 각 키워드별로 실제 클릭한 상품 코드들 확인
    const productResult = await dbServiceV2.query(`
      SELECT 
        keyword_id, 
        keyword,
        product_code,
        item_id,
        vendor_item_id,
        COUNT(*) as click_count
      FROM v2_execution_logs 
      WHERE keyword_id BETWEEN 25 AND 29
        AND final_status = 'stage4_success'
        AND product_code IS NOT NULL
      GROUP BY keyword_id, keyword, product_code, item_id, vendor_item_id
      ORDER BY keyword_id, click_count DESC
    `);
    
    console.log('📋 실제 클릭한 상품 코드들:');
    let currentKeywordId = null;
    productResult.rows.forEach(row => {
      if (currentKeywordId !== row.keyword_id) {
        console.log(`\n🎯 ID ${row.keyword_id}: ${row.keyword}`);
        currentKeywordId = row.keyword_id;
      }
      console.log(`  상품코드: ${row.product_code} | 아이템ID: ${row.item_id} | 벤더ID: ${row.vendor_item_id} | 클릭: ${row.click_count}회`);
    });
    
    // 2. 기대했던 상품코드 8538335345와 실제 클릭 비교
    console.log('\n🔍 상품코드 8538335345 클릭 여부:');
    const targetProductResult = await dbServiceV2.query(`
      SELECT 
        keyword_id, 
        keyword,
        COUNT(CASE WHEN product_code = '8538335345' THEN 1 END) as target_clicks,
        COUNT(CASE WHEN product_code != '8538335345' OR product_code IS NULL THEN 1 END) as other_clicks,
        COUNT(*) as total_clicks
      FROM v2_execution_logs 
      WHERE keyword_id BETWEEN 25 AND 29
        AND final_status = 'stage4_success'
      GROUP BY keyword_id, keyword
      ORDER BY keyword_id
    `);
    
    targetProductResult.rows.forEach(row => {
      const targetRate = ((row.target_clicks / row.total_clicks) * 100).toFixed(1);
      const otherRate = ((row.other_clicks / row.total_clicks) * 100).toFixed(1);
      
      console.log(`\nID ${row.keyword_id}: ${row.keyword}`);
      console.log(`  8538335345 클릭: ${row.target_clicks}회 (${targetRate}%)`);
      console.log(`  다른 상품 클릭: ${row.other_clicks}회 (${otherRate}%)`);
      console.log(`  총 성공 클릭: ${row.total_clicks}회`);
      
      if (row.other_clicks > 0) {
        console.log(`  ⚠️ 예상과 다른 상품 클릭 발생!`);
      }
    });
    
    // 3. 다른 상품으로 클릭한 경우들의 상세 분석
    console.log('\n🚨 예상과 다른 상품으로 클릭한 경우들:');
    const wrongProductResult = await dbServiceV2.query(`
      SELECT 
        keyword_id, 
        keyword,
        product_code,
        item_id,
        vendor_item_id,
        stage2_product_rank,
        stage2_total_products,
        stage3_final_url,
        started_at
      FROM v2_execution_logs 
      WHERE keyword_id BETWEEN 25 AND 29
        AND final_status = 'stage4_success'
        AND (product_code != '8538335345' OR product_code IS NULL)
      ORDER BY keyword_id, started_at
      LIMIT 20
    `);
    
    if (wrongProductResult.rows.length > 0) {
      wrongProductResult.rows.forEach(row => {
        console.log(`\n❌ ID ${row.keyword_id}: ${row.keyword}`);
        console.log(`  실제 클릭한 상품: ${row.product_code || 'NULL'}`);
        console.log(`  아이템ID: ${row.item_id || 'NULL'}`);
        console.log(`  벤더ID: ${row.vendor_item_id || 'NULL'}`);
        console.log(`  검색 순위: ${row.stage2_product_rank}위 (총 ${row.stage2_total_products}개 상품)`);
        console.log(`  최종 URL: ${row.stage3_final_url ? row.stage3_final_url.substring(0, 80) + '...' : 'NULL'}`);
        console.log(`  실행 시간: ${row.started_at}`);
      });
    } else {
      console.log('모든 성공한 클릭이 예상 상품코드 8538335345입니다.');
    }
    
    // 4. 검색 순위별 클릭 패턴 분석
    console.log('\n📊 검색 순위별 클릭 패턴:');
    const rankResult = await dbServiceV2.query(`
      SELECT 
        keyword_id,
        keyword,
        stage2_product_rank,
        product_code,
        COUNT(*) as count
      FROM v2_execution_logs 
      WHERE keyword_id BETWEEN 25 AND 29
        AND final_status = 'stage4_success'
        AND stage2_product_rank IS NOT NULL
      GROUP BY keyword_id, keyword, stage2_product_rank, product_code
      ORDER BY keyword_id, stage2_product_rank
    `);
    
    let currentKeyword = null;
    rankResult.rows.forEach(row => {
      if (currentKeyword !== row.keyword_id) {
        console.log(`\nID ${row.keyword_id}: ${row.keyword}`);
        currentKeyword = row.keyword_id;
      }
      console.log(`  ${row.stage2_product_rank}위: ${row.product_code} (${row.count}회 클릭)`);
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeProductCodes();