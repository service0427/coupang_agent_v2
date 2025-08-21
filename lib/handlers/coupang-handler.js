/**
 * 쿠팡 웹사이트 자동화 핸들러 (Chrome 전용) - DB 코드 제거 버전
 * - 상품 코드로 검색 및 클릭
 * - 순위 측정
 * - 장바구니 클릭 옵션
 */

const errorLogger = require('../services/error-logger');
const { ExecutionStatus } = require('../constants/execution-status');
const { checkIP, checkIPWithHttp, checkWebDriverStatus } = require('../utils/browser-checker');
const { executeDirectMode } = require('./search-mode-handler');
const { extractProductList, findTargetProduct, clickProduct, handleCart } = require('./product-finder');
const { moveToNextPage } = require('./pagination-handler');
const { checkCookies } = require('../utils/cookie-checker');
const cookieTracker = require('../trackers/cookie-tracker');

/**
 * Result 객체 초기화 헬퍼
 */
function initializeResult() {
  return {
    success: false,
    successLevel: 0,
    currentPage: 0,
    productsFound: 0,
    actualIp: null,
    errorMessage: null,
    errorType: null,
    executionStatus: ExecutionStatus.UNKNOWN,
    productFound: false,
    productRank: null,
    pagesSearched: 0,
    cartClicked: false,
    durationMs: 0,
    urlRank: null,
    realRank: null,
    itemId: null,
    vendorItemId: null
  };
}

/**
 * Result 객체에 공통 필드 설정 헬퍼
 */
function setCommonResultFields(result, actualIp, startTime) {
  result.actualIp = actualIp;
  result.durationMs = Date.now() - startTime;
  return result;
}

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
    maxPages = 15,
    proxyConfig = null,
    optimizationLevel = 'balanced',
    networkMonitor = null,
    keywordData = null,
    keywordId = null,
    agent = null,
    optimizationContext = null,
    threadPrefix = ''
  } = options;

  const startTime = Date.now();
  const result = initializeResult();

  // 쿠키 추적을 위한 변수
  let initialCookies = [];
  let actualIp = null;
  let totalProductsSearched = 0; // 전체 함수 스코프로 이동

  try {
    // 쿠키 추적 초기화
    if (options.checkCookies) {
      console.log(`${threadPrefix} 🍪 쿠키 추적 시작...`);
      // 쿠키 추적 모듈 초기화 (프로필 이름 설정)
      const profileName = options.threadNumber ? `thread_${options.threadNumber}` : 'default';
      await cookieTracker.init(profileName);
      initialCookies = await cookieTracker.saveInitialCookies(page);
    }

    // IP 확인 단계 - 브라우저 시작 후 실행
    console.log(`${threadPrefix} 🌐 IP 확인 중...`);
    const ipCheckResult = await checkIP(page, threadPrefix);
    actualIp = ipCheckResult?.ip || null;

    // 프록시 실패 처리
    if (ipCheckResult && !ipCheckResult.success) {
      // SSL 차단 감지 - 새로운 에러 타입들 처리
      if (ipCheckResult.errorType && ipCheckResult.errorType.startsWith('error_ssl_')) {
        const sslErrorMessage = `SSL/TLS 차단: ${ipCheckResult.error}`;
        console.log(`${threadPrefix} 🔒 ${sslErrorMessage}`);
        
        result.errorMessage = sslErrorMessage;
        result.errorType = ipCheckResult.errorType; // 세분화된 SSL 에러 타입 사용
        result.executionStatus = ExecutionStatus.ERROR_BLOCKED;
        setCommonResultFields(result, actualIp, startTime);
        
        console.log(`${threadPrefix} ❌ SSL 차단으로 인한 실패`)
        
        return result;
      }
      
      const proxyErrorMessage = `프록시 오류: ${ipCheckResult.error}`;
      console.log(`${threadPrefix} ❌ ${proxyErrorMessage}`);
      
      result.errorMessage = proxyErrorMessage;
      result.errorType = ipCheckResult.errorType || 'proxy_failure'; // 세분화된 에러 타입 사용
      result.executionStatus = ExecutionStatus.ERROR_PROXY;
      setCommonResultFields(result, actualIp, startTime);
      
      console.log(`${threadPrefix} ❌ 프록시 실패: ${proxyErrorMessage}`)
      
      return result;
    }
    
    console.log(`${threadPrefix} ✅ 프록시 정상 - 외부 IP: ${actualIp}`);
    
    // 검색어 조합
    const searchQuery = suffix ? `${keyword} ${suffix}` : keyword;
    const keywordInfo = options.keywordId ? `[ID: ${options.keywordId}] ` : '';
    console.log(`${threadPrefix} 🔍 ${keywordInfo}검색어: "${searchQuery}"`);
    console.log(`${threadPrefix} 🎯 ${keywordInfo}찾을 상품 코드: ${productCode || '없음 (필수)'}`);
    console.log(`${threadPrefix} `);
    
    // URL 직접 모드로만 페이지 접근
    const directOptions = {
      ...options,
      threadPrefix
    };
    const directResult = await executeDirectMode(page, searchQuery, directOptions);
    if (!directResult.success) {
      result.errorMessage = directResult.errorMessage;
      console.log(`${threadPrefix} ❌ 페이지 접근 실패: ${directResult.errorMessage}`);
      return result;
    }
    
    // 페이지 도달 로그
    const pageLoadTime = Date.now() - startTime;
    // console.log(`${threadPrefix} ✅ 페이지 도달 (${pageLoadTime}ms)`);
    
    await page.waitForTimeout(3000);
    
    // 프록시 리다이렉트 체크 (192.168.x.x, localhost 감지)
    const currentUrl = page.url();
    if (currentUrl.includes('192.168.') || currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      console.log(`${threadPrefix} ⚠️ 프록시 리다이렉트 감지: ${currentUrl}`);
      console.log(`${threadPrefix} ❌ 네트워크 연결 문제로 검색 중단`);
      
      // 리다이렉트된 탭들 닫기
      const pages = await page.context().pages();
      if (pages.length > 1) {
        for (const p of pages) {
          const url = p.url();
          if (url.includes('192.168.') || url.includes('localhost') || url.includes('127.0.0.1')) {
            console.log(`${threadPrefix} 🔧 리다이렉트 탭 닫기: ${url}`);
            await p.close().catch(() => {});
          }
        }
      }
      
      result.errorMessage = '프록시 리다이렉트 발생 - 네트워크 연결 문제';
      result.errorType = 'proxy_redirect';
      result.executionStatus = ExecutionStatus.ERROR_NETWORK;
      return result;
    }
    
    // WebDriver 상태 확인
    await checkWebDriverStatus(page);
    
    // 쿠키 체크 (검색 결과 페이지에서)
    if (options.checkCookies) {
      console.log(`${threadPrefix} 🍪 검색 페이지 쿠키 확인...`);
      await checkCookies(page);
    }

    // 상품 검색 시작
    let productFound = false;
    let lastSearchPageUrl = null; // 마지막 검색 페이지 URL 추적
    let totalNonAdProducts = 0; // 전체 비광고 제품 누적 카운터
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      result.pagesSearched = pageNum;
      
      console.log(`${threadPrefix} 📄 ${keywordInfo}페이지 ${pageNum} 검색 중...`);
      
      // 현재 검색 페이지 URL 저장 (referer로 사용)
      lastSearchPageUrl = page.url();
      
      // 각 페이지 진입 시 프록시 리다이렉트 체크
      const pageUrl = page.url();
      if (pageUrl.includes('192.168.') || pageUrl.includes('localhost') || pageUrl.includes('127.0.0.1')) {
        console.log(`${threadPrefix} ⚠️ 페이지 ${pageNum}에서 프록시 리다이렉트 감지: ${pageUrl}`);
        console.log(`${threadPrefix} ❌ 네트워크 연결 문제로 검색 중단`);
        
        result.errorMessage = '검색 중 프록시 리다이렉트 발생';
        result.errorType = 'proxy_redirect';
        result.referer = lastSearchPageUrl;
        break;
      }
      
      // 상품 목록 추출
      let products;
      try {
        products = await extractProductList(page, productCode, options.keywordId, threadPrefix);
        totalProductsSearched += products.length;
        // console.log(`${threadPrefix} ✅ 상품 목록 추출 성공 (${products.length}개)`);
      } catch (error) {
        console.log(`${threadPrefix} ❌ ${error.message}`);
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
        
        // 심각한 페이지 오류인지 확인
        const isPageAccessible = !error.message.includes('사이트에 연결할 수 없음') && 
                                 !error.message.includes('net::ERR_') &&
                                 !error.message.includes('ERR_HTTP2_PROTOCOL_ERROR');
        
        if (!isPageAccessible) {
          console.log(`${threadPrefix} 🚫 페이지 접근 불가능, 검색 중단`);
          result.referer = lastSearchPageUrl;
          break;
        }
        
        // 상품 목록 추출 실패시에도 다음 페이지 시도
        products = [];
        console.log(`${threadPrefix} ⚠️ 이 페이지에서 상품을 찾을 수 없음, 다음 페이지 시도...`);
      }
      
      // 현재 페이지의 비광고 제품 수 계산 (타겟 상품 찾기 전에)
      const currentPageNonAdCount = products.filter(p => !p.isAd).length;
      
      // 타겟 상품 찾기
      const targetProduct = findTargetProduct(products, productCode, options.keywordId, threadPrefix);
      
      if (targetProduct) {
        console.log(`${threadPrefix} ✅ 상품 발견 (${pageNum}페이지, ${targetProduct.rank}순위)`);
        
        // 타겟 상품의 실제 누적 순위 계산
        targetProduct.cumulativeRealRank = totalNonAdProducts + targetProduct.realRank;
        
        try {
          // 상품 클릭
          const clickResult = await clickProduct(page, targetProduct, productCode, pageNum, products.length, options.keywordId, threadPrefix);
          
          result.success = true;
          result.productFound = true;
          result.productRank = clickResult.productRank;
          result.urlRank = clickResult.urlRank;
          result.realRank = clickResult.realRank;
          result.itemId = clickResult.itemId;
          result.vendorItemId = clickResult.vendorItemId;
          result.productInfo = clickResult.productInfo;
          result.referer = clickResult.referer;
          
          console.log(`${threadPrefix} ✅ 상품 클릭 성공`);
          
          // 장바구니 처리
          const cartResult = await handleCart(page, cartClickEnabled, options.keywordId, threadPrefix);
          result.cartClicked = cartResult.cartClicked;
          
          if (cartClickEnabled) {
            console.log(`${threadPrefix} 🛒 장바구니 클릭: ${cartResult.cartClicked ? '성공' : '실패'}`);
          }
          
          productFound = true;
          break;
          
        } catch (error) {
          console.log(`${threadPrefix} ❌ ${keywordInfo}[상품 처리 오류]`);
          console.log(`${threadPrefix}    ${keywordInfo}발생 위치: ${error.stack ? error.stack.split('\n')[1].trim() : '알 수 없음'}`);
          console.log(`${threadPrefix}    ${keywordInfo}에러 메시지: ${error.message}`);
          
          result.errorMessage = error.message;
          break;
        }
      }
      
      // 다음 페이지로 이동하기 전에 현재 페이지의 비광고 제품 수 누적
      totalNonAdProducts += currentPageNonAdCount;
      
      // 마지막 페이지가 아니면 다음 페이지로
      if (pageNum < maxPages && !productFound) {
        const nextPageResult = await moveToNextPage(page, pageNum, threadPrefix);
        if (!nextPageResult.success) {
          console.log(`${threadPrefix} ⚠️ ${keywordInfo}다음 페이지로 이동 실패`);
          break;
        }
        await page.waitForTimeout(3000);
      }
    }
    
    if (!productFound) {
      result.success = false;
      console.log(`${threadPrefix} 📊 ${keywordInfo}총 ${totalProductsSearched}개 상품 검색 완료`);
      
      console.log(`${threadPrefix} ❌ ${keywordInfo}상품을 찾을 수 없습니다.`);
      console.log(`${threadPrefix}    ${keywordInfo}검색한 페이지 수: ${result.pagesSearched}`);
      result.errorMessage = '상품을 찾을 수 없음';
      result.referer = lastSearchPageUrl; // 마지막 검색 페이지 URL
    }
    
  } catch (error) {
    console.error(`❌ 오류 발생:`, error.message);
    result.errorMessage = error.message;
    result.referer = lastSearchPageUrl; // 에러 발생시에도 마지막 검색 페이지 URL 포함
    
    // 차단 감지
    const isBlocked = error.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
                     error.message.includes('쿠팡 접속 차단') ||
                     error.message.includes('net::ERR_HTTP2_PROTOCOL_ERROR');
    
    if (isBlocked) {
      console.log(`${threadPrefix} 🚫 차단 감지`);
      console.log(`${threadPrefix} 💡 [Info] 공유 캐시 사용 중 - 다음 실행시 독립 캐시로 자동 전환됨`);
    }
    
    // 점검 페이지 감지
    if (error.errorType === 'maintenance' || error.message.includes('점검 페이지')) {
      console.log(`${threadPrefix} 🔧 쿠팡 점검 중 - 상품 페이지 접근 불가`);
      result.errorType = 'maintenance';
    }
    
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
    setCommonResultFields(result, actualIp, startTime);
    // 검색된 상품 수 설정
    result.productsFound = totalProductsSearched;
    const keywordInfo = options.keywordId ? `[ID:${options.keywordId}] ` : '';
    const trafficMb = networkMonitor ? (networkMonitor.getAnalysisData()?.totalSize || 0) / (1024 * 1024) : 0;
    const trafficInfo = trafficMb > 0 ? ` | 📊 ${trafficMb.toFixed(2)}MB` : '';
    console.log(`${threadPrefix} ${keywordInfo}⏱️ 소요 시간: ${(result.durationMs / 1000).toFixed(2)}초${trafficInfo}`);
    
    // 트래픽 사용량 표시
    if (networkMonitor) {
      const analysisData = networkMonitor.getAnalysisData();
      const networkOnlyMb = analysisData.networkOnlySize ? analysisData.networkOnlySize / (1024 * 1024) : 0;
      const cacheSavingsMb = parseFloat(analysisData.cacheStats?.cacheSavingsMB || 0);
      const cacheHitRate = analysisData.cacheStats?.cacheHitRate || 0;
      
      let trafficDisplay = `네트워크: ${networkOnlyMb.toFixed(2)}MB`;
      if (cacheSavingsMb > 0.1) {
        trafficDisplay += `, 캐시절약: ${cacheSavingsMb.toFixed(2)}MB (${cacheHitRate}% 히트)`;
      }
      
      console.log(`${threadPrefix} 📊 트래픽: ${trafficDisplay}`);
    }
    
    // --monitor 옵션이 있는 경우 허용된 요청을 파일로 저장
    if (networkMonitor && process.argv.includes('--monitor')) {
      try {
        const logResult = await networkMonitor.saveAllowedRequestsToFile(keywordId, agent);
        if (logResult) {
          console.log(`${threadPrefix} 📝 [Monitor] 허용된 요청 로그 저장: ${logResult.filename}`);
        }
      } catch (logError) {
        console.error('📝 [Monitor] 로그 저장 실패:', logError.message);
      }
    }
    
    // 쿠키 추적 완료
    if (options.checkCookies) {
      const finalCookies = await cookieTracker.saveFinalCookies(page);
      const comparison = await cookieTracker.compareCookies(initialCookies, finalCookies);
      cookieTracker.printComparison(comparison);
    }
    
    // 네트워크 트래픽 분석
    if (options.trafficManager) {
      const analysisResult = await options.trafficManager.stop();
      if (analysisResult) {
        result.totalTrafficMb = parseFloat(analysisResult.summary.totalSizeInMB);
      }
    }
  }
  
  // 에러 타입 설정
  if (result.errorMessage && !result.success) {
    if (result.errorMessage.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
        result.errorMessage.includes('net::ERR_HTTP2_PROTOCOL_ERROR') ||
        result.errorMessage.includes('쿠팡 접속 차단')) {
      result.errorType = 'BLOCKED';
    } else {
      result.errorType = 'GENERAL';
    }
  }
  
  return result;
}

module.exports = {
  searchAndClickProduct,
  checkIP,
  checkWebDriverStatus
};