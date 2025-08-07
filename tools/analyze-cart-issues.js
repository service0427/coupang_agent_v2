const dbServiceV2 = require('../lib/services/db-service-v2');

async function analyzeCartIssues() {
  try {
    console.log('=== 카트 담기 이슈 분석 (ID: 28,29,30,38,39,40,48,49,50,52) ===\n');
    
    const problemIds = [28,29,30,38,39,40,48,49,50,52];
    
    // 1. 키워드 정보 확인
    const keywordResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, success_count, fail_count,
             optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id IN (${problemIds.join(',')})
      ORDER BY id
    `);
    
    console.log('🔍 키워드 기본 정보:');
    keywordResult.rows.forEach(row => {
      console.log(`ID ${row.id}: ${row.keyword}`);
      console.log(`  에이전트: ${row.agent}, Cart 활성화: ${row.cart_click_enabled}`);
      console.log(`  성공: ${row.success_count}, 실패: ${row.fail_count}`);
      console.log(`  생성일: ${row.created_at}`);
      console.log('');
    });
    
    // 2. 실행 로그 상세 확인 (2025-08-06)
    const logResult = await dbServiceV2.query(`
      SELECT keyword_id, 
             COUNT(*) as total_executions,
             SUM(CASE WHEN stage4_cart_status = 'success' THEN 1 ELSE 0 END) as cart_success,
             SUM(CASE WHEN stage4_cart_status = 'failure' THEN 1 ELSE 0 END) as cart_failure,
             SUM(CASE WHEN stage4_cart_status = 'timeout' THEN 1 ELSE 0 END) as cart_timeout,
             SUM(CASE WHEN stage3_click_status = 'success' THEN 1 ELSE 0 END) as click_success,
             SUM(CASE WHEN stage1_search_status = 'success' THEN 1 ELSE 0 END) as search_success,
             MAX(completed_at) as last_execution,
             array_agg(DISTINCT stage4_cart_status) as cart_statuses
      FROM v2_execution_logs 
      WHERE keyword_id IN (${problemIds.join(',')})
        AND completed_at >= '2025-08-06 00:00:00' 
        AND completed_at < '2025-08-07 00:00:00'
      GROUP BY keyword_id
      ORDER BY keyword_id
    `);
    
    console.log('📊 2025-08-06 실행 로그 분석:');
    logResult.rows.forEach(row => {
      console.log(`ID ${row.keyword_id}: 총 ${row.total_executions}회 실행`);
      console.log(`  클릭 성공: ${row.click_success}, 검색 성공: ${row.search_success}`);
      console.log(`  카트 성공: ${row.cart_success}, 실패: ${row.cart_failure}, 타임아웃: ${row.cart_timeout}`);
      console.log(`  카트 상태들: ${row.cart_statuses}`);
      console.log(`  마지막 실행: ${row.last_execution}`);
      console.log('');
    });
    
    // 3. optimization_config 패턴 분석
    console.log('⚙️  Optimization Config 패턴 분석:');
    keywordResult.rows.forEach(row => {
      const config = row.optimization_config || {};
      console.log(`ID ${row.id}: ${row.keyword.substring(0, 30)}...`);
      console.log(`  Main_Allow: ${JSON.stringify(config.coupang_main_allow || [])}`);
      console.log(`  Image_Allow: ${JSON.stringify(config.image_cdn_allow || [])}`);
      console.log(`  Img1a_Allow: ${JSON.stringify(config.img1a_cdn_allow || [])}`);
      console.log(`  Front_Allow: ${JSON.stringify(config.front_cdn_allow || [])}`);
      console.log(`  Static_Allow: ${JSON.stringify(config.static_cdn_allow || [])}`);
      console.log(`  Assets_Allow: ${JSON.stringify(config.assets_cdn_allow || [])}`);
      console.log(`  Mercury_Allow: ${JSON.stringify(config.mercury_allow || [])}`);
      console.log(`  LJC_Allow: ${JSON.stringify(config.ljc_allow || [])}`);
      console.log(`  Thumbnail_Allow: ${JSON.stringify(config.thumbnail_cdn_allow || [])}`);
      console.log('');
    });
    
    // 4. 공통 패턴 찾기
    console.log('🔍 공통 패턴 분석:');
    const configs = keywordResult.rows.map(row => ({
      id: row.id,
      config: row.optimization_config || {}
    }));
    
    const patterns = {
      main_allow: {},
      image_allow: {},
      img1a_allow: {},
      front_allow: {},
      static_allow: {},
      assets_allow: {},
      mercury_allow: {},
      ljc_allow: {},
      thumbnail_allow: {}
    };
    
    configs.forEach(({id, config}) => {
      const mainKey = JSON.stringify(config.coupang_main_allow || []);
      const imageKey = JSON.stringify(config.image_cdn_allow || []);
      const img1aKey = JSON.stringify(config.img1a_cdn_allow || []);
      const frontKey = JSON.stringify(config.front_cdn_allow || []);
      const staticKey = JSON.stringify(config.static_cdn_allow || []);
      const assetsKey = JSON.stringify(config.assets_cdn_allow || []);
      const mercuryKey = JSON.stringify(config.mercury_allow || []);
      const ljcKey = JSON.stringify(config.ljc_allow || []);
      const thumbnailKey = JSON.stringify(config.thumbnail_cdn_allow || []);
      
      if (!patterns.main_allow[mainKey]) patterns.main_allow[mainKey] = [];
      if (!patterns.image_allow[imageKey]) patterns.image_allow[imageKey] = [];
      if (!patterns.img1a_allow[img1aKey]) patterns.img1a_allow[img1aKey] = [];
      if (!patterns.front_allow[frontKey]) patterns.front_allow[frontKey] = [];
      if (!patterns.static_allow[staticKey]) patterns.static_allow[staticKey] = [];
      if (!patterns.assets_allow[assetsKey]) patterns.assets_allow[assetsKey] = [];
      if (!patterns.mercury_allow[mercuryKey]) patterns.mercury_allow[mercuryKey] = [];
      if (!patterns.ljc_allow[ljcKey]) patterns.ljc_allow[ljcKey] = [];
      if (!patterns.thumbnail_allow[thumbnailKey]) patterns.thumbnail_allow[thumbnailKey] = [];
      
      patterns.main_allow[mainKey].push(id);
      patterns.image_allow[imageKey].push(id);
      patterns.img1a_allow[img1aKey].push(id);
      patterns.front_allow[frontKey].push(id);
      patterns.static_allow[staticKey].push(id);
      patterns.assets_allow[assetsKey].push(id);
      patterns.mercury_allow[mercuryKey].push(id);
      patterns.ljc_allow[ljcKey].push(id);
      patterns.thumbnail_allow[thumbnailKey].push(id);
    });
    
    Object.entries(patterns).forEach(([key, valueMap]) => {
      console.log(`${key.toUpperCase()}:`);
      Object.entries(valueMap).forEach(([value, ids]) => {
        console.log(`  ${value}: [${ids.join(', ')}]`);
      });
      console.log('');
    });
    
    // 5. 카트 실패 패턴 요약
    console.log('📋 카트 실패 패턴 요약:');
    const cartFailures = logResult.rows.filter(row => row.cart_success === 0);
    console.log(`총 ${cartFailures.length}개 키워드에서 카트 담기 0건`);
    cartFailures.forEach(row => {
      const keyword = keywordResult.rows.find(k => k.id === row.keyword_id);
      console.log(`  ID ${row.keyword_id}: ${keyword ? keyword.keyword.substring(0, 40) : 'Unknown'}`);
      console.log(`    클릭 성공: ${row.click_success}/${row.total_executions}, 카트 상태: ${row.cart_statuses}`);
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeCartIssues();