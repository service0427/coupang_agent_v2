/**
 * 새로운 optimization_config JSON 컬럼 테스트
 */

const dbServiceV2 = require('../lib/services/db-service-v2');
const { buildDomainRulesFromV2Config } = require('../lib/core/optimizer_db');

async function testOptimizationConfig() {
  console.log('🧪 optimization_config JSON 컬럼 테스트\n');
  
  try {
    // 1. 기존 키워드 중 하나 선택해서 설정 확인
    console.log('1. 현재 키워드 설정 조회...');
    const keywords = await dbServiceV2.query(`
      SELECT id, keyword, product_code, optimization_config 
      FROM v2_test_keywords 
      WHERE agent = 'test' 
      ORDER BY id 
      LIMIT 3
    `);
    
    console.log(`   - ${keywords.rows.length}개 키워드 발견\n`);
    
    keywords.rows.forEach(keyword => {
      console.log(`📋 키워드 ID ${keyword.id}: ${keyword.keyword} (${keyword.product_code})`);
      console.log(`   현재 설정:`, JSON.stringify(keyword.optimization_config, null, 2));
      
      // 도메인 규칙 생성 테스트
      const domainRules = buildDomainRulesFromV2Config(keyword);
      console.log('   생성된 도메인 규칙:');
      Object.entries(domainRules).forEach(([domain, rules]) => {
        console.log(`   - ${domain}: allow=${JSON.stringify(rules.allow)}${rules.blockPatterns ? `, blockPatterns=${JSON.stringify(rules.blockPatterns)}` : ''}`);
      });
      console.log('');
    });
    
    // 2. 설정 변경 테스트
    if (keywords.rows.length > 0) {
      const testKeyword = keywords.rows[0];
      console.log(`2. 키워드 ID ${testKeyword.id} 설정 변경 테스트...`);
      
      // 새로운 설정 적용
      const newConfig = {
        coupang_main_allow: ["*"],
        mercury_allow: ["script", "stylesheet"],  
        ljc_allow: [],
        assets_cdn_allow: [],
        front_cdn_allow: ["script"],
        image_cdn_allow: [],
        static_cdn_allow: [],
        img1a_cdn_allow: [],
        thumbnail_cdn_allow: [],
        coupang_main_block_patterns: ["*.gif", "*.mp4"]
      };
      
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET optimization_config = $1 
        WHERE id = $2
      `, [JSON.stringify(newConfig), testKeyword.id]);
      
      console.log(`   ✅ 새로운 설정 적용:`);
      console.log(`   ${JSON.stringify(newConfig, null, 2)}`);
      
      // 변경된 설정으로 도메인 규칙 재생성
      const updatedKeyword = await dbServiceV2.query(`
        SELECT * FROM v2_test_keywords WHERE id = $1
      `, [testKeyword.id]);
      
      const newDomainRules = buildDomainRulesFromV2Config(updatedKeyword.rows[0]);
      console.log('\n   🔄 변경된 도메인 규칙:');
      Object.entries(newDomainRules).forEach(([domain, rules]) => {
        console.log(`   - ${domain}: allow=${JSON.stringify(rules.allow)}${rules.blockPatterns ? `, blockPatterns=${JSON.stringify(rules.blockPatterns)}` : ''}`);
      });
    }
    
    console.log('\n✅ optimization_config JSON 컬럼 테스트 완료!');
    console.log('\n💡 사용법:');
    console.log('   키워드별 설정 변경: UPDATE v2_test_keywords SET optimization_config = \'{"coupang_main_allow": ["*"]}\' WHERE id = 20;');
    console.log('   전체 설정 확인: SELECT id, keyword, optimization_config FROM v2_test_keywords;');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('   스택:', error.stack);
  } finally {
    await dbServiceV2.close();
  }
}

testOptimizationConfig();