const dbServiceV2 = require('../lib/services/db-service-v2');

async function simplifyOptimizationConfig() {
  try {
    console.log('=== optimization_config 대폭 간소화 시작 ===\n');
    
    // 1. 현재 데이터 확인
    const currentResult = await dbServiceV2.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
      ORDER BY id
      LIMIT 5
    `);
    
    console.log('📋 현재 optimization_config 샘플 (간소화 전):');
    currentResult.rows.forEach(row => {
      console.log(`ID ${row.id}: ${Object.keys(row.optimization_config || {}).join(', ')}`);
    });
    
    // 2. 무조건 허용 도메인들 설정 제거 및 간소화
    console.log('\n🔧 무조건 허용 도메인 설정들 제거 중...');
    console.log('   제거 대상: coupang_main_allow, static_cdn_allow, coupang_main_block_patterns');
    console.log('   유지 대상: mercury_allow, image_cdn_allow, img1a_cdn_allow, thumbnail_cdn_allow');
    
    const updateResult = await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET optimization_config = jsonb_build_object(
        'mercury_allow', COALESCE(optimization_config->'mercury_allow', '[]'::jsonb),
        'image_cdn_allow', COALESCE(optimization_config->'image_cdn_allow', '[]'::jsonb),
        'img1a_cdn_allow', COALESCE(optimization_config->'img1a_cdn_allow', '[]'::jsonb),
        'thumbnail_cdn_allow', COALESCE(optimization_config->'thumbnail_cdn_allow', '[]'::jsonb)
      )
      WHERE optimization_config IS NOT NULL
      RETURNING id, keyword
    `);
    
    console.log(`✅ ${updateResult.rows.length}개 레코드 간소화 완료\n`);
    
    // 3. 테이블 기본값 업데이트
    console.log('🔧 테이블 기본값을 간소화된 구조로 업데이트...');
    
    await dbServiceV2.query(`
      ALTER TABLE v2_test_keywords 
      ALTER COLUMN optimization_config 
      SET DEFAULT '{
        "mercury_allow": [], 
        "image_cdn_allow": [], 
        "img1a_cdn_allow": [], 
        "thumbnail_cdn_allow": []
      }'::jsonb
    `);
    
    console.log('✅ 테이블 기본값 업데이트 완료\n');
    
    // 4. 간소화 후 데이터 확인
    const afterResult = await dbServiceV2.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
      ORDER BY id
      LIMIT 5
    `);
    
    console.log('📊 간소화 후 optimization_config 샘플:');
    afterResult.rows.forEach(row => {
      const config = row.optimization_config || {};
      console.log(`\nID ${row.id}: ${row.keyword}`);
      console.log(`   키들: ${Object.keys(config).join(', ')}`);
      console.log(`   mercury_allow: ${JSON.stringify(config.mercury_allow || [])}`);
      console.log(`   image_cdn_allow: ${JSON.stringify(config.image_cdn_allow || [])}`);
      console.log(`   img1a_cdn_allow: ${JSON.stringify(config.img1a_cdn_allow || [])}`);
      console.log(`   thumbnail_cdn_allow: ${JSON.stringify(config.thumbnail_cdn_allow || [])}`);
    });
    
    // 5. 새로운 기본값으로 테스트 레코드 생성
    console.log('\n🧪 새 간소화된 기본값 테스트...');
    const testId = Math.floor(Math.random() * 1000000);
    
    await dbServiceV2.query(`
      INSERT INTO v2_test_keywords (keyword, product_code, agent)
      VALUES ('간소화테스트${testId}', 'SIMPLE123', 'simple-agent')
    `);
    
    const testResult = await dbServiceV2.query(`
      SELECT optimization_config FROM v2_test_keywords 
      WHERE keyword = '간소화테스트${testId}'
    `);
    
    console.log('🔍 새로 생성된 레코드의 간소화된 optimization_config:');
    console.log(JSON.stringify(testResult.rows[0].optimization_config, null, 2));
    
    // 테스트 레코드 삭제
    await dbServiceV2.query(`
      DELETE FROM v2_test_keywords WHERE keyword = '간소화테스트${testId}'
    `);
    
    // 6. 전체 통계 확인
    const statsResult = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN optimization_config->'mercury_allow' = '[]'::jsonb THEN 1 END) as mercury_blocked,
        COUNT(CASE WHEN optimization_config->'image_cdn_allow' = '[]'::jsonb THEN 1 END) as image_blocked,
        COUNT(CASE WHEN optimization_config->'img1a_cdn_allow' = '[]'::jsonb THEN 1 END) as img1a_blocked,
        COUNT(CASE WHEN optimization_config->'thumbnail_cdn_allow' = '[]'::jsonb THEN 1 END) as thumbnail_blocked
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
    `);
    
    const stats = statsResult.rows[0];
    
    console.log('\n📈 간소화 완료 통계:');
    console.log(`   전체 레코드: ${stats.total_records}개`);
    console.log(`   mercury 차단: ${stats.mercury_blocked}개 (${((stats.mercury_blocked/stats.total_records)*100).toFixed(1)}%)`);
    console.log(`   image 차단: ${stats.image_blocked}개 (${((stats.image_blocked/stats.total_records)*100).toFixed(1)}%)`);
    console.log(`   img1a 차단: ${stats.img1a_blocked}개 (${((stats.img1a_blocked/stats.total_records)*100).toFixed(1)}%)`);
    console.log(`   thumbnail 차단: ${stats.thumbnail_blocked}개 (${((stats.thumbnail_blocked/stats.total_records)*100).toFixed(1)}%)`);
    
    console.log('\n🎯 최종 간소화 요약:');
    console.log('   ✅ 10개 키 → 4개 키로 대폭 간소화 (60% 감소)');
    console.log('   ✅ 무조건 허용 도메인들: www.coupang.com, static.coupangcdn.com, front.coupangcdn.com, ljc.coupang.com, assets.coupangcdn.com');
    console.log('   ✅ 차단 테스트 도메인들: mercury.coupang.com, image*.coupangcdn.com, img1a.coupangcdn.com, thumbnail*.coupangcdn.com');
    console.log('   🚀 매우 빠른 처리 속도와 깔끔한 로그 출력');
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

simplifyOptimizationConfig();