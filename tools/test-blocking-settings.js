#!/usr/bin/env node
/**
 * 테스트용 차단 설정 활성화 스크립트
 * ID 22번 키워드에 일부 도메인 차단을 설정하여 테스트
 */

const { Pool } = require('pg');

// 환경 설정 로드
const config = require('../environment');

async function setTestBlockingSettings() {
  const pool = new Pool(config.database);
  
  try {
    console.log('🔧 테스트용 차단 설정 활성화...');
    
    // ID 22번 키워드에 일부 도메인 차단 설정
    await pool.query(`
      UPDATE v2_test_keywords 
      SET block_mercury = true,
          block_image_cdn = false,
          block_img1a_cdn = true,
          block_thumbnail_cdn = false
      WHERE id = 22
    `);
    
    console.log('✅ ID:22 차단 설정 완료');
    console.log('   mercury: 🚫 차단');
    console.log('   image_cdn: ✅ 허용'); 
    console.log('   img1a_cdn: 🚫 차단');
    console.log('   thumbnail_cdn: ✅ 허용');
    
    // 결과 확인
    const result = await pool.query(`
      SELECT id, keyword, block_mercury, block_image_cdn, block_img1a_cdn, block_thumbnail_cdn
      FROM v2_test_keywords 
      WHERE id = 22
    `);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('\n📋 설정 확인:');
      console.log(`ID:${row.id} ${row.keyword}:`);
      console.log(`   mercury: ${row.block_mercury ? '🚫 차단' : '✅ 허용'}`);
      console.log(`   image_cdn: ${row.block_image_cdn ? '🚫 차단' : '✅ 허용'}`);
      console.log(`   img1a_cdn: ${row.block_img1a_cdn ? '🚫 차단' : '✅ 허용'}`);
      console.log(`   thumbnail_cdn: ${row.block_thumbnail_cdn ? '🚫 차단' : '✅ 허용'}`);
    }
    
    console.log('\n🧪 이제 다음 명령어로 테스트해보세요:');
    console.log('   node index.js --agent test2 --once --monitor');
    console.log('   (--monitor 옵션으로 실시간 트래픽 로그를 확인할 수 있습니다)');
    
  } catch (error) {
    console.error('❌ 설정 실패:', error.message);
  } finally {
    await pool.end();
  }
}

// 실행
if (require.main === module) {
  setTestBlockingSettings().catch(console.error);
}

module.exports = setTestBlockingSettings;