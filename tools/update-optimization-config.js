const dbServiceV2 = require('../lib/services/db-service-v2');

async function updateOptimizationConfig() {
  try {
    console.log('=== optimization_config 컬럼 정리 시작 ===\n');
    
    // 1. 현재 데이터 확인
    const currentResult = await dbServiceV2.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
      ORDER BY id
      LIMIT 5
    `);
    
    console.log('📋 현재 optimization_config 샘플 (처리 전):');
    currentResult.rows.forEach(row => {
      console.log(`ID ${row.id}: ${Object.keys(row.optimization_config || {}).join(', ')}`);
    });
    
    // 2. 무조건 허용 도메인 관련 컬럼들 제거
    console.log('\n🔧 무조건 허용 도메인 설정 제거 중...');
    console.log('   제거 대상: ljc_allow, front_cdn_allow, assets_cdn_allow');
    
    const updateResult = await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET optimization_config = optimization_config - 'ljc_allow' - 'front_cdn_allow' - 'assets_cdn_allow'
      WHERE optimization_config IS NOT NULL
      RETURNING id, keyword
    `);
    
    console.log(`✅ ${updateResult.rows.length}개 레코드 업데이트 완료\n`);
    
    // 3. 컬럼 기본값 업데이트
    console.log('🔧 테이블 기본값 업데이트 중...');
    
    await dbServiceV2.query(`
      ALTER TABLE v2_test_keywords 
      ALTER COLUMN optimization_config 
      SET DEFAULT '{
        "mercury_allow": [], 
        "image_cdn_allow": [], 
        "img1a_cdn_allow": [], 
        "static_cdn_allow": [], 
        "coupang_main_allow": ["document"], 
        "thumbnail_cdn_allow": [], 
        "coupang_main_block_patterns": []
      }'::jsonb
    `);
    
    console.log('✅ 테이블 기본값 업데이트 완료\n');
    
    // 4. 업데이트 후 데이터 확인
    const afterResult = await dbServiceV2.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL
      ORDER BY id
      LIMIT 5
    `);
    
    console.log('📊 업데이트 후 optimization_config 샘플:');
    afterResult.rows.forEach(row => {
      const config = row.optimization_config || {};
      console.log(`\nID ${row.id}: ${row.keyword}`);
      console.log(`   키들: ${Object.keys(config).join(', ')}`);
      console.log(`   main_allow: ${JSON.stringify(config.coupang_main_allow || [])}`);
      console.log(`   mercury_allow: ${JSON.stringify(config.mercury_allow || [])}`);
      console.log(`   image_allow: ${JSON.stringify(config.image_cdn_allow || [])}`);
    });
    
    // 5. 새로운 기본값으로 테스트 레코드 생성
    console.log('\n🧪 새 기본값 테스트...');
    const testId = Math.floor(Math.random() * 1000000);
    
    await dbServiceV2.query(`
      INSERT INTO v2_test_keywords (keyword, product_code, agent)
      VALUES ('테스트키워드${testId}', 'TEST123', 'test-agent')
    `);
    
    const testResult = await dbServiceV2.query(`
      SELECT optimization_config FROM v2_test_keywords 
      WHERE keyword = '테스트키워드${testId}'
    `);
    
    console.log('🔍 새로 생성된 레코드의 기본 optimization_config:');
    console.log(JSON.stringify(testResult.rows[0].optimization_config, null, 2));
    
    // 테스트 레코드 삭제
    await dbServiceV2.query(`
      DELETE FROM v2_test_keywords WHERE keyword = '테스트키워드${testId}'
    `);
    
    console.log('\n📈 정리 완료 요약:');
    console.log('   ✅ ljc_allow 제거 (ljc.coupang.com은 무조건 허용)');
    console.log('   ✅ front_cdn_allow 제거 (front.coupangcdn.com은 무조건 허용)');
    console.log('   ✅ assets_cdn_allow 제거 (assets.coupangcdn.com은 무조건 허용)');
    console.log('   ✅ 테이블 기본값 업데이트');
    console.log('   🎯 이제 해당 도메인들은 콘솔에 로그가 출력되지 않음');
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

updateOptimizationConfig();