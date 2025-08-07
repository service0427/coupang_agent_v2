const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzeSuccessFailureFactors() {
  try {
    console.log('=== 성공/실패 주요 요인 분석 ===\n');
    
    // 1. 전체 키워드 데이터 가져오기
    const keywordResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, success_count, fail_count,
             optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id >= 25 AND id <= 61
      ORDER BY id
    `);
    
    // 2. MD 파일 데이터 읽기
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
    
    // 3. 데이터 매칭 및 성공/실패 분류
    const analysisData = [];
    
    keywordResult.rows.forEach(dbRow => {
      const mdMatch = mdKeywords.find(md => 
        md.keyword.toLowerCase().trim() === (dbRow.keyword || '').toLowerCase().trim()
      );
      
      const config = dbRow.optimization_config || {};
      
      analysisData.push({
        id: dbRow.id,
        keyword: dbRow.keyword,
        agent: dbRow.agent,
        db_success: dbRow.success_count,
        md_cart: mdMatch ? mdMatch.cart : null,
        md_matched: !!mdMatch,
        // 성공 기준: MD에서 담기 > 0 또는 DB에서 success_count > 50
        is_success: (mdMatch && mdMatch.cart > 0) || dbRow.success_count > 50,
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
    });
    
    // 4. 성공/실패 그룹 분석
    const successGroup = analysisData.filter(item => item.is_success);
    const failureGroup = analysisData.filter(item => !item.is_success);
    
    console.log(`📊 전체 분석 대상: ${analysisData.length}개`);
    console.log(`✅ 성공 그룹: ${successGroup.length}개`);
    console.log(`❌ 실패 그룹: ${failureGroup.length}개\n`);
    
    // 5. 에이전트별 성공률 분석
    console.log('🤖 에이전트별 성공률 분석:');
    const agentStats = {};
    
    analysisData.forEach(item => {
      if (!agentStats[item.agent]) {
        agentStats[item.agent] = { total: 0, success: 0 };
      }
      agentStats[item.agent].total++;
      if (item.is_success) agentStats[item.agent].success++;
    });
    
    Object.entries(agentStats)
      .sort(([,a], [,b]) => (b.success/b.total) - (a.success/a.total))
      .forEach(([agent, stats]) => {
        const successRate = ((stats.success / stats.total) * 100).toFixed(1);
        console.log(`  ${agent}: ${stats.success}/${stats.total} (${successRate}%)`);
      });
    
    // 6. 설정별 성공 패턴 분석
    console.log('\n⚙️  설정별 성공 패턴 분석:');
    
    const configKeys = ['main_allow', 'image_allow', 'img1a_allow', 'front_allow', 'static_allow', 'mercury_allow', 'ljc_allow'];
    
    configKeys.forEach(configKey => {
      console.log(`\n📋 ${configKey.toUpperCase()} 분석:`);
      
      const configStats = {};
      
      analysisData.forEach(item => {
        const configValue = item.config[configKey];
        if (!configStats[configValue]) {
          configStats[configValue] = { total: 0, success: 0, ids: [] };
        }
        configStats[configValue].total++;
        configStats[configValue].ids.push(item.id);
        if (item.is_success) configStats[configValue].success++;
      });
      
      Object.entries(configStats)
        .sort(([,a], [,b]) => (b.success/b.total) - (a.success/a.total))
        .forEach(([configValue, stats]) => {
          const successRate = ((stats.success / stats.total) * 100).toFixed(1);
          const shortValue = configValue.length > 30 ? configValue.substring(0, 30) + '...' : configValue;
          console.log(`  ${shortValue}: ${stats.success}/${stats.total} (${successRate}%) [${stats.ids.slice(0,5).join(',')}${stats.ids.length > 5 ? '...' : ''}]`);
        });
    });
    
    // 7. 성공 그룹의 공통 패턴 찾기
    console.log('\n✅ 성공 그룹의 공통 패턴:');
    
    const successPatterns = {};
    configKeys.forEach(key => {
      successPatterns[key] = {};
      successGroup.forEach(item => {
        const value = item.config[key];
        successPatterns[key][value] = (successPatterns[key][value] || 0) + 1;
      });
    });
    
    configKeys.forEach(key => {
      console.log(`\n${key.toUpperCase()}:`);
      Object.entries(successPatterns[key])
        .sort(([,a], [,b]) => b - a)
        .forEach(([value, count]) => {
          const percentage = ((count / successGroup.length) * 100).toFixed(1);
          const shortValue = value.length > 30 ? value.substring(0, 30) + '...' : value;
          console.log(`  ${shortValue}: ${count}/${successGroup.length} (${percentage}%)`);
        });
    });
    
    // 8. 실패 그룹의 공통 패턴 찾기
    console.log('\n❌ 실패 그룹의 공통 패턴:');
    
    const failurePatterns = {};
    configKeys.forEach(key => {
      failurePatterns[key] = {};
      failureGroup.forEach(item => {
        const value = item.config[key];
        failurePatterns[key][value] = (failurePatterns[key][value] || 0) + 1;
      });
    });
    
    configKeys.forEach(key => {
      console.log(`\n${key.toUpperCase()}:`);
      Object.entries(failurePatterns[key])
        .sort(([,a], [,b]) => b - a)
        .forEach(([value, count]) => {
          const percentage = ((count / failureGroup.length) * 100).toFixed(1);
          const shortValue = value.length > 30 ? value.substring(0, 30) + '...' : value;
          console.log(`  ${shortValue}: ${count}/${failureGroup.length} (${percentage}%)`);
        });
    });
    
    // 9. 핵심 성공 요인 결론
    console.log('\n🎯 핵심 성공/실패 요인 결론:');
    
    // 각 설정에서 성공률이 높은 패턴 식별
    const recommendations = {};
    configKeys.forEach(key => {
      const configStats = {};
      analysisData.forEach(item => {
        const configValue = item.config[key];
        if (!configStats[configValue]) {
          configStats[configValue] = { total: 0, success: 0 };
        }
        configStats[configValue].total++;
        if (item.is_success) configStats[configValue].success++;
      });
      
      // 최고 성공률 찾기 (최소 3개 이상 샘플)
      let bestConfig = null;
      let bestRate = 0;
      Object.entries(configStats).forEach(([config, stats]) => {
        if (stats.total >= 3) {
          const rate = stats.success / stats.total;
          if (rate > bestRate) {
            bestRate = rate;
            bestConfig = config;
          }
        }
      });
      
      if (bestConfig) {
        const shortConfig = bestConfig.length > 40 ? bestConfig.substring(0, 40) + '...' : bestConfig;
        recommendations[key] = {
          config: shortConfig,
          rate: (bestRate * 100).toFixed(1)
        };
      }
    });
    
    console.log('\n🏆 권장 설정 (높은 성공률 기준):');
    Object.entries(recommendations).forEach(([key, rec]) => {
      console.log(`  ${key}: ${rec.config} (${rec.rate}% 성공률)`);
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeSuccessFailureFactors();