const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzeTrackingLogs() {
  try {
    console.log('=== 추적 로그 분석: ID 25-29번 비교 ===\n');
    
    // 1. 기본 키워드 정보
    const keywordResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, success_count, fail_count
      FROM v2_test_keywords 
      WHERE id BETWEEN 25 AND 29
      ORDER BY id
    `);
    
    console.log('📋 분석 대상 키워드:');
    keywordResult.rows.forEach(row => {
      console.log(`ID ${row.id}: ${row.keyword} (에이전트: ${row.agent}, 성공: ${row.success_count})`);
    });
    
    // 2. v2_execution_logs에서 상세 실행 로그 분석
    console.log('\n📊 v2_execution_logs 분석:');
    const execResult = await dbServiceV2.query(`
      SELECT keyword_id, final_status, COUNT(*) as count,
             AVG(CASE WHEN stage4_cart_status = 'success' THEN 1 ELSE 0 END) as cart_success_rate
      FROM v2_execution_logs 
      WHERE keyword_id BETWEEN 25 AND 29
      GROUP BY keyword_id, final_status
      ORDER BY keyword_id, final_status
    `);
    
    const statusByKeyword = {};
    execResult.rows.forEach(row => {
      if (!statusByKeyword[row.keyword_id]) statusByKeyword[row.keyword_id] = {};
      statusByKeyword[row.keyword_id][row.final_status] = {
        count: row.count,
        cart_success_rate: parseFloat(row.cart_success_rate).toFixed(2)
      };
    });
    
    Object.entries(statusByKeyword).forEach(([keywordId, statuses]) => {
      console.log(`\nID ${keywordId}:`);
      Object.entries(statuses).forEach(([status, data]) => {
        console.log(`  ${status}: ${data.count}회 (카트성공률: ${data.cart_success_rate})`);
      });
    });
    
    // 3. v2_product_tracking에서 상품 추적 분석 (v2_action_log는 빈 테이블)
    console.log('\n🛍️ v2_product_tracking 상품 추적 분석:');
    const productResult = await dbServiceV2.query(`
      SELECT el.keyword_id, pt.target_found, pt.page_load_success, pt.product_list_found, COUNT(*) as count
      FROM v2_product_tracking pt
      JOIN v2_execution_logs el ON pt.execution_id = el.id
      WHERE el.keyword_id BETWEEN 25 AND 29
      GROUP BY el.keyword_id, pt.target_found, pt.page_load_success, pt.product_list_found
      ORDER BY el.keyword_id, pt.target_found DESC, pt.page_load_success DESC
    `);
    
    const productsByKeyword = {};
    productResult.rows.forEach(row => {
      if (!productsByKeyword[row.keyword_id]) productsByKeyword[row.keyword_id] = {};
      const key = `target_${row.target_found}_load_${row.page_load_success}_list_${row.product_list_found}`;
      productsByKeyword[row.keyword_id][key] = row.count;
    });
    
    Object.entries(productsByKeyword).forEach(([keywordId, products]) => {
      console.log(`\nID ${keywordId} 상품 추적:`);
      Object.entries(products).forEach(([statusKey, count]) => {
        console.log(`  ${statusKey}: ${count}회`);
      });
    });
    
    // 4. 성능 저하 키워드 (25번)와 정상 키워드 (26-29번) 비교
    console.log('\n🔍 성능 저하 vs 정상 키워드 비교:');
    
    // 성능 저하 그룹 (25번)과 정상 그룹 (26-29번) 비교
    const comparisonResult = await dbServiceV2.query(`
      SELECT 
        CASE WHEN el.keyword_id = 25 THEN '성능저하(ID25)' ELSE '정상그룹(26-29)' END as group_type,
        el.final_status,
        COUNT(*) as execution_count,
        AVG(CASE WHEN el.stage4_cart_status = 'success' THEN 1 ELSE 0 END) as cart_success_rate,
        AVG(el.stage1_duration_ms) as avg_stage1_duration,
        AVG(el.stage3_duration_ms) as avg_stage3_duration,
        AVG(el.duration_ms) as avg_total_duration
      FROM v2_execution_logs el
      WHERE el.keyword_id IN (25, 26, 27, 28, 29)
      GROUP BY 
        CASE WHEN el.keyword_id = 25 THEN '성능저하(ID25)' ELSE '정상그룹(26-29)' END,
        el.final_status
      ORDER BY group_type, el.final_status
    `);
    
    comparisonResult.rows.forEach(row => {
      console.log(`\n${row.group_type} - ${row.final_status}:`);
      console.log(`  실행 횟수: ${row.execution_count}`);
      console.log(`  카트 성공률: ${(parseFloat(row.cart_success_rate) * 100).toFixed(1)}%`);
      console.log(`  평균 검색시간: ${Math.round(row.avg_stage1_duration || 0)}ms`);
      console.log(`  평균 클릭시간: ${Math.round(row.avg_stage3_duration || 0)}ms`);
      console.log(`  평균 총시간: ${Math.round(row.avg_total_duration || 0)}ms`);
    });
    
    // 5. 단계별 실패 분석
    console.log('\n📈 단계별 성공률 분석:');
    const stageResult = await dbServiceV2.query(`
      SELECT 
        keyword_id,
        COUNT(*) as total_executions,
        COUNT(CASE WHEN stage1_search_status = 'success' THEN 1 END) as stage1_success,
        COUNT(CASE WHEN stage2_find_status = 'success' THEN 1 END) as stage2_success,
        COUNT(CASE WHEN stage3_click_status = 'success' THEN 1 END) as stage3_success,
        COUNT(CASE WHEN stage4_cart_status = 'success' THEN 1 END) as stage4_success,
        AVG(stage1_duration_ms) as avg_stage1_duration,
        AVG(stage2_duration_ms) as avg_stage2_duration,
        AVG(stage3_duration_ms) as avg_stage3_duration,
        AVG(stage4_duration_ms) as avg_stage4_duration
      FROM v2_execution_logs
      WHERE keyword_id BETWEEN 25 AND 29
      GROUP BY keyword_id
      ORDER BY keyword_id
    `);
    
    stageResult.rows.forEach(row => {
      console.log(`\nID ${row.keyword_id} 단계별 분석:`);
      console.log(`  총 실행: ${row.total_executions}회`);
      console.log(`  1단계(검색): ${((row.stage1_success/row.total_executions)*100).toFixed(1)}% (평균 ${Math.round(row.avg_stage1_duration || 0)}ms)`);
      console.log(`  2단계(찾기): ${((row.stage2_success/row.total_executions)*100).toFixed(1)}% (평균 ${Math.round(row.avg_stage2_duration || 0)}ms)`);
      console.log(`  3단계(클릭): ${((row.stage3_success/row.total_executions)*100).toFixed(1)}% (평균 ${Math.round(row.avg_stage3_duration || 0)}ms)`);
      console.log(`  4단계(카트): ${((row.stage4_success/row.total_executions)*100).toFixed(1)}% (평균 ${Math.round(row.avg_stage4_duration || 0)}ms)`);
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeTrackingLogs();