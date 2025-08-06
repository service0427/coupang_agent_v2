/**
 * 쿠팡 웹사이트 자동화 핸들러 (Chrome 전용)
 * - 상품 코드로 검색 및 클릭
 * - 순위 측정
 * - 장바구니 클릭 옵션
 */

const errorLogger = require('../services/error-logger');
const dbServiceV2 = require('../services/db-service-v2');
const ActionLoggerV2 = require('../services/action-logger-v2');
const searchModeManager = require('../services/search-mode-manager');
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
    networkMonitor = null,  // 네트워크 모니터 인스턴스
    keywordData = null,      // V2 키워드 데이터
    keywordId = null,        // V2 키워드 ID
    agent = null             // V2 에이전트
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

  // V2 로깅 시작
  let executionId = null;
  let sessionId = null;
  let actionLogger = null;
  let finalSearchMode = searchMode; // 기본값
  
  if (keywordData && keywordId && agent) {
    try {
      console.log(`📋 [V2 Log] 실행 시작: ${keyword} (${productCode})`);
      
      // 동적 검색 모드 결정
      const searchModeResult = await searchModeManager.getSearchMode(agent, keywordId);
      finalSearchMode = searchModeResult.mode === 'search';
      console.log(`🔄 [V2 Dynamic] 검색 모드: ${searchModeResult.mode} (${searchModeResult.reason})`);
      
      const logResult = await dbServiceV2.startExecutionV2(keywordId, agent, finalSearchMode ? 'search' : 'goto', keywordData.optimization_config, keywordData);
      executionId = logResult.executionId;
      sessionId = logResult.sessionId;
      console.log(`📋 [V2 Log] 실행 ID: ${executionId}, 세션 ID: ${sessionId}`);
      
      // ActionLogger 초기화
      actionLogger = new ActionLoggerV2(executionId, sessionId);
    } catch (error) {
      console.error('🔴 [V2 Log] 실행 시작 오류:', error.message);
    }
  }

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
    if (finalSearchMode) {
      const searchResult = await executeSearchMode(page, searchQuery, optimizationLevel, options);
      if (!searchResult.success) {
        result.errorMessage = searchResult.errorMessage;
        // V2 로깅: 1단계 실패
        if (executionId) {
          try {
            await dbServiceV2.completeExecutionV2(executionId, {
              success: false,
              finalStatus: 'stage1_failed',
              errorMessage: searchResult.errorMessage,
              errorStep: 'search_page_access'
            });
            console.log(`📋 [V2 Log] 1단계 실패 기록: 페이지 접근 실패`);
          } catch (logError) {
            console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
          }
        }
        return result;
      }
    } else {
      await executeDirectMode(page, searchQuery, options);
    }
    
    // V2 로깅: 1단계 성공 (페이지 도달)
    if (executionId) {
      try {
        const pageLoadTime = Date.now() - startTime;
        await dbServiceV2.updateExecutionStageV2(executionId, 'page_reached', {
          loadTime: pageLoadTime
        });
        console.log(`📋 [V2 Log] 1단계 성공: 페이지 도달 (${pageLoadTime}ms)`);
      } catch (logError) {
        console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
      }
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
    let totalProductsSearched = 0;
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      result.pagesSearched = pageNum;
      
      console.log(`📄 ${keywordInfo}페이지 ${pageNum} 검색 중...`);
      
      // 상품 목록 추출
      let products;
      try {
        products = await extractProductList(page, productCode, options.keywordId, actionLogger);
        totalProductsSearched += products.length;
        
        // V2 로깅: 2단계 성공 (상품 목록 추출)
        if (executionId && pageNum === 1) {
          try {
            await dbServiceV2.updateExecutionStageV2(executionId, 'product_searched', {
              productCount: products.length,
              pagesSearched: 1
            });
            console.log(`📋 [V2 Log] 2단계 성공: 상품 목록 추출 (${products.length}개)`);
          } catch (logError) {
            console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
          }
        }
        
      } catch (error) {
        console.log(`❌ ${error.message}`);
        result.errorMessage = error.message;
        
        // V2 로깅: 2단계 실패
        if (executionId) {
          try {
            await dbServiceV2.completeExecutionV2(executionId, {
              success: false,
              finalStatus: 'stage2_failed',
              errorMessage: error.message,
              errorStep: 'product_list_extraction'
            });
            console.log(`📋 [V2 Log] 2단계 실패 기록: 상품 목록 추출 실패`);
          } catch (logError) {
            console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
          }
        }
        
        // 에러 로깅
        await errorLogger.logError({
          errorMessage: error.message,
          pageUrl: page.url(),
          proxyUsed: proxyConfig?.server,
          actualIp: actualIp,
          keywordId: options.keywordId,
          agent: options.agent
        });
        
        // V2 상세 에러 로깅
        if (executionId) {
          try {
            await dbServiceV2.logErrorV2(executionId, sessionId, {
              errorLevel: 'error',
              errorCode: 'PRODUCT_LIST_EXTRACTION_FAILED',
              errorMessage: error.message,
              actionType: 'product_list_extraction',
              keyword: keyword,
              productCode: productCode,
              pageUrl: page.url(),
              agent: agent,
              proxyUsed: proxyConfig?.server,
              actualIp: actualIp
            });
          } catch (logError) {
            console.error('🔴 [V2 Error] 로깅 오류:', logError.message);
          }
        }
        
        break;
      }
      
      // 타겟 상품 찾기
      const targetProduct = findTargetProduct(products, productCode, options.keywordId);
      
      // V2 상품 추적 로깅
      if (executionId) {
        try {
          await dbServiceV2.logProductTrackingV2(executionId, sessionId, {
            pageNumber: pageNum,
            pageUrl: page.url(),
            productsInPage: products.length,
            productsWithRank: products.filter(p => p.rank).length,
            targetProductCode: productCode,
            targetFound: !!targetProduct,
            targetPosition: targetProduct?.rankInPage || null,
            pageLoadSuccess: true,
            productListFound: true
          });
        } catch (logError) {
          console.error('🔴 [V2 Product Tracking] 로깅 오류:', logError.message);
        }
      }
      
      if (targetProduct) {
        // V2 로깅: 3단계 성공 (상품 발견)
        if (executionId) {
          try {
            await dbServiceV2.updateExecutionStageV2(executionId, 'product_found', {
              page: pageNum,
              rank: targetProduct.rank,
              rankInPage: targetProduct.rankInPage,
              urlRank: targetProduct.urlRank,
              realRank: targetProduct.realRank
            });
            console.log(`📋 [V2 Log] 3단계 성공: 상품 발견 (${pageNum}페이지, ${targetProduct.rank}순위)`);
          } catch (logError) {
            console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
          }
        }
        
        try {
          // 상품 클릭
          const clickResult = await clickProduct(page, targetProduct, productCode, pageNum, products.length, options.keywordId, actionLogger);
          
          result.success = true;
          result.productFound = true;
          result.productRank = clickResult.productRank;
          result.urlRank = clickResult.urlRank;
          result.realRank = clickResult.realRank;
          result.itemId = clickResult.itemId;
          result.vendorItemId = clickResult.vendorItemId;
          
          // V2 로깅: 4단계 성공 (상품 클릭)
          if (executionId) {
            try {
              await dbServiceV2.updateExecutionStageV2(executionId, 'product_clicked', {
                success: true,
                clickTime: Date.now() - startTime,
                pageReached: true
              });
              console.log(`📋 [V2 Log] 4단계 성공: 상품 클릭`);
            } catch (logError) {
              console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
            }
          }
          
          // 장바구니 처리
          const cartResult = await handleCart(page, cartClickEnabled, options.keywordId, actionLogger);
          result.cartClicked = cartResult.cartClicked;
          
          // V2 로깅: 장바구니 클릭 기록
          if (executionId && cartClickEnabled) {
            try {
              await dbServiceV2.updateExecutionStageV2(executionId, 'cart_clicked', {
                success: cartResult.cartClicked,
                clickCount: cartResult.cartClicked ? 1 : 0
              });
              console.log(`📋 [V2 Log] 장바구니 클릭: ${cartResult.cartClicked ? '성공' : '실패'}`);
            } catch (logError) {
              console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
            }
          }
          
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
      
      // V2 로깅: 3단계 실패 (상품을 찾을 수 없음)
      if (executionId) {
        try {
          await dbServiceV2.completeExecutionV2(executionId, {
            success: false,
            finalStatus: 'stage3_failed',
            errorMessage: '상품을 찾을 수 없음',
            errorStep: 'product_not_found'
          });
          console.log(`📋 [V2 Log] 3단계 실패 기록: 상품 발견 실패`);
        } catch (logError) {
          console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ 오류 발생:`, error.message);
    result.errorMessage = error.message;
    
    // V2: 차단 감지 및 기록
    if (keywordData && agent) {
      try {
        const isBlocked = error.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
                         error.message.includes('쿠팡 접속 차단') ||
                         error.message.includes('net::ERR_HTTP2_PROTOCOL_ERROR');
        
        if (isBlocked) {
          await searchModeManager.recordBlockedExecution(agent, finalSearchMode ? 'search' : 'goto');
          console.log(`🚫 [V2 Dynamic] 차단 감지 기록: ${agent} (${finalSearchMode ? 'search' : 'goto'} 모드)`);
        }
      } catch (modeError) {
        console.error('🔴 [V2 Dynamic] 모드 기록 오류:', modeError.message);
      }
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
    
    // V2 상세 에러 로깅
    if (executionId) {
      try {
        // DOM 상태 수집
        let domState = null;
        try {
          domState = await page.evaluate(() => {
            return {
              title: document.title,
              url: window.location.href,
              readyState: document.readyState,
              bodyLength: document.body?.innerHTML?.length || 0,
              errorElements: Array.from(document.querySelectorAll('.error, .warning, .alert')).map(el => ({
                className: el.className,
                text: el.innerText?.substring(0, 100)
              }))
            };
          });
        } catch (e) {
          domState = { error: 'DOM 수집 실패' };
        }
        
        await dbServiceV2.logErrorV2(executionId, sessionId, {
          actionId: actionLogger?.currentActionId,
          errorLevel: 'error',
          errorCode: errorCode,
          errorMessage: error.message,
          errorStack: error.stack,
          actionType: '메인_플로우',
          keyword: keyword,
          productCode: productCode,
          pageUrl: page.url(),
          agent: agent,
          proxyUsed: proxyConfig?.server,
          actualIp: actualIp,
          domState: JSON.stringify(domState)
        });
        
        // V2: 네트워크 로그는 제거됨. 에러 정보는 v2_error_logs에 충분히 기록됨
        
        console.log(`📋 [V2 Error] 상세 에러 로그 기록`);
      } catch (logError) {
        console.error('🔴 [V2 Error] 로깅 오류:', logError.message);
      }
    }
  } finally {
    result.durationMs = Date.now() - startTime;
    result.actualIp = actualIp;
    const keywordInfo = options.keywordId ? `[ID:${options.keywordId}] ` : '';
    console.log(`${keywordInfo}⏱️ 소요 시간: ${(result.durationMs / 1000).toFixed(2)}초`);
    
    // V2 로깅: 최종 완료 기록
    if (executionId && result.success) {
      try {
        await dbServiceV2.completeExecutionV2(executionId, {
          success: true,
          finalStatus: result.cartClicked ? 'stage4_success' : 'stage3_success',
          successLevel: result.cartClicked ? 4 : 3,
          partialSuccess: !result.cartClicked && cartClickEnabled,
          finalUrl: page.url(),
          searchQuery: keyword,
          actualIp: actualIp,
          itemId: result.itemId,
          vendorItemId: result.vendorItemId,
          totalTrafficBytes: 0,  // bytes는 사용하지 않음
          totalTrafficMb: networkMonitor ? (networkMonitor.getAnalysisData()?.totalSize || 0) / (1024 * 1024) : 0
        });
        console.log(`📋 [V2 Log] 실행 완료: ${result.success ? '성공' : '실패'} (${result.durationMs}ms)`);
        
        // V2: 성공 실행 기록
        if (keywordData && agent) {
          await searchModeManager.recordSuccessfulExecution(agent, finalSearchMode ? 'search' : 'goto');
          console.log(`✅ [V2 Dynamic] 성공 실행 기록: ${agent} (${finalSearchMode ? 'search' : 'goto'} 모드)`);
        }
        
      } catch (logError) {
        console.error('🔴 [V2 Log] 로깅 오류:', logError.message);
      }
    }
    
    // 쿠키 추적 완료 (옵션 활성화 시)
    if (options.checkCookies) {
      const finalCookies = await cookieTracker.saveFinalCookies(page.context());
      const comparison = await cookieTracker.compareCookies(initialCookies, finalCookies);
      cookieTracker.printComparison(comparison);
    }
    
    // 네트워크 트래픽 분석 (V2: 항상 활성화)
    if (networkMonitor) {
      networkMonitor.stop();
      const networkData = networkMonitor.getData();
      const analyzer = new NetworkAnalyzer();
      analyzer.analyze(networkData);
      
      // 요약 분석 출력
      analyzer.printAnalysis();
    
    // V2: 네트워크 상세 로그는 제거됨. v2_execution_logs의 트래픽 요약만 사용
      
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