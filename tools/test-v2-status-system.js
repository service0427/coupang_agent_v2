/**
 * V2 상태 기반 로깅 시스템 테스트
 */

const ExecutionLogger = require('../lib/services/execution-logger');
const ActionLoggerV2 = require('../lib/services/action-logger-v2');
const { ActionStatus, ActionType } = require('../lib/constants/action-status');
const { ExecutionStatus } = require('../lib/constants/execution-status');

async function testStatusSystem() {
  console.log('=====================================================');
  console.log('V2 상태 기반 로깅 시스템 테스트');
  console.log('=====================================================\n');
  
  try {
    // 1. ExecutionLogger 테스트
    console.log('📊 ExecutionLogger 상태 추적 테스트...');
    const execLogger = new ExecutionLogger();
    
    // 테스트용 키워드 데이터
    const testKeyword = {
      id: 1,
      keyword: '테스트 상품',
      product_code: '12345',
      agent: 'test',
      coupang_main_allow: '["document"]'
    };
    
    // 실행 시작
    const { executionId, sessionId } = await execLogger.startExecution(testKeyword, 'goto');
    console.log(`   ✅ 실행 시작 - 상태: ${execLogger.currentStatus}`);
    
    // 페이지 도달
    await execLogger.logPageReached(1500);
    console.log(`   📊 현재 상태: ${execLogger.currentStatus}`);
    
    // 상품 검색
    await execLogger.logProductSearched(45, 1);
    console.log(`   📊 현재 상태: ${execLogger.currentStatus}`);
    
    // 상품 발견
    await execLogger.logProductFound({
      page: 1,
      rank: 8,
      rankInPage: 8,
      urlRank: 8,
      realRank: 8
    });
    console.log(`   📊 현재 상태: ${execLogger.currentStatus}`);
    
    // 2. ActionLoggerV2 테스트
    console.log('\n🎯 ActionLoggerV2 상태 추적 테스트...');
    const actionLogger = new ActionLoggerV2(executionId, sessionId);
    
    // 네비게이션 액션
    console.log('\n--- 네비게이션 액션 ---');
    const navActionId = await actionLogger.logNavigation('https://www.coupang.com', {
      detail: { timeout: 30000 }
    });
    
    // 상태 전환 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 100));
    await actionLogger.updateActionStatus(navActionId, ActionStatus.DOM_READY, {
      message: 'DOM 로드 완료'
    });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    await actionLogger.updateActionStatus(navActionId, ActionStatus.LOADED, {
      message: '페이지 완전 로드'
    });
    
    await actionLogger.completeAction(navActionId, {
      success: true,
      currentUrl: 'https://www.coupang.com',
      pageTitle: '쿠팡!'
    });
    
    // 클릭 액션
    console.log('\n--- 클릭 액션 ---');
    const clickActionId = await actionLogger.logClick('#product-item-1', {
      detail: { productCode: '12345' }
    });
    
    // 요소 찾기 상태
    await new Promise(resolve => setTimeout(resolve, 200));
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_FOUND, {
      message: '상품 요소 발견'
    });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_VISIBLE, {
      message: '요소 표시됨'
    });
    
    await new Promise(resolve => setTimeout(resolve, 30));
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_CLICKABLE, {
      message: '클릭 가능'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.CLICKING, {
      message: '클릭 시도'
    });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.CLICKED, {
      message: '클릭 완료'
    });
    
    await actionLogger.completeAction(clickActionId, {
      success: true,
      elementVisible: true,
      elementClickable: true
    });
    
    // 상품 검색 액션 (실패 시나리오)
    console.log('\n--- 상품 검색 액션 (실패) ---');
    const searchActionId = await actionLogger.logProductSearch('없는 상품', {
      detail: { timeout: 5000 }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await actionLogger.updateActionStatus(searchActionId, ActionStatus.ERROR_TIMEOUT, {
      message: '검색 타임아웃 발생'
    });
    
    await actionLogger.completeAction(searchActionId, {
      success: false,
      errorType: ActionStatus.ERROR_TIMEOUT,
      errorMessage: '상품 검색 타임아웃'
    });
    
    // 3. 통계 확인
    console.log('\n📈 ActionLogger 통계:');
    const stats = actionLogger.getStatistics();
    console.log(`   총 액션: ${stats.totalActions}개`);
    console.log(`   성공: ${stats.successCount}개`);
    console.log(`   부분 성공: ${stats.partialSuccessCount}개`); 
    console.log(`   실패: ${stats.errorCount}개`);
    console.log(`   평균 소요시간: ${stats.averageDuration}ms`);
    
    if (Object.keys(stats.errorTypes).length > 0) {
      console.log('   오류 타입:');
      Object.entries(stats.errorTypes).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count}회`);
      });
    }
    
    // 4. ExecutionLogger 상태 히스토리
    console.log('\n📊 ExecutionLogger 상태 히스토리:');
    execLogger.statusHistory.forEach((entry, index) => {
      console.log(`   ${index + 1}. ${entry.status} (${entry.duration}ms)`);
      if (entry.data.message) {
        console.log(`      └─ ${entry.data.message}`);
      }
    });
    
    console.log(`   현재 상태: ${execLogger.currentStatus}`);
    
    // 5. 실행 완료
    await execLogger.updateExecutionStatus(ExecutionStatus.SUCCESS, {
      message: '테스트 성공적으로 완료'
    });
    
    await execLogger.completeExecution({
      success: true,
      finalUrl: 'https://www.coupang.com/vp/products/12345',
      searchQuery: '테스트 상품',
      actualIp: '127.0.0.1'
    });
    
    console.log('\n✅ V2 상태 기반 로깅 시스템 테스트 완료!');
    console.log('\n💡 주요 기능:');
    console.log('   - 실행 단계별 상태 추적 (INIT → PREPARING → HOME_LOADED → ...)');
    console.log('   - 액션별 세부 상태 추적 (PENDING → STARTED → SUCCESS/ERROR)');
    console.log('   - 상태 전환 검증 및 로깅');
    console.log('   - 자동 타이밍 측정');
    console.log('   - 상태 히스토리 및 통계');
    
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    console.error(error.stack);
  }
}

// 스크립트 실행
if (require.main === module) {
  testStatusSystem().catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
}