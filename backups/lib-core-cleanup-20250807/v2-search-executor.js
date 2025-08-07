/**
 * V2 검색 실행자 - 4단계 중심의 단순화된 로깅
 * 기존 search-executor를 V2 로깅 시스템으로 업그레이드
 */

const V2ExecutionLogger = require('../services/v2-execution-logger');
const SmartNavigationHandler = require('../handlers/smart-navigation-handler');

/**
 * V2 키워드 검색 실행 (4단계 추적)
 */
async function executeKeywordSearchV2(page, keywordData, options = {}, networkMonitor = null) {
  const logger = new V2ExecutionLogger();
  let searchResult = {
    success: false,
    errorMessage: null,
    cartClicked: false,
    executionId: null,
    finalStage: 0
  };

  try {
    // ═══════════════════════════════════════════════════════════════
    // 실행 시작 로깅
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n🚀 [V2] 키워드 검색 시작: "${keywordData.keyword}" (${keywordData.product_code})`);
    
    const searchMode = keywordData.search ? 'search' : 'goto';
    const execution = await logger.startExecution(keywordData, options.agent || 'default', searchMode);
    searchResult.executionId = execution.id;

    // ═══════════════════════════════════════════════════════════════
    // Stage 1: 상품 검색/이동 (search or goto)
    // ═══════════════════════════════════════════════════════════════
    logger.startStage1();
    console.log(`📍 [V2-Stage1] ${searchMode === 'search' ? '검색' : 'URL 이동'} 시작`);

    try {
      let targetUrl;
      
      if (searchMode === 'search') {
        // 검색 모드: 쿠팡 메인페이지에서 검색
        targetUrl = 'https://www.coupang.com/';
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // 검색 실행
        const searchQuery = keywordData.keyword;
        const searchBox = await page.waitForSelector('#headerSearchKeyword', { timeout: 10000 });
        await searchBox.fill(searchQuery);
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
          page.click('button[data-ved="search"]')
        ]);
        
      } else {
        // goto 모드: 직접 상품 검색 결과 페이지로 이동
        const encodedKeyword = encodeURIComponent(keywordData.keyword);
        targetUrl = `https://www.coupang.com/np/search?component=&q=${encodedKeyword}`;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      await logger.completeStage1Success();
      searchResult.finalStage = 1;
      console.log(`✅ [V2-Stage1] ${searchMode} 완료`);

    } catch (stage1Error) {
      await logger.completeStage1Failed(stage1Error.message);
      searchResult.errorMessage = `Stage1 실패: ${stage1Error.message}`;
      return searchResult;
    }

    // ═══════════════════════════════════════════════════════════════
    // Stage 2: 상품 찾기 (1~10페이지)
    // ═══════════════════════════════════════════════════════════════
    logger.startStage2();
    console.log(`🔍 [V2-Stage2] 상품 검색 시작: ${keywordData.product_code}`);

    const smartNav = new SmartNavigationHandler(page, logger);
    await smartNav.startProductSearch(keywordData.product_code);

    try {
      const findResult = await smartNav.searchProductsOnPage(1);
      
      if (findResult.found) {
        // 상품 발견 성공
        searchResult.finalStage = 2;
        searchResult.productElement = findResult.element;
        searchResult.foundPage = findResult.page;
        searchResult.foundPosition = findResult.position;
        
        console.log(`✅ [V2-Stage2] 상품 발견: ${findResult.page}페이지 ${findResult.position}위`);
      } else {
        // 상품 찾기 실패 - 이미 logger에서 처리됨
        searchResult.errorMessage = `Stage2 실패: ${findResult.error}`;
        return searchResult;
      }

    } catch (stage2Error) {
      await logger.completeStage2Failed({ pagesSearched: 1, totalProducts: 0 }, stage2Error.message);
      searchResult.errorMessage = `Stage2 실패: ${stage2Error.message}`;
      return searchResult;
    }

    // ═══════════════════════════════════════════════════════════════
    // Stage 3: 상품 클릭
    // ═══════════════════════════════════════════════════════════════
    console.log(`🖱️  [V2-Stage3] 상품 클릭 시작`);

    try {
      const clickResult = await smartNav.smartProductClick(searchResult.productElement, {
        foundPage: searchResult.foundPage,
        position: searchResult.foundPosition
      });

      if (clickResult.success) {
        searchResult.finalStage = 3;
        searchResult.productPageUrl = clickResult.finalUrl;
        console.log(`✅ [V2-Stage3] 상품 클릭 완료`);
      } else {
        searchResult.errorMessage = `Stage3 실패: ${clickResult.error}`;
        return searchResult;
      }

    } catch (stage3Error) {
      await logger.completeStage3Failed({ attempts: 1 }, stage3Error.message);
      searchResult.errorMessage = `Stage3 실패: ${stage3Error.message}`;
      return searchResult;
    }

    // ═══════════════════════════════════════════════════════════════
    // Stage 4: 장바구니 클릭 (선택적)
    // ═══════════════════════════════════════════════════════════════
    if (keywordData.cart_click_enabled) {
      console.log(`🛒 [V2-Stage4] 장바구니 클릭 시작`);

      try {
        const cartResult = await smartNav.smartCartClick();

        if (cartResult.success) {
          searchResult.finalStage = 4;
          searchResult.cartClicked = true;
          console.log(`✅ [V2-Stage4] 장바구니 클릭 완료`);
        } else {
          searchResult.errorMessage = `Stage4 실패: ${cartResult.error}`;
          await logger.addWarning(`장바구니 클릭 실패하였으나 3단계까지는 성공`);
          // Stage4 실패해도 3단계까지는 성공으로 간주
          searchResult.success = true;
          searchResult.finalStage = 3;
        }

      } catch (stage4Error) {
        await logger.completeStage4Failed({ attempts: 1 }, stage4Error.message);
        await logger.addWarning(`장바구니 클릭 오류: ${stage4Error.message}`);
        // Stage4 실패해도 3단계까지는 성공으로 간주
        searchResult.success = true;
        searchResult.finalStage = 3;
      }
    } else {
      // 장바구니 클릭이 비활성화된 경우
      await logger.skipStage4();
      searchResult.finalStage = 3;
      console.log(`⏭️  [V2-Stage4] 장바구니 클릭 건너뛰기`);
    }

    // 최종 성공 판정
    if (searchResult.finalStage >= 3) {
      searchResult.success = true;
    }

  } catch (criticalError) {
    // 예상치 못한 치명적 오류
    console.error(`💥 [V2] 치명적 오류:`, criticalError.message);
    searchResult.errorMessage = `치명적 오류: ${criticalError.message}`;
    
    await logger.updateExecution({
      critical_error_message: criticalError.message,
      final_status: 'critical_error'
    });
  } finally {
    // ═══════════════════════════════════════════════════════════════
    // 실행 완료 로깅
    // ═══════════════════════════════════════════════════════════════
    let trafficInfo = null;
    if (networkMonitor) {
      const trafficStats = networkMonitor.getTrafficStats();
      trafficInfo = {
        totalBytes: trafficStats.totalBytes,
        blockedCount: trafficStats.blockedCount,
        domainSummary: trafficStats.domainBreakdown,
        typeSummary: trafficStats.typeBreakdown,
        cachedBytes: trafficStats.cachedBytes
      };
    }

    const finalExecution = await logger.completeExecution(trafficInfo);
    
    console.log(`🏁 [V2] 실행 완료 - Stage ${searchResult.finalStage}/4 (${searchResult.success ? '성공' : '실패'})`);
    console.log(`   └ 실행 ID: ${finalExecution.id}, 추적 키: ${finalExecution.tracking_key}`);

    searchResult.executionId = finalExecution.id;
    searchResult.trackingKey = finalExecution.tracking_key;
  }

  return searchResult;
}

module.exports = {
  executeKeywordSearchV2
};