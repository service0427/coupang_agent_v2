/**
 * 최적화 설정 컬럼 통합 마이그레이션
 * 개별 컬럼들을 optimization_config JSON 컬럼으로 통합
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function migrateOptimizationConfig() {
  console.log('🔄 최적화 설정 컬럼 통합 마이그레이션 시작...\n');
  
  try {
    // 1. 기존 데이터를 JSON으로 통합하여 백업
    console.log('1. 기존 데이터 백업 및 JSON 변환...');
    const existingData = await dbServiceV2.query(`
      SELECT 
        id, keyword, product_code,
        coupang_main_allow,
        mercury_allow, 
        ljc_allow,
        assets_cdn_allow,
        front_cdn_allow,
        image_cdn_allow,
        static_cdn_allow,
        img1a_cdn_allow,
        thumbnail_cdn_allow,
        coupang_main_block_patterns
      FROM v2_test_keywords
    `);
    
    console.log(`   - ${existingData.rows.length}개 키워드 데이터 발견`);
    
    // 2. optimization_config 컬럼 추가
    console.log('2. optimization_config 컬럼 추가...');
    await dbServiceV2.query(`
      ALTER TABLE v2_test_keywords 
      ADD COLUMN IF NOT EXISTS optimization_config JSONB DEFAULT '{
        "coupang_main_allow": ["document"],
        "mercury_allow": [],
        "ljc_allow": [],
        "assets_cdn_allow": [],
        "front_cdn_allow": [],
        "image_cdn_allow": [],
        "static_cdn_allow": [],
        "img1a_cdn_allow": [],
        "thumbnail_cdn_allow": [],
        "coupang_main_block_patterns": []
      }'::jsonb
    `);
    
    // 3. 기존 데이터를 JSON으로 변환하여 저장
    console.log('3. 기존 데이터를 JSON으로 변환...');
    for (const row of existingData.rows) {
      const config = {
        coupang_main_allow: row.coupang_main_allow ? JSON.parse(row.coupang_main_allow) : ["document"],
        mercury_allow: row.mercury_allow ? JSON.parse(row.mercury_allow) : [],
        ljc_allow: row.ljc_allow ? JSON.parse(row.ljc_allow) : [],
        assets_cdn_allow: row.assets_cdn_allow ? JSON.parse(row.assets_cdn_allow) : [],
        front_cdn_allow: row.front_cdn_allow ? JSON.parse(row.front_cdn_allow) : [],
        image_cdn_allow: row.image_cdn_allow ? JSON.parse(row.image_cdn_allow) : [],
        static_cdn_allow: row.static_cdn_allow ? JSON.parse(row.static_cdn_allow) : [],
        img1a_cdn_allow: row.img1a_cdn_allow ? JSON.parse(row.img1a_cdn_allow) : [],
        thumbnail_cdn_allow: row.thumbnail_cdn_allow ? JSON.parse(row.thumbnail_cdn_allow) : [],
        coupang_main_block_patterns: row.coupang_main_block_patterns ? JSON.parse(row.coupang_main_block_patterns) : []
      };
      
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET optimization_config = $1 
        WHERE id = $2
      `, [JSON.stringify(config), row.id]);
      
      console.log(`   ✅ ID ${row.id}: ${row.keyword} (${row.product_code}) 변환 완료`);
    }
    
    // 4. 기존 개별 컬럼들 제거
    console.log('4. 기존 개별 컬럼들 제거...');
    const columnsToRemove = [
      'coupang_main_allow',
      'mercury_allow', 
      'ljc_allow',
      'assets_cdn_allow',
      'front_cdn_allow',
      'image_cdn_allow',
      'static_cdn_allow',
      'img1a_cdn_allow',
      'thumbnail_cdn_allow',
      'coupang_main_block_patterns'
    ];
    
    for (const column of columnsToRemove) {
      await dbServiceV2.query(`ALTER TABLE v2_test_keywords DROP COLUMN IF EXISTS ${column}`);
      console.log(`   ✅ ${column} 컬럼 제거 완료`);
    }
    
    // 5. 결과 확인
    console.log('\n5. 마이그레이션 결과 확인...');
    const result = await dbServiceV2.query(`
      SELECT id, keyword, product_code, optimization_config 
      FROM v2_test_keywords 
      ORDER BY id 
      LIMIT 3
    `);
    
    console.log('\n📋 샘플 데이터:');
    result.rows.forEach(row => {
      console.log(`   ID ${row.id}: ${row.keyword} (${row.product_code})`);
      console.log(`   Config: ${JSON.stringify(row.optimization_config, null, 2)}`);
      console.log('');
    });
    
    console.log('✅ 최적화 설정 컬럼 통합 마이그레이션 완료!');
    console.log('\n💡 이제 optimization_config JSONB 컬럼 하나로 모든 설정을 관리할 수 있습니다.');
    console.log('   예시: UPDATE v2_test_keywords SET optimization_config = \'{"coupang_main_allow": ["*"]}\' WHERE id = 20;');
    
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
    console.error('   스택:', error.stack);
  } finally {
    await dbServiceV2.close();
  }
}

migrateOptimizationConfig();