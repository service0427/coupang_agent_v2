/**
 * V2 로깅 시스템 테스트
 * - 실행 로그, 액션 로그, 네트워크 로그 테스트
 */

const dbServiceV2 = require('../lib/services/db-service-v2');
const ExecutionLogger = require('../lib/services/execution-logger');
const ActionLogger = require('../lib/services/action-logger');
const NetworkLogger = require('../lib/services/network-logger');

async function testV2Logging() {
  console.log('=====================================================');
  console.log('V2 로깅 시스템 테스트');
  console.log('=====================================================\n');
  
  try {
    // 1. 테스트용 키워드 데이터
    const testKeyword = {
      id: 1,
      keyword: '테스트',
      suffix: null,
      product_code: '12345',
      agent: 'test',
      coupang_main_allow: '["document", "xhr"]',
      mercury_allow: '["document"]'
    };
    
    // 2. ExecutionLogger 테스트
    console.log('📝 ExecutionLogger 테스트...');
    const execLogger = new ExecutionLogger();
    
    // 실행 시작
    const { executionId, sessionId } = await execLogger.startExecution(testKeyword, 'goto');
    console.log(`   ✅ 실행 시작 - ID: ${executionId}, Session: ${sessionId}`);
    
    // 페이지 도달
    await execLogger.logPageReached(1234);
    
    // 상품 검색
    await execLogger.logProductSearched(60, 1);
    
    // 상품 발견
    await execLogger.logProductFound({
      page: 1,
      rank: 15,
      rankInPage: 15,
      urlRank: 15,
      realRank: 15
    });
    
    // 상품 클릭
    await execLogger.logProductClicked({
      success: true,
      clickTime: 567,
      pageReached: true
    });
    
    // 페이지 로딩 상태
    await execLogger.logPageLoadStatus({
      urlChanged: true,
      domLoaded: true,
      fullyLoaded: true,
      titleLoaded: true,
      cartVisible: true,
      cartEnabled: true,
      timeout: false
    });
    
    // 3. ActionLogger 테스트
    console.log('\n🎯 ActionLogger 테스트...');
    const actionLogger = new ActionLogger(executionId, sessionId);
    
    // 네비게이션 액션
    const navAction = await actionLogger.logNavigation('https://www.coupang.com');
    console.log(`   ✅ 네비게이션 액션 로그 - ID: ${navAction.actionId}`);
    
    // 클릭 액션
    const clickAction = await actionLogger.logClick('#product-item-1');
    console.log(`   ✅ 클릭 액션 로그 - ID: ${clickAction.actionId}`);
    
    // 4. NetworkLogger 테스트
    console.log('\n🌐 NetworkLogger 테스트...');
    const networkLogger = new NetworkLogger(executionId, sessionId);
    
    // 네트워크 요청 로그
    await networkLogger.logRequest({
      requestId: 'req-001',
      url: 'https://www.coupang.com/api/products',
      method: 'GET',
      type: 'xhr',
      headers: { 'User-Agent': 'Test' }
    });
    
    // 네트워크 응답 로그
    await networkLogger.logResponse({
      requestId: 'req-001',
      status: 200,
      headers: { 'content-type': 'application/json' },
      size: 1024,
      bodySize: 1000,
      fromCache: false
    });
    
    console.log(`   ✅ 네트워크 로그 기록`);
    
    // 통계 확인
    const stats = networkLogger.getStatistics();
    console.log(`   📊 네트워크 통계:`, stats);
    
    // 5. 실행 완료
    console.log('\n📝 실행 완료 처리...');
    await networkLogger.flush(); // 대기 중인 네트워크 로그 처리
    
    await execLogger.completeExecution({
      success: true,
      errorMessage: null,
      finalUrl: 'https://www.coupang.com/vp/products/12345',
      searchQuery: '테스트',
      proxyUsed: null,
      actualIp: '127.0.0.1',
      itemId: 12345,
      vendorItemId: 67890
    });
    
    console.log('   ✅ 실행 완료 로그 기록');
    
    // 6. 결과 확인
    console.log('\n📊 기록된 데이터 확인...');
    const checkResult = await dbServiceV2.query(`
      SELECT 
        e.id,
        e.keyword_id,
        e.success,
        e.product_found,
        e.product_click_success,
        e.product_page_fully_loaded,
        e.total_traffic_mb,
        (SELECT COUNT(*) FROM v2_action_logs WHERE execution_id = e.id) as action_count,
        (SELECT COUNT(*) FROM v2_network_logs WHERE execution_id = e.id) as network_count
      FROM v2_execution_logs e
      WHERE e.id = $1
    `, [executionId]);
    
    if (checkResult.rows.length > 0) {
      const row = checkResult.rows[0];
      console.log('   실행 로그:');
      console.log(`   - 성공: ${row.success}`);
      console.log(`   - 상품 발견: ${row.product_found}`);
      console.log(`   - 클릭 성공: ${row.product_click_success}`);
      console.log(`   - 페이지 로드: ${row.product_page_fully_loaded}`);
      console.log(`   - 액션 수: ${row.action_count}`);
      console.log(`   - 네트워크 요청 수: ${row.network_count}`);
    }
    
    console.log('\n✅ V2 로깅 시스템 테스트 완료!');
    
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  } finally {
    await dbServiceV2.close();
  }
}

// 스크립트 실행
if (require.main === module) {
  testV2Logging().catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
}