/**
 * V2 로깅 시스템 사용 예제
 * 새로운 4단계 추적 시스템 사용법 시연
 */

const { executeKeywordSearchV2 } = require('../lib/core/v2-search-executor');
const chromeLauncher = require('../lib/core/chrome-launcher');
const dbService = require('../lib/services/db-service');

async function runV2Example() {
  console.log('🚀 V2 로깅 시스템 사용 예제\n');

  let browser = null;
  
  try {
    // 1. 키워드 데이터 조회 (DB에서)
    const keywords = await dbService.getKeywords('test');
    
    if (keywords.length === 0) {
      console.log('❌ 테스트용 키워드가 없습니다.');
      console.log('   먼저 v2_test_keywords 테이블에 데이터를 추가하세요.');
      return;
    }

    const keyword = keywords[0]; // 첫 번째 키워드 사용
    console.log(`📋 테스트 키워드: "${keyword.keyword}" (${keyword.product_code})`);
    console.log(`   └ 모드: goto 기본 (차단 시 search 모드로 자동 전환)`);
    console.log(`   └ 장바구니: ${keyword.cart_click_enabled ? '활성' : '비활성'}\n`);

    // 2. 브라우저 실행
    console.log('🌐 브라우저 실행 중...');
    const { browser: chromeBrowser, page, networkMonitor } = await chromeLauncher.launchChrome({
      headless: false,
      usePersistent: true,    // 하드코딩: 항상 영구 프로필 사용
      clearCache: false,      // 하드코딩: 캐시 유지, session만 삭제
      trafficMonitor: true
    });
    browser = chromeBrowser;

    console.log(`   ✅ 브라우저 시작됨 (PID: ${browser.process()?.pid || 'unknown'})\n`);

    // 3. V2 검색 실행
    const options = {
      agent: 'v2-example',
      checkCookies: false,
      trafficMonitor: networkMonitor
    };

    console.log('═'.repeat(60));
    const result = await executeKeywordSearchV2(page, keyword, options, networkMonitor);
    console.log('═'.repeat(60));

    // 4. 결과 분석
    console.log('\n📊 실행 결과:');
    console.log(`   🎯 성공 여부: ${result.success ? '✅ 성공' : '❌ 실패'}`);
    console.log(`   🏁 최종 단계: ${result.finalStage}/4`);
    
    if (result.success) {
      console.log(`   🔍 상품 발견: ${result.foundPage || 'N/A'}페이지 ${result.foundPosition || 'N/A'}위`);
      console.log(`   🛒 장바구니: ${result.cartClicked ? '✅ 클릭됨' : '❌ 클릭 안됨'}`);
    } else {
      console.log(`   ❌ 오류: ${result.errorMessage}`);
    }
    
    console.log(`   📄 실행 ID: ${result.executionId}`);
    console.log(`   🔑 추적 키: ${result.trackingKey}`);

    // 5. 데이터베이스 결과 확인
    if (result.executionId) {
      console.log('\n📋 데이터베이스 기록 확인:');
      
      const dbResult = await dbService.executeQuery(`
        SELECT 
          id,
          keyword,
          product_code,
          tracking_key,
          stage1_search_status,
          stage2_find_status,
          stage3_click_status,
          stage4_cart_status,
          final_status,
          overall_success,
          last_successful_stage,
          duration_ms
        FROM v2_execution_logs 
        WHERE id = $1
      `, [result.executionId]);

      if (dbResult.rows.length > 0) {
        const record = dbResult.rows[0];
        console.log('   ┌─ 단계별 상태 ─┐');
        console.log(`   │ Stage 1: ${record.stage1_search_status.padEnd(8)} │`);
        console.log(`   │ Stage 2: ${record.stage2_find_status.padEnd(8)} │`);  
        console.log(`   │ Stage 3: ${record.stage3_click_status.padEnd(8)} │`);
        console.log(`   │ Stage 4: ${record.stage4_cart_status.padEnd(8)} │`);
        console.log('   └─────────────────┘');
        console.log(`   📈 최종 상태: ${record.final_status}`);
        console.log(`   ⏱️  실행 시간: ${record.duration_ms}ms`);
        console.log(`   🎯 완료 단계: ${record.last_successful_stage}/4`);
      }
    }

    // 6. 통계 확인 (선택적)
    console.log('\n📈 최근 통계:');
    const statsResult = await dbService.executeQuery(`
      SELECT 
        tracking_key,
        total_executions,
        success_rate,
        avg_completion_stage,
        full_success_count,
        failed_count
      FROM v2_performance_stats 
      WHERE tracking_key LIKE $1
      LIMIT 5
    `, [`%${keyword.product_code}%`]);

    if (statsResult.rows.length > 0) {
      statsResult.rows.forEach(stat => {
        console.log(`   🔑 ${stat.tracking_key}:`);
        console.log(`      └ 실행: ${stat.total_executions}회, 성공률: ${parseFloat(stat.success_rate).toFixed(1)}%`);
        console.log(`      └ 평균 완료 단계: ${parseFloat(stat.avg_completion_stage).toFixed(1)}/4`);
      });
    } else {
      console.log('   └ 아직 통계 데이터가 충분하지 않습니다.');
    }

  } catch (error) {
    console.error('\n💥 예제 실행 중 오류:', error.message);
    console.error('스택 추적:', error.stack);
  } finally {
    // 7. 정리
    if (browser && browser.isConnected()) {
      console.log('\n👋 브라우저 종료 중...');
      await browser.close();
    }
    console.log('✅ V2 예제 실행 완료\n');
  }
}

// 단독 실행
if (require.main === module) {
  runV2Example().catch(console.error);
}

module.exports = {
  runV2Example
};