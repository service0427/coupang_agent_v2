#!/usr/bin/env node
/**
 * optimization_config를 배열에서 boolean으로 변경하는 스크립트
 * 기존: {"mercury_allow": [], "image_cdn_allow": []} 
 * 신규: {"block_mercury": true, "block_image_cdn": true}
 */

const { Pool } = require('pg');
const fs = require('fs').promises;

// 환경 설정 로드
const config = require('../environment');

async function updateOptimizationConfig() {
  const pool = new Pool(config.database);
  
  try {
    console.log('🔄 optimization_config 형식 변경 시작...');
    
    // 현재 키워드들 조회
    const result = await pool.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log(`📊 총 ${result.rows.length}개 키워드 처리 예정`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const row of result.rows) {
      const { id, keyword, optimization_config } = row;
      
      if (!optimization_config) {
        console.log(`⏭️  ID:${id} ${keyword} - optimization_config 없음, 건너뜀`);
        skippedCount++;
        continue;
      }
      
      // 기존 배열 형식에서 boolean 형식으로 변환
      const oldConfig = optimization_config;
      const newConfig = {
        block_mercury: !oldConfig.mercury_allow || oldConfig.mercury_allow.length === 0,
        block_image_cdn: !oldConfig.image_cdn_allow || oldConfig.image_cdn_allow.length === 0,
        block_img1a_cdn: !oldConfig.img1a_cdn_allow || oldConfig.img1a_cdn_allow.length === 0,
        block_thumbnail_cdn: !oldConfig.thumbnail_cdn_allow || oldConfig.thumbnail_cdn_allow.length === 0
      };
      
      // 데이터베이스 업데이트
      await pool.query(
        'UPDATE v2_test_keywords SET optimization_config = $1 WHERE id = $2',
        [JSON.stringify(newConfig), id]
      );
      
      console.log(`✅ ID:${id} ${keyword}`);
      console.log(`   기존: mercury=${JSON.stringify(oldConfig.mercury_allow || [])}, image=${JSON.stringify(oldConfig.image_cdn_allow || [])}`);
      console.log(`   신규: mercury=${newConfig.block_mercury}, image=${newConfig.block_image_cdn}`);
      
      updatedCount++;
    }
    
    console.log('\n📋 변경 완료 요약:');
    console.log(`   업데이트됨: ${updatedCount}개`);
    console.log(`   건너뜀: ${skippedCount}개`);
    console.log(`   총합: ${result.rows.length}개`);
    
    // 변경 결과 검증
    console.log('\n🔍 변경 결과 검증...');
    const verifyResult = await pool.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
      ORDER BY id
      LIMIT 5
    `);
    
    console.log('\n📋 변경 결과 샘플:');
    verifyResult.rows.forEach(row => {
      const config = row.optimization_config;
      console.log(`   ID:${row.id} ${row.keyword}: mercury=${config.block_mercury}, image=${config.block_image_cdn}`);
    });
    
  } catch (error) {
    console.error('❌ 변경 실패:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// 실행
if (require.main === module) {
  updateOptimizationConfig().catch(console.error);
}

module.exports = updateOptimizationConfig;