const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzeFailurePatterns() {
  try {
    console.log('=== 실패한 키워드들의 공통 요소 분석 ===\n');
    
    // 1. 전체 키워드 데이터 가져오기
    const keywordResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, success_count, fail_count,
             optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id >= 25 AND id <= 61
      ORDER BY id
    `);
    
    // 2. MD 파일 데이터 읽기 (수정된 버전)
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
    
    // 3. 실패 그룹만 추출 (MD에서 담기=0 또는 DB success < 50)
    const failureData = [];
    
    keywordResult.rows.forEach(dbRow => {
      const mdMatch = mdKeywords.find(md => 
        md.keyword.toLowerCase().trim() === (dbRow.keyword || '').toLowerCase().trim()
      );
      
      const config = dbRow.optimization_config || {};
      
      // 실패 기준: MD에서 담기=0 AND DB success < 50
      const mdFailed = mdMatch ? mdMatch.cart === 0 : true;
      const dbFailed = dbRow.success_count < 50;
      
      if (mdFailed || dbFailed) {
        failureData.push({
          id: dbRow.id,
          keyword: dbRow.keyword,
          agent: dbRow.agent,
          db_success: dbRow.success_count,
          db_fail: dbRow.fail_count,
          md_cart: mdMatch ? mdMatch.cart : null,
          md_matched: !!mdMatch,
          md_failed: mdFailed,
          db_failed: dbFailed,
          config: {
            main_allow: JSON.stringify(config.coupang_main_allow || []),
            image_allow: JSON.stringify(config.image_cdn_allow || []),
            img1a_allow: JSON.stringify(config.img1a_cdn_allow || []),
            front_allow: JSON.stringify(config.front_cdn_allow || []),
            static_allow: JSON.stringify(config.static_cdn_allow || []),
            mercury_allow: JSON.stringify(config.mercury_allow || []),
            ljc_allow: JSON.stringify(config.ljc_allow || [])
          }
        });
      }
    });
    
    console.log(`🔍 실패한 키워드들: ${failureData.length}개\n`);
    
    // 4. 실패 키워드 상세 정보
    console.log('❌ 실패한 키워드 상세 목록:');
    failureData.forEach(item => {
      console.log(`\nID ${item.id}: ${item.keyword}`);
      console.log(`  에이전트: ${item.agent}`);
      console.log(`  DB: 성공 ${item.db_success}, 실패 ${item.db_fail}`);
      console.log(`  MD: 담기 ${item.md_cart || 'N/A'} (매칭: ${item.md_matched ? 'O' : 'X'})`);
      console.log(`  실패 유형: ${item.md_failed ? 'MD실패' : ''}${item.md_failed && item.db_failed ? '+' : ''}${item.db_failed ? 'DB실패' : ''}`);
    });
    
    // 5. 에이전트별 실패 분석
    console.log('\n🤖 에이전트별 실패 분석:');
    const agentFailures = {};
    failureData.forEach(item => {
      if (!agentFailures[item.agent]) agentFailures[item.agent] = [];
      agentFailures[item.agent].push(item.id);
    });
    
    Object.entries(agentFailures)
      .sort(([,a], [,b]) => b.length - a.length)
      .forEach(([agent, ids]) => {
        console.log(`  ${agent}: ${ids.length}개 실패 [${ids.join(', ')}]`);
      });
    
    // 6. 설정별 실패 패턴 분석
    console.log('\n⚙️  실패 그룹의 설정 패턴:');
    
    const configKeys = ['main_allow', 'image_allow', 'img1a_allow', 'front_allow', 'static_allow', 'mercury_allow', 'ljc_allow'];
    
    configKeys.forEach(configKey => {
      console.log(`\n📋 ${configKey.toUpperCase()} 실패 패턴:`);
      
      const configStats = {};
      failureData.forEach(item => {
        const configValue = item.config[configKey];
        if (!configStats[configValue]) {
          configStats[configValue] = { count: 0, ids: [] };
        }
        configStats[configValue].count++;
        configStats[configValue].ids.push(item.id);
      });
      
      Object.entries(configStats)
        .sort(([,a], [,b]) => b.count - a.count)
        .forEach(([configValue, stats]) => {
          const shortValue = configValue.length > 30 ? configValue.substring(0, 30) + '...' : configValue;
          const percentage = ((stats.count / failureData.length) * 100).toFixed(1);
          console.log(`  ${shortValue}: ${stats.count}/${failureData.length} (${percentage}%) [${stats.ids.slice(0,8).join(',')}${stats.ids.length > 8 ? '...' : ''}]`);
        });
    });
    
    // 7. 100% 실패 패턴 찾기 (모든 실패 키워드에 공통)
    console.log('\n🎯 100% 공통 실패 패턴 (모든 실패 키워드 공통):');
    
    configKeys.forEach(configKey => {
      const configStats = {};
      failureData.forEach(item => {
        const configValue = item.config[configKey];
        configStats[configValue] = (configStats[configValue] || 0) + 1;
      });
      
      Object.entries(configStats).forEach(([configValue, count]) => {
        if (count === failureData.length) {  // 100% 공통
          const shortValue = configValue.length > 30 ? configValue.substring(0, 30) + '...' : configValue;
          console.log(`  ⭐ ${configKey}: ${shortValue} (100% 실패 그룹 공통)`);
        }
      });
    });
    
    // 8. 실패 vs 성공 그룹 설정 비교
    console.log('\n📊 실패 그룹 vs 성공 그룹 설정 비교:');
    
    // 성공 그룹 데이터 계산
    const successData = [];
    keywordResult.rows.forEach(dbRow => {
      const mdMatch = mdKeywords.find(md => 
        md.keyword.toLowerCase().trim() === (dbRow.keyword || '').toLowerCase().trim()
      );
      
      const mdSuccess = mdMatch ? mdMatch.cart > 0 : false;
      const dbSuccess = dbRow.success_count >= 50;
      
      if (mdSuccess || dbSuccess) {
        const config = dbRow.optimization_config || {};
        successData.push({
          id: dbRow.id,
          config: {
            main_allow: JSON.stringify(config.coupang_main_allow || []),
            image_allow: JSON.stringify(config.image_cdn_allow || []),
            img1a_allow: JSON.stringify(config.img1a_cdn_allow || []),
            front_allow: JSON.stringify(config.front_cdn_allow || []),
            static_allow: JSON.stringify(config.static_cdn_allow || []),
            mercury_allow: JSON.stringify(config.mercury_allow || []),
            ljc_allow: JSON.stringify(config.ljc_allow || [])
          }
        });
      }
    });
    
    configKeys.forEach(configKey => {
      console.log(`\n${configKey.toUpperCase()} 비교:`);
      
      // 실패 그룹 패턴
      const failureStats = {};
      failureData.forEach(item => {
        const configValue = item.config[configKey];
        failureStats[configValue] = (failureStats[configValue] || 0) + 1;
      });
      
      // 성공 그룹 패턴
      const successStats = {};
      successData.forEach(item => {
        const configValue = item.config[configKey];
        successStats[configValue] = (successStats[configValue] || 0) + 1;
      });
      
      // 실패에서 높은 비율을 차지하는 패턴
      Object.entries(failureStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)  // 상위 3개만
        .forEach(([configValue, failCount]) => {
          const successCount = successStats[configValue] || 0;
          const failRate = failCount / (failCount + successCount);
          const shortValue = configValue.length > 25 ? configValue.substring(0, 25) + '...' : configValue;
          
          if (failRate > 0.5) {  // 실패율 50% 이상인 것만
            console.log(`  ❌ ${shortValue}: 실패 ${failCount}, 성공 ${successCount} (실패율 ${(failRate*100).toFixed(1)}%)`);
          }
        });
    });
    
    // 9. 키워드 패턴 분석
    console.log('\n🔤 키워드 패턴 분석:');
    
    const keywordPatterns = {
      containsDuplicate: failureData.filter(item => item.keyword.includes('중복')),
      containsCompatible: failureData.filter(item => item.keyword.includes('호환')),
      containsRefill: failureData.filter(item => item.keyword.includes('리필')),
      containsGeneric: failureData.filter(item => item.keyword.includes('부품')),
      longKeywords: failureData.filter(item => item.keyword.length > 20),
      shortKeywords: failureData.filter(item => item.keyword.length <= 10)
    };
    
    Object.entries(keywordPatterns).forEach(([pattern, items]) => {
      if (items.length > 0) {
        const percentage = ((items.length / failureData.length) * 100).toFixed(1);
        console.log(`  ${pattern}: ${items.length}/${failureData.length} (${percentage}%)`);
        items.forEach(item => {
          console.log(`    - ID ${item.id}: ${item.keyword.substring(0, 50)}...`);
        });
      }
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeFailurePatterns();