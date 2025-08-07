#!/usr/bin/env node
/**
 * optimization_config JSON을 개별 boolean 컬럼으로 분리하는 마이그레이션
 * JSON: {"block_mercury": true, "block_image_cdn": false}
 * → 컬럼: block_mercury boolean, block_image_cdn boolean
 */

const { Pool } = require('pg');

// 환경 설정 로드
const config = require('../environment');

async function migrateOptimizationToColumns() {
  const pool = new Pool(config.database);
  
  try {
    console.log('🔄 optimization_config JSON → 개별 컬럼 마이그레이션 시작...');
    
    // 1. 새로운 컬럼들 추가
    console.log('\n📋 1단계: 새 컬럼 추가');
    const addColumns = [
      'ALTER TABLE v2_test_keywords ADD COLUMN IF NOT EXISTS block_mercury BOOLEAN DEFAULT false',
      'ALTER TABLE v2_test_keywords ADD COLUMN IF NOT EXISTS block_image_cdn BOOLEAN DEFAULT false', 
      'ALTER TABLE v2_test_keywords ADD COLUMN IF NOT EXISTS block_img1a_cdn BOOLEAN DEFAULT false',
      'ALTER TABLE v2_test_keywords ADD COLUMN IF NOT EXISTS block_thumbnail_cdn BOOLEAN DEFAULT false'
    ];
    
    for (const sql of addColumns) {
      await pool.query(sql);
      const columnName = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/)[1];
      console.log(`✅ ${columnName} 컬럼 추가 완료`);
    }
    
    // 2. 기존 JSON 데이터를 개별 컬럼으로 마이그레이션
    console.log('\n📋 2단계: 데이터 마이그레이션');
    const result = await pool.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
      ORDER BY id
    `);
    
    console.log(`📊 마이그레이션할 키워드: ${result.rows.length}개`);
    
    let migratedCount = 0;
    
    for (const row of result.rows) {
      const { id, keyword, optimization_config } = row;
      
      // JSON에서 boolean 값 추출
      const config = optimization_config || {};
      const blockMercury = config.block_mercury || false;
      const blockImageCdn = config.block_image_cdn || false;
      const blockImg1aCdn = config.block_img1a_cdn || false;
      const blockThumbnailCdn = config.block_thumbnail_cdn || false;
      
      // 개별 컬럼 업데이트
      await pool.query(`
        UPDATE v2_test_keywords 
        SET block_mercury = $1,
            block_image_cdn = $2,
            block_img1a_cdn = $3,
            block_thumbnail_cdn = $4
        WHERE id = $5
      `, [blockMercury, blockImageCdn, blockImg1aCdn, blockThumbnailCdn, id]);
      
      console.log(`✅ ID:${id} ${keyword}: mercury=${blockMercury}, image=${blockImageCdn}, img1a=${blockImg1aCdn}, thumb=${blockThumbnailCdn}`);
      migratedCount++;
    }
    
    // 3. 마이그레이션 검증
    console.log('\n📋 3단계: 마이그레이션 검증');
    const verifyResult = await pool.query(`
      SELECT id, keyword, 
             block_mercury, block_image_cdn, block_img1a_cdn, block_thumbnail_cdn,
             optimization_config
      FROM v2_test_keywords 
      ORDER BY id 
      LIMIT 5
    `);
    
    console.log('\n📋 마이그레이션 결과 샘플:');
    verifyResult.rows.forEach(row => {
      console.log(`ID:${row.id} ${row.keyword}:`);
      console.log(`   컬럼: mercury=${row.block_mercury}, image=${row.block_image_cdn}, img1a=${row.block_img1a_cdn}, thumb=${row.block_thumbnail_cdn}`);
      console.log(`   JSON: ${JSON.stringify(row.optimization_config)}\n`);
    });
    
    // 4. optimization_config 컬럼 제거 여부 확인
    console.log('📋 4단계: optimization_config 컬럼 제거 옵션');
    console.log('⚠️  optimization_config 컬럼을 제거하려면 다음 명령어를 실행하세요:');
    console.log('   ALTER TABLE v2_test_keywords DROP COLUMN optimization_config;');
    console.log('   (현재는 안전을 위해 유지됩니다)');
    
    console.log('\n✅ 마이그레이션 완료!');
    console.log(`📊 총 ${migratedCount}개 키워드 마이그레이션됨`);
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// 실행
if (require.main === module) {
  migrateOptimizationToColumns().catch(console.error);
}

module.exports = migrateOptimizationToColumns;