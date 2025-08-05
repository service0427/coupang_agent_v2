/**
 * 쿠팡 웹사이트 자동화 핸들러 (Chrome 전용)
 * - 상품 코드로 검색 및 클릭
 * - 순위 측정
 * - 장바구니 클릭 옵션
 */

const errorLogger = require('../services/error-logger');
const { checkIP, checkWebDriverStatus } = require('../utils/browser-checker');
const { executeSearchMode, executeDirectMode } = require('./search-mode-handler');
const { extractProductList, findTargetProduct, clickProduct, handleCart } = require('./product-finder');
const { moveToNextPage } = require('./pagination-handler');
const { checkCookies } = require('../utils/cookie-checker');
const cookieTracker = require('../trackers/cookie-tracker');
const NetworkAnalyzer = require('../network/analyzer');

/**
 * 특정 상품 코드 검색 및 클릭
 * @param {Page} page - Playwright 페이지 객체
 * @param {Object} options - 검색 옵션
 * @returns {Object} 실행 결과
 */
async function searchAndClickProduct(page, options = {}) {
  const {
    keyword = '노트북',
    suffix = '',
    productCode = '',
    cartClickEnabled = false,
    maxPages = 10,
    proxyConfig = null,
    searchMode = false,  // true: 검색창 입력, false: URL 직접 이동
    optimizationLevel = 'balanced',  // 최적화 수준: 'maximum', 'balanced', 'minimal', false
    networkMonitor = null  // 네트워크 모니터 인스턴스
  } = options;

  const startTime = Date.now();
  const result = {
    success: false,
    productFound: false,
    productRank: null,
    pagesSearched: 0,
    cartClicked: false,
    errorMessage: null,
    durationMs: 0,
    urlRank: null,
    realRank: null,
    itemId: null,
    vendorItemId: null
  };

  // 쿠키 추적을 위한 변수 (try 블록 외부에 선언)
  let initialCookies = [];
  let actualIp = null;

  try {
    // 쿠키 추적 초기화 (옵션 활성화 시)
    if (options.checkCookies) {
      console.log(`🍪 쿠키 추적 활성화`);
      await cookieTracker.init('default');
      initialCookies = await cookieTracker.saveInitialCookies(page.context());
    }
    
    // IP 확인
    actualIp = await checkIP(page);
    
    // 검색어 조합
    const searchQuery = suffix ? `${keyword} ${suffix}` : keyword;
    const keywordInfo = options.keywordId ? `[ID: ${options.keywordId}] ` : '';
    console.log(`🔍 ${keywordInfo}검색어: "${searchQuery}"`);
    console.log(`🎯 ${keywordInfo}찾을 상품 코드: ${productCode || '랜덤'}`);
    console.log('');
    
    // 검색 모드에 따라 페이지 접근
    if (searchMode) {
      const searchResult = await executeSearchMode(page, searchQuery, optimizationLevel, options);
      if (!searchResult.success) {
        result.errorMessage = searchResult.errorMessage;
        return result;
      }
    } else {
      await executeDirectMode(page, searchQuery, options);
    }
    
    await page.waitForTimeout(3000);
    
    // WebDriver 상태 확인
    await checkWebDriverStatus(page);
    
    // 쿠키 체크 (검색 결과 페이지에서)
    if (options.checkCookies) {
      const context = page.context();
      await checkCookies(context);
    }
    
    // 상품 검색 시작
    let productFound = false;
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      result.pagesSearched = pageNum;
      
      console.log(`📄 ${keywordInfo}페이지 ${pageNum} 검색 중...`);
      
      // 상품 목록 추출
      let products;
      try {
        products = await extractProductList(page, productCode, options.keywordId);
      } catch (error) {
        console.log(`❌ ${error.message}`);
        result.errorMessage = error.message;
        
        // 에러 로깅
        await errorLogger.logError({
          errorMessage: error.message,
          pageUrl: page.url(),
          proxyUsed: proxyConfig?.server,
          actualIp: actualIp,
          keywordId: options.keywordId,
          agent: options.agent
        });
        
        break;
      }
      
      // 타겟 상품 찾기
      const targetProduct = findTargetProduct(products, productCode, options.keywordId);
      
      if (targetProduct) {
        try {
          // 상품 클릭
          const clickResult = await clickProduct(page, targetProduct, productCode, pageNum, products.length, options.keywordId);
          
          result.success = true;
          result.productFound = true;
          result.productRank = clickResult.productRank;
          result.urlRank = clickResult.urlRank;
          result.realRank = clickResult.realRank;
          result.itemId = clickResult.itemId;
          result.vendorItemId = clickResult.vendorItemId;
          
          // 장바구니 처리
          const cartResult = await handleCart(page, cartClickEnabled, options.keywordId);
          result.cartClicked = cartResult.cartClicked;
          
          productFound = true;
          break;
          
        } catch (error) {
          console.log(`❌ ${keywordInfo}[상품 처리 오류]`);
          console.log(`   ${keywordInfo}발생 위치: ${error.stack ? error.stack.split('\n')[1].trim() : '알 수 없음'}`);
          console.log(`   ${keywordInfo}에러 메시지: ${error.message}`);
          result.errorMessage = error.message;
          
          // 차단 에러인 경우 즉시 종료
          if (error.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
              error.message.includes('쿠팡 접속 차단')) {
            productFound = true; // 더 이상 페이지 검색 방지
          }
          break;
        }
      }
      
      // 다음 페이지로 이동
      if (pageNum < maxPages && !productFound) {
        const moved = await moveToNextPage(page);
        if (!moved) {
          break;
        }
      }
    }
    
    if (!productFound && !result.errorMessage) {
      if (!productCode) {
        console.log(`❌ ${keywordInfo}랜덤 선택할 상품을 찾을 수 없습니다. (rank 파라미터가 있는 상품 없음)`);
      } else {
        console.log(`❌ ${keywordInfo}상품을 찾을 수 없습니다.`);
      }
      console.log(`   ${keywordInfo}검색한 페이지 수: ${result.pagesSearched}`);
      result.errorMessage = '상품을 찾을 수 없음';
    }
    
  } catch (error) {
    console.error(`❌ 오류 발생:`, error.message);
    result.errorMessage = error.message;
    
    // 에러 로깅
    const errorCode = errorLogger.extractErrorCode(error);
    await errorLogger.logError({
      errorCode: errorCode,
      errorMessage: error.message,
      pageUrl: page.url(),
      proxyUsed: proxyConfig?.server,
      actualIp: actualIp,
      keywordId: options.keywordId,
      agent: options.agent,
      requireErrorCode: false
    });
  } finally {
    result.durationMs = Date.now() - startTime;
    result.actualIp = actualIp;
    const keywordInfo = options.keywordId ? `[ID:${options.keywordId}] ` : '';
    console.log(`${keywordInfo}⏱️ 소요 시간: ${(result.durationMs / 1000).toFixed(2)}초`);
    
    // 쿠키 추적 완료 (옵션 활성화 시)
    if (options.checkCookies) {
      const finalCookies = await cookieTracker.saveFinalCookies(page.context());
      const comparison = await cookieTracker.compareCookies(initialCookies, finalCookies);
      cookieTracker.printComparison(comparison);
    }
    
    // 네트워크 트래픽 분석 (옵션 활성화 시)
    if (networkMonitor) {
      networkMonitor.stop();
      const networkData = networkMonitor.getData();
      const analyzer = new NetworkAnalyzer();
      analyzer.analyze(networkData);
      
      // 요약 분석 출력
      analyzer.printAnalysis();
      
      // 리포트 저장
      if (options.keywordId && options.agent) {
        // JSON 리포트 저장
        await analyzer.saveReport(options.keywordId, options.agent);
        
        // 캐시 분석 리포트 저장 (캐시 히트가 있을 때)
        if (networkData.cacheStats && networkData.cacheStats.fromCache > 0) {
          await analyzer.saveCacheReport(options.keywordId, options.agent);
        }
        
        // 상세 텍스트 리포트 저장 (상세 분석 모드일 때)
        if (options.trafficDetail) {
          await analyzer.saveDetailedReport(options.keywordId, options.agent);
        }
      }
    }
  }
  
  return result;
}

module.exports = {
  searchAndClickProduct,
  checkIP,
  checkWebDriverStatus
};