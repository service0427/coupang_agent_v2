const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkCurrentStructure() {
  try {
    console.log('=== v2_test_keywords 현재 테이블 구조 및 준비사항 ===\n');
    
    // 1. 현재 테이블 구조
    const structResult = await dbServiceV2.query(`
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 현재 컬럼 구조:');
    structResult.rows.forEach((row, idx) => {
      const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const maxLength = row.character_maximum_length ? ` (${row.character_maximum_length})` : '';
      const defaultVal = row.column_default ? ` DEFAULT ${row.column_default}` : '';
      
      console.log(`${(idx + 1).toString().padStart(2)}. ${row.column_name.padEnd(20)} ${row.data_type}${maxLength} ${nullable}${defaultVal}`);
    });
    
    // 2. optimizer_db.js에서 사용하는 컬럼들 확인
    console.log('\n🔧 optimizer_db.js에서 사용하는 컬럼들:');
    console.log('   ✅ id - 키워드 식별자');
    console.log('   ✅ keyword - 검색 키워드');
    console.log('   ✅ product_code - 상품 코드');
    console.log('   ✅ agent - 에이전트 이름');
    console.log('   ✅ optimization_config - JSONB 최적화 설정');
    console.log('   📊 success_count, fail_count - 성공/실패 카운트');
    console.log('   📊 total_blocks - 총 차단 횟수');
    console.log('   🔄 cart_click_enabled - 카트 클릭 활성화');
    
    // 3. optimization_config 구조 분석
    console.log('\n⚙️ optimization_config JSONB 구조:');
    const sampleResult = await dbServiceV2.query(`
      SELECT id, keyword, optimization_config 
      FROM v2_test_keywords 
      WHERE optimization_config IS NOT NULL 
      ORDER BY id DESC 
      LIMIT 3
    `);
    
    sampleResult.rows.forEach(row => {
      console.log(`\nID ${row.id}: ${row.keyword}`);
      console.log('   Config Keys:', Object.keys(row.optimization_config || {}).join(', '));
      if (row.optimization_config) {
        const config = row.optimization_config;
        console.log(`   - coupang_main_allow: ${JSON.stringify(config.coupang_main_allow || [])}`);
        console.log(`   - front_cdn_allow: ${JSON.stringify(config.front_cdn_allow || [])}`);
        console.log(`   - image_cdn_allow: ${JSON.stringify(config.image_cdn_allow || [])}`);
        console.log(`   - mercury_allow: ${JSON.stringify(config.mercury_allow || [])}`);
      }
    });
    
    // 4. 새로운 테스트를 위한 권장사항
    console.log('\n🎯 새로운 좁은 범위 테스트 권장사항:');
    console.log('   1. 기존 데이터 백업 완료 ✅');
    console.log('   2. 현재 ID 범위: 16-61 (46개 레코드)');
    console.log('   3. 새 테스트용 추가 컬럼 고려사항:');
    console.log('      - test_group VARCHAR(20) - 테스트 그룹 구분');
    console.log('      - priority INTEGER - 실행 우선순위');
    console.log('      - expected_traffic_kb INTEGER - 예상 트래픽 (KB)');
    console.log('      - actual_traffic_kb INTEGER - 실제 트래픽 (KB)');
    console.log('      - test_notes TEXT - 테스트 메모');
    console.log('      - is_active BOOLEAN DEFAULT true - 활성화 여부');
    
    // 5. optimizer_db.js 수정 포인트
    console.log('\n🔧 optimizer_db.js 수정 포인트:');
    console.log('   ✅ buildDomainRulesFromV2Config() - 이미 완벽 구현');
    console.log('   ✅ applyDynamicOptimization() - keywordData 매개변수 지원');
    console.log('   📝 추가 고려사항:');
    console.log('      - 테스트 그룹별 다른 최적화 전략');
    console.log('      - 트래픽 목표치 동적 조정');
    console.log('      - A/B 테스트 지원');
    
    // 6. 현재 성능 요약
    const perfResult = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_keywords,
        SUM(success_count) as total_success,
        SUM(fail_count) as total_fail,
        AVG(success_count) as avg_success,
        COUNT(DISTINCT agent) as unique_agents
      FROM v2_test_keywords
    `);
    
    const perf = perfResult.rows[0];
    const successRate = ((perf.total_success / (perf.total_success + perf.total_fail)) * 100).toFixed(1);
    
    console.log('\n📊 현재 성능 요약:');
    console.log(`   전체 키워드: ${perf.total_keywords}개`);
    console.log(`   총 성공: ${perf.total_success}회`);
    console.log(`   총 실패: ${perf.total_fail}회`);
    console.log(`   평균 성공: ${Math.round(perf.avg_success)}회/키워드`);
    console.log(`   성공률: ${successRate}%`);
    console.log(`   사용 에이전트: ${perf.unique_agents}개`);
    
    console.log('\n🚀 새로운 테스트 준비 완료!');
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

checkCurrentStructure();