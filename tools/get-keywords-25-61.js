const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function getKeywords25to61() {
  try {
    // DB 데이터 조회
    const result = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, 
             success_count, fail_count, total_blocks as blockcount,
             optimization_config
      FROM v2_test_keywords 
      WHERE id >= 25 AND id <= 61
      ORDER BY id
    `);
    
    // 2025-08-06.md 파일 읽기
    const mdPath = path.join(__dirname, '..', '2025-08-06.md');
    const mdData = fs.readFileSync(mdPath, 'utf8');
    const mdLines = mdData.trim().split('\n');
    const mdKeywords = [];
    
    mdLines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        mdKeywords.push({
          keyword: parts[0].replace(/'/g, '').trim(),
          md_search: parseInt(parts[1].replace(/[',]/g, '')) || 0,
          md_exposure: parseInt(parts[2].replace(/[',]/g, '')) || 0,
          md_click: parseInt(parts[3].replace(/[',]/g, '')) || 0,
          md_cart: parseInt(parts[4].replace(/[',]/g, '')) || 0
        });
      }
    });
    
    console.log('ID | 키워드 | 에이전트 | cart | succ | fail | blockcount | main_allow | image_allow | img1a_allow | front_allow | static_allow | assets_allow | mercury_allow | ljc_allow | thumbnail_allow | md_search | md_exposure | md_click | md_cart');
    console.log('-'.repeat(200));
    
    result.rows.forEach(row => {
      // 키워드 매칭
      const mdMatch = mdKeywords.find(md => 
        md.keyword.toLowerCase().trim() === (row.keyword || '').toLowerCase().trim()
      );
      
      const mdSearch = mdMatch ? mdMatch.md_search.toString() : '-';
      const mdExposure = mdMatch ? mdMatch.md_exposure.toString() : '-';
      const mdClick = mdMatch ? mdMatch.md_click.toString() : '-';
      const mdCart = mdMatch ? mdMatch.md_cart.toString() : '-';
      
      // 매칭된 키워드에 별표 추가 (앞에)
      const keywordDisplay = mdMatch ? '*' + (row.keyword || '') : (row.keyword || '');
      
      // cart_click_enabled를 o/x로 변환
      const cartDisplay = row.cart_click_enabled === true ? 'o' : 
                         row.cart_click_enabled === false ? 'x' : '-';
      
      // optimization_config 파싱
      const optConfig = row.optimization_config || {};
      const mainAllow = JSON.stringify(optConfig.coupang_main_allow || []);
      const imageAllow = JSON.stringify(optConfig.image_cdn_allow || []);
      const img1aAllow = JSON.stringify(optConfig.img1a_cdn_allow || []);
      const frontAllow = JSON.stringify(optConfig.front_cdn_allow || []);
      const staticAllow = JSON.stringify(optConfig.static_cdn_allow || []);
      const assetsAllow = JSON.stringify(optConfig.assets_cdn_allow || []);
      const mercuryAllow = JSON.stringify(optConfig.mercury_allow || []);
      const ljcAllow = JSON.stringify(optConfig.ljc_allow || []);
      const thumbnailAllow = JSON.stringify(optConfig.thumbnail_cdn_allow || []);
      
      console.log(
        `${row.id.toString().padEnd(3)} | ${keywordDisplay.padEnd(30)} | ${(row.agent || '').padEnd(8)} | ${cartDisplay.padEnd(4)} | ${(row.success_count || 0).toString().padEnd(4)} | ${(row.fail_count || 0).toString().padEnd(4)} | ${(row.blockcount || 0).toString().padEnd(10)} | ${mainAllow.padEnd(10)} | ${imageAllow.padEnd(11)} | ${img1aAllow.padEnd(11)} | ${frontAllow.padEnd(11)} | ${staticAllow.padEnd(12)} | ${assetsAllow.padEnd(12)} | ${mercuryAllow.padEnd(13)} | ${ljcAllow.padEnd(9)} | ${thumbnailAllow.padEnd(15)} | ${mdSearch.padEnd(9)} | ${mdExposure.padEnd(11)} | ${mdClick.padEnd(8)} | ${mdCart}`
      );
    });
    
    console.log(`\n총 ${result.rows.length}개 키워드`);
    console.log(`MD 파일 매칭: ${result.rows.filter(row => mdKeywords.find(md => md.keyword.toLowerCase().trim() === (row.keyword || '').toLowerCase().trim())).length}개`);
    
  } catch (error) {
    console.error('오류 발생:', error);
  } finally {
    await dbServiceV2.close();
  }
}

getKeywords25to61();