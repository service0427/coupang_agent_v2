const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzePerformanceLoss() {
  try {
    console.log('=== ID 25, 46, 47번 성능 저하 원인 분석 ===\n');
    
    // 1. 해당 키워드들의 상세 정보 조회
    const result = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, success_count, fail_count, 
             total_blocks, optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id IN (25, 46, 47)
      ORDER BY id
    `);
    
    console.log('📋 기본 정보:');
    result.rows.forEach(row => {
      const config = row.optimization_config || {};
      console.log(`\nID ${row.id}: ${row.keyword}`);
      console.log(`  에이전트: ${row.agent}`);
      console.log(`  성공: ${row.success_count}, 실패: ${row.fail_count}`);
      console.log(`  차단량: ${row.total_blocks}`);
      console.log(`  카트 클릭: ${row.cart_click_enabled ? 'O' : 'X'}`);
      console.log(`  생성일: ${row.created_at}`);
    });
    
    // 2. MD 파일과 비교
    const mdPath = path.join(__dirname, '..', '2025-08-06.md');
    const mdData = fs.readFileSync(mdPath, 'utf8');
    const mdLines = mdData.trim().split('\n');
    const mdKeywords = [];
    
    mdLines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        mdKeywords.push({
          keyword: parts[0].replace(/'/g, '').trim(),
          search: parseInt(parts[1].replace(/[',]/g, '')) || 0,
          exposure: parseInt(parts[2].replace(/[',]/g, '')) || 0,
          click: parseInt(parts[3].replace(/[',]/g, '')) || 0,
          cart: parseInt(parts[4].replace(/[',]/g, '')) || 0
        });
      }
    });
    
    console.log('\n📊 MD 파일과 성능 로스 분석:');
    result.rows.forEach(row => {
      const mdMatch = mdKeywords.find(md => 
        md.keyword.toLowerCase().trim() === (row.keyword || '').toLowerCase().trim()
      );
      
      console.log(`\nID ${row.id}: ${row.keyword}`);
      if (mdMatch) {
        console.log(`  MD데이터: 검색 ${mdMatch.search}, 노출 ${mdMatch.exposure}, 클릭 ${mdMatch.click}, 담기 ${mdMatch.cart}`);
        console.log(`  DB성공률: ${row.success_count} (vs MD노출 ${mdMatch.exposure})`);
        
        // 성능 로스 계산
        const exposureLoss = ((mdMatch.exposure - row.success_count) / mdMatch.exposure * 100).toFixed(1);
        const clickLoss = ((mdMatch.click - row.success_count) / mdMatch.click * 100).toFixed(1);
        
        console.log(`  ⚠️ 노출 로스: ${exposureLoss}% (${mdMatch.exposure - row.success_count}개)`);
        console.log(`  ⚠️ 클릭 로스: ${clickLoss}% (${mdMatch.click - row.success_count}개)`);
        
        // 심각도 평가
        if (parseFloat(exposureLoss) > 50) {
          console.log(`  🚨 심각한 노출 로스 발생!`);
        }
        if (parseFloat(clickLoss) > 50) {
          console.log(`  🚨 심각한 클릭 로스 발생!`);
        }
      } else {
        console.log(`  ❌ MD파일에서 매칭되지 않음`);
      }
    });
    
    // 3. optimization_config 상세 분석
    console.log('\n⚙️ optimization_config 상세 분석:');
    result.rows.forEach(row => {
      const config = row.optimization_config || {};
      console.log(`\nID ${row.id} 설정:`);
      console.log(`  main_allow: ${JSON.stringify(config.coupang_main_allow || [])}`);
      console.log(`  image_allow: ${JSON.stringify(config.image_cdn_allow || [])}`);
      console.log(`  img1a_allow: ${JSON.stringify(config.img1a_cdn_allow || [])}`);
      console.log(`  front_allow: ${JSON.stringify(config.front_cdn_allow || [])}`);
      console.log(`  static_allow: ${JSON.stringify(config.static_cdn_allow || [])}`);
      console.log(`  mercury_allow: ${JSON.stringify(config.mercury_allow || [])}`);
      console.log(`  ljc_allow: ${JSON.stringify(config.ljc_allow || [])}`);
    });
    
    // 4. 성공한 키워드들과 설정 비교
    console.log('\n🏆 성공 키워드들과 설정 비교:');
    const successResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, success_count, optimization_config
      FROM v2_test_keywords 
      WHERE id >= 25 AND id <= 61 AND success_count > 70
      ORDER BY success_count DESC
      LIMIT 5
    `);
    
    console.log('상위 5개 성공 키워드:');
    successResult.rows.forEach(row => {
      const config = row.optimization_config || {};
      console.log(`\nID ${row.id}: ${row.keyword} (성공: ${row.success_count})`);
      console.log(`  에이전트: ${row.agent}`);
      console.log(`  front_allow: ${JSON.stringify(config.front_cdn_allow || [])}`);
      console.log(`  mercury_allow: ${JSON.stringify(config.mercury_allow || [])}`);
      console.log(`  ljc_allow: ${JSON.stringify(config.ljc_allow || [])}`);
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzePerformanceLoss();