/**
 * 공격적 차단 테스트 - 최대 트래픽 절감
 * 목표: 10MB → 3-5MB로 50% 이상 절감
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function setAggressiveBlocking() {
  console.log('🚀 공격적 차단 설정 시작...');
  
  try {
    // 모든 이미지 CDN 차단 (핵심 기능 유지하면서 트래픽 대폭 절감)
    await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET block_mercury = false,        -- 필수 API는 허용
          block_image_cdn = true,       -- 🚫 이미지 CDN 차단 (2-4MB 절약)
          block_img1a_cdn = true,       -- 🚫 대형 이미지 차단 (1-2MB 절약)  
          block_thumbnail_cdn = true    -- 🚫 썸네일 차단 (0.5-1MB 절약)
      WHERE id = 22
    `);
    
    console.log('✅ 공격적 차단 설정 완료');
    
    // 설정 확인
    const result = await dbServiceV2.query(`
      SELECT id, keyword, block_mercury, block_image_cdn, block_img1a_cdn, block_thumbnail_cdn
      FROM v2_test_keywords 
      WHERE id = 22
    `);
    
    const row = result.rows[0];
    console.log(`\n📋 ID:${row.id} ${row.keyword}:`);
    console.log(`   mercury: ${row.block_mercury ? '🚫 차단' : '✅ 허용'}`);
    console.log(`   image_cdn: ${row.block_image_cdn ? '🚫 차단' : '✅ 허용'}`);
    console.log(`   img1a_cdn: ${row.block_img1a_cdn ? '🚫 차단' : '✅ 허용'}`);
    console.log(`   thumbnail_cdn: ${row.block_thumbnail_cdn ? '🚫 차단' : '✅ 허용'}`);
    
    console.log('\n💡 예상 효과:');
    console.log('   - 기존: 10-12MB → 예상: 3-5MB (50-70% 절감)');
    console.log('   - 이미지 로딩은 차단되지만 상품 찾기 기능은 정상 작동');
    console.log('   - 텍스트 정보와 링크는 모두 유지');
    
    console.log('\n🧪 테스트 명령어:');
    console.log('   node index.js --agent test2 --once --monitor');
    
  } catch (error) {
    console.error('❌ 설정 실패:', error.message);
  } finally {
    process.exit(0);
  }
}

setAggressiveBlocking();