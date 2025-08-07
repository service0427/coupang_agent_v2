const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzeCartZeroPattern() {
  try {
    console.log('=== Assets_Allow 차단 + MD 담기=0 패턴 분석 ===\n');
    
    // 1. MD 파일에서 담기=0인 키워드들 찾기
    const mdPath = path.join(__dirname, '..', '2025-08-06.md');
    const mdData = fs.readFileSync(mdPath, 'utf8');
    const mdLines = mdData.trim().split('\n');
    const mdKeywords = [];
    
    mdLines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const cart = parseInt(parts[4].replace(/[',]/g, '')) || 0;
        if (cart === 0) { // 담기가 0인 것들만
          mdKeywords.push({
            keyword: parts[0].replace(/'/g, '').trim(),
            search: parseInt(parts[1].replace(/[',]/g, '')) || 0,
            exposure: parseInt(parts[2].replace(/[',]/g, '')) || 0,
            click: parseInt(parts[3].replace(/[',]/g, '')) || 0,
            cart: cart
          });
        }
      }
    });
    
    console.log(`MD 파일에서 담기=0인 키워드: ${mdKeywords.length}개\n`);
    
    // 2. DB에서 해당 키워드들 정보 가져오기
    const keywordResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, success_count, fail_count,
             optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id >= 25 AND id <= 61
      ORDER BY id
    `);
    
    // 3. MD와 DB 매칭하여 Assets_Allow가 차단인 것들 분석
    const assetsBlockedZeroCart = [];
    
    keywordResult.rows.forEach(dbRow => {
      // MD와 매칭
      const mdMatch = mdKeywords.find(md => 
        md.keyword.toLowerCase().trim() === (dbRow.keyword || '').toLowerCase().trim()
      );
      
      if (mdMatch) {
        const config = dbRow.optimization_config || {};
        const assetsAllow = config.assets_cdn_allow || [];
        
        // Assets_Allow가 차단(빈 배열)인 경우
        if (Array.isArray(assetsAllow) && assetsAllow.length === 0) {
          assetsBlockedZeroCart.push({
            id: dbRow.id,
            keyword: dbRow.keyword,
            agent: dbRow.agent,
            cart_enabled: dbRow.cart_click_enabled,
            md_data: mdMatch,
            config: config,
            db_success: dbRow.success_count,
            db_fail: dbRow.fail_count
          });
        }
      }
    });
    
    console.log(`Assets_Allow 차단 + MD 담기=0: ${assetsBlockedZeroCart.length}개\n`);
    
    // 4. 이들의 공통 패턴 분석
    console.log('🔍 Assets_Allow 차단 + MD 담기=0 키워드들의 상세 분석:\n');
    
    // 에이전트별 분석
    const agentGroups = {};
    const imageAllowGroups = {};
    const img1aAllowGroups = {};
    const frontAllowGroups = {};
    const staticAllowGroups = {};
    const mercuryAllowGroups = {};
    const ljcAllowGroups = {};
    const thumbnailAllowGroups = {};
    const mainAllowGroups = {};
    
    assetsBlockedZeroCart.forEach(item => {
      const config = item.config;
      
      // 에이전트별
      if (!agentGroups[item.agent]) agentGroups[item.agent] = [];
      agentGroups[item.agent].push(item.id);
      
      // 각 설정별 그룹화
      const imageKey = JSON.stringify(config.image_cdn_allow || []);
      const img1aKey = JSON.stringify(config.img1a_cdn_allow || []);
      const frontKey = JSON.stringify(config.front_cdn_allow || []);
      const staticKey = JSON.stringify(config.static_cdn_allow || []);
      const mercuryKey = JSON.stringify(config.mercury_allow || []);
      const ljcKey = JSON.stringify(config.ljc_allow || []);
      const thumbnailKey = JSON.stringify(config.thumbnail_cdn_allow || []);
      const mainKey = JSON.stringify(config.coupang_main_allow || []);
      
      if (!imageAllowGroups[imageKey]) imageAllowGroups[imageKey] = [];
      if (!img1aAllowGroups[img1aKey]) img1aAllowGroups[img1aKey] = [];
      if (!frontAllowGroups[frontKey]) frontAllowGroups[frontKey] = [];
      if (!staticAllowGroups[staticKey]) staticAllowGroups[staticKey] = [];
      if (!mercuryAllowGroups[mercuryKey]) mercuryAllowGroups[mercuryKey] = [];
      if (!ljcAllowGroups[ljcKey]) ljcAllowGroups[ljcKey] = [];
      if (!thumbnailAllowGroups[thumbnailKey]) thumbnailAllowGroups[thumbnailKey] = [];
      if (!mainAllowGroups[mainKey]) mainAllowGroups[mainKey] = [];
      
      imageAllowGroups[imageKey].push(item.id);
      img1aAllowGroups[img1aKey].push(item.id);
      frontAllowGroups[frontKey].push(item.id);
      staticAllowGroups[staticKey].push(item.id);
      mercuryAllowGroups[mercuryKey].push(item.id);
      ljcAllowGroups[ljcKey].push(item.id);
      thumbnailAllowGroups[thumbnailKey].push(item.id);
      mainAllowGroups[mainKey].push(item.id);
      
      console.log(`ID ${item.id}: ${item.keyword.substring(0, 40)}...`);
      console.log(`  에이전트: ${item.agent}, Cart 활성화: ${item.cart_enabled}`);
      console.log(`  MD 데이터 - 검색:${item.md_data.search}, 노출:${item.md_data.exposure}, 클릭:${item.md_data.click}, 담기:${item.md_data.cart}`);
      console.log(`  DB 성공: ${item.db_success}, DB 실패: ${item.db_fail}`);
      console.log(`  Main_Allow: ${mainKey}`);
      console.log(`  Image_Allow: ${imageKey}`);
      console.log(`  Img1a_Allow: ${img1aKey}`);
      console.log(`  Front_Allow: ${frontKey}`);
      console.log(`  Mercury_Allow: ${mercuryKey}`);
      console.log(`  LJC_Allow: ${ljcKey}`);
      console.log('');
    });
    
    // 5. 공통 패턴 요약
    console.log('📊 공통 패턴 요약:');
    console.log(`\n🤖 에이전트별 분포:`);
    Object.entries(agentGroups).forEach(([agent, ids]) => {
      console.log(`  ${agent}: [${ids.join(', ')}] (${ids.length}개)`);
    });
    
    console.log(`\n🖼️  Image_Allow 패턴:`);
    Object.entries(imageAllowGroups).forEach(([pattern, ids]) => {
      console.log(`  ${pattern}: [${ids.join(', ')}] (${ids.length}개)`);
    });
    
    console.log(`\n🎨 Front_Allow 패턴:`);
    Object.entries(frontAllowGroups).forEach(([pattern, ids]) => {
      console.log(`  ${pattern}: [${ids.join(', ')}] (${ids.length}개)`);
    });
    
    console.log(`\n⚡ Mercury_Allow 패턴:`);
    Object.entries(mercuryAllowGroups).forEach(([pattern, ids]) => {
      console.log(`  ${pattern}: [${ids.join(', ')}] (${ids.length}개)`);
    });
    
    console.log(`\n🌐 Main_Allow 패턴:`);
    Object.entries(mainAllowGroups).forEach(([pattern, ids]) => {
      console.log(`  ${pattern}: [${ids.join(', ')}] (${ids.length}개)`);
    });
    
    // 6. 실행 로그 확인으로 실제 카트 성공 여부 검증
    const problemIds = assetsBlockedZeroCart.map(item => item.id);
    if (problemIds.length > 0) {
      const logResult = await dbServiceV2.query(`
        SELECT keyword_id, 
               COUNT(*) as total_executions,
               SUM(CASE WHEN stage4_cart_status = 'success' THEN 1 ELSE 0 END) as cart_success,
               array_agg(DISTINCT stage4_cart_status) as cart_statuses
        FROM v2_execution_logs 
        WHERE keyword_id IN (${problemIds.join(',')})
          AND completed_at >= '2025-08-06 00:00:00' 
          AND completed_at < '2025-08-07 00:00:00'
        GROUP BY keyword_id
        ORDER BY keyword_id
      `);
      
      console.log(`\n✅ 실제 DB 카트 성공 확인:`);
      logResult.rows.forEach(row => {
        const item = assetsBlockedZeroCart.find(x => x.id === row.keyword_id);
        const keyword = item ? item.keyword.substring(0, 30) : 'Unknown';
        console.log(`  ID ${row.keyword_id} (${keyword}...): 카트 성공 ${row.cart_success}/${row.total_executions}회`);
      });
    }
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeCartZeroPattern();