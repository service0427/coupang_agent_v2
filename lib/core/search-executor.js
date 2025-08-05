/**
 * 검색 실행 공통 모듈
 * id-mode와 multi-mode에서 공통으로 사용하는 검색 로직
 */

const { applyDynamicOptimization } = require('./optimizer_db');
const { searchAndClickProduct } = require('../handlers/coupang-handler');
const dbService = require('../services/db-service');
const BlockAnalyzer = require('../network/block-analyzer');

/**
 * 실행 결과 초기화
 * @returns {Object} 초기 결과 객체
 */
function createInitialResult() {
  return {
    success: false,
    productFound: false,
    productRank: null,
    urlRank: null,
    realRank: null,
    pagesSearched: 0,
    cartClicked: false,
    errorMessage: null,
    durationMs: 0,
    actualTrafficMb: null,
    actualIp: null,
    itemId: null,
    vendorItemId: null
  };
}

/**
 * 실행 조건 로그 출력
 * @param {Object} keywordData - 키워드 데이터
 * @param {boolean} finalSearchMode - 최종 검색 모드
 */
function logExecutionConditions(keywordData, finalSearchMode) {
  console.log('\n📋 실행 조건:');
  console.log(`   검색어: ${keywordData.keyword} ${keywordData.suffix || ''}`);
  console.log(`   상품코드: ${keywordData.product_code}`);
  console.log(`   프록시: ${keywordData.proxy_server || '없음'}`);
  console.log(`   장바구니 클릭: ${keywordData.cart_click_enabled ? '✅' : '⬜'}`);
  console.log(`   최적화: ${keywordData.optimize ? '✅' : '⬜'}`);
  console.log(`   초기화: 세션 ${keywordData.clear_session ? '✅' : '⬜'} | 캐시 ${keywordData.clear_cache ? '✅' : '⬜'}`);
  console.log(`   검색 모드: ${finalSearchMode ? '✅' : '⬜'} (keyword DB)`);
}

/**
 * 네트워크 트래픽 데이터 처리
 * @param {Object} networkMonitor - 네트워크 모니터
 * @param {Object} result - 결과 객체
 */
function processTrafficData(networkMonitor, result) {
  if (!networkMonitor) return;
  
  const networkData = networkMonitor.getAnalysisData();
  if (networkData) {
    const totalSizeMB = (networkData.totalSize / (1024 * 1024)).toFixed(2);
    result.actualTrafficMb = parseFloat(totalSizeMB);
  }
}

/**
 * DB 업데이트 및 로그 저장
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} result - 실행 결과
 * @param {Object} proxyConfig - 프록시 설정
 * @param {Object} page - Playwright 페이지
 */
async function saveExecutionData(keywordData, result, proxyConfig, page) {
  try {
    await dbService.updateKeywordExecution(keywordData.id, result.success);
    
    await dbService.logExecution({
      keywordId: keywordData.id,
      agent: keywordData.agent,
      success: result.success,
      productFound: result.productFound,
      productRank: result.productRank,
      urlRank: result.urlRank,
      realRank: result.realRank,
      pagesSearched: result.pagesSearched,
      cartClicked: result.cartClicked,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
      proxyUsed: proxyConfig?.server,
      actualIp: result.actualIp,
      finalUrl: page.url(),
      searchQuery: keywordData.suffix ? `${keywordData.keyword} ${keywordData.suffix}` : keywordData.keyword,
      keywordSuffix: keywordData.suffix,
      optimizeEnabled: keywordData.optimize === true,
      clearSession: keywordData.clear_session === true,
      clearCache: keywordData.clear_cache === true,
      usePersistent: keywordData.use_persistent !== false,
      gpuDisabled: keywordData.gpu_disabled === true,
      actualTrafficMb: result.actualTrafficMb,
      itemId: result.itemId,
      vendorItemId: result.vendorItemId
    });
  } catch (dbError) {
    console.error('DB 저장 오류:', dbError.message);
  }
}

/**
 * 키워드 검색 및 실행 (리팩토링된 메인 함수)
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 데이터베이스에서 가져온 키워드 정보
 * @param {Object} options - 실행 옵션
 * @param {Object} networkMonitor - 네트워크 모니터 인스턴스 (optional)
 * @returns {Object} 실행 결과
 */
async function executeKeywordSearch(page, keywordData, options, networkMonitor = null) {
  let disableOptimization = null;
  const result = createInitialResult();
  const proxyConfig = keywordData.proxy_server ? { server: keywordData.proxy_server } : null;
  
  try {
    const finalSearchMode = keywordData.search || false;
    
    // 실행 조건 로그 출력
    logExecutionConditions(keywordData, finalSearchMode);
    
    // 최적화 적용
    disableOptimization = await applyOptimization(page, keywordData);
    
    console.log('\n');
    
    // 검색 및 클릭 실행
    const searchResult = await executeSearch(page, keywordData, options, finalSearchMode, networkMonitor);
    Object.assign(result, searchResult);
    
    return result;
    
  } finally {
    // 트래픽 데이터 처리
    processTrafficData(networkMonitor, result);
    
    // DB 데이터 저장
    await saveExecutionData(keywordData, result, proxyConfig, page);
    
    // 트래픽 통계 표시
    await displayTrafficStatistics(networkMonitor, disableOptimization, keywordData, options);
  }
}

/**
 * 트래픽 통계 표시
 * @param {Object} networkMonitor - 네트워크 모니터
 * @param {Function} disableOptimization - 최적화 해제 함수
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} options - 실행 옵션
 */
async function displayTrafficStatistics(networkMonitor, disableOptimization, keywordData, options) {
  if (!networkMonitor) return;
  
  const networkData = networkMonitor.getAnalysisData();
  if (!networkData) return;
  
  // 기본 통계 계산
  const totalSizeMB = (networkData.totalSize / (1024 * 1024)).toFixed(2);
  const cacheHitRequests = networkData.cacheStats.fromCache;
  const cacheHitRate = parseFloat(networkData.cacheStats.cacheHitRate) || 0;
  const avgRequestSize = networkData.totalSize / networkData.totalRequests;
  const cacheSavedSizeMB = ((avgRequestSize * cacheHitRequests) / (1024 * 1024)).toFixed(2);
  
  // 기본 통계 출력
  console.log('\n📊 네트워크 트래픽 통계:');
  console.log('─'.repeat(50));
  console.log(`   전체 요청: ${networkData.totalRequests}개`);
  console.log(`   캐시 히트: ${cacheHitRequests}개 (${cacheHitRate}%)`);
  
  // 캐시 상세 정보
  displayCacheDetails(networkData.cacheStats);
  
  // 최적화 통계 처리
  if (disableOptimization && typeof disableOptimization === 'function') {
    await displayOptimizationStatistics(disableOptimization, totalSizeMB, cacheSavedSizeMB, avgRequestSize, keywordData, options, networkData);
  } else {
    displayBasicStatistics(totalSizeMB, cacheSavedSizeMB, cacheHitRate);
  }
  
  console.log('─'.repeat(50));
}

/**
 * 캐시 상세 정보 표시
 * @param {Object} cacheStats - 캐시 통계
 */
function displayCacheDetails(cacheStats) {
  console.log(`   캐시 상세:`);
  console.log(`     - Memory Cache: ${cacheStats.fromMemoryCache}개`);
  console.log(`     - Disk Cache: ${cacheStats.fromDiskCache}개`);
  if (cacheStats.fromServiceWorker > 0) {
    console.log(`     - Service Worker: ${cacheStats.fromServiceWorker}개`);
  }
  console.log(`     - 네트워크 전송: ${cacheStats.fromNetwork}개`);
}

/**
 * 최적화 통계 표시
 * @param {Function} disableOptimization - 최적화 해제 함수
 * @param {string} totalSizeMB - 전체 크기 (MB)
 * @param {string} cacheSavedSizeMB - 캐시 절감 크기 (MB)
 * @param {number} avgRequestSize - 평균 요청 크기
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} options - 실행 옵션
 * @param {Object} networkData - 네트워크 데이터
 */
async function displayOptimizationStatistics(disableOptimization, totalSizeMB, cacheSavedSizeMB, avgRequestSize, keywordData, options, networkData) {
  const optimizationStats = disableOptimization();
  const optimizedRequests = (optimizationStats.blockedCount || 0);
  const optimizedSizeMB = ((avgRequestSize * optimizedRequests) / (1024 * 1024)).toFixed(2);
  
  console.log(`   최적화 처리: ${optimizedRequests}개 차단`);
  console.log('─'.repeat(50));
  console.log(`   원본 트래픽 (예상): ${(parseFloat(totalSizeMB) + parseFloat(cacheSavedSizeMB) + parseFloat(optimizedSizeMB)).toFixed(2)} MB`);
  console.log(`   캐시 절감: -${cacheSavedSizeMB} MB`);
  console.log(`   최적화 절감: -${optimizedSizeMB} MB`);
  console.log(`   실제 네트워크 사용: ${totalSizeMB} MB`);
  console.log(`   총 절감율: ${(((parseFloat(cacheSavedSizeMB) + parseFloat(optimizedSizeMB)) / (parseFloat(totalSizeMB) + parseFloat(cacheSavedSizeMB) + parseFloat(optimizedSizeMB))) * 100).toFixed(1)}%`);
  
  // 차단 분석
  await performBlockAnalysis(keywordData, optimizationStats, networkData, options);
}

/**
 * 기본 통계 표시 (최적화 비활성화 상태)
 * @param {string} totalSizeMB - 전체 크기 (MB)
 * @param {string} cacheSavedSizeMB - 캐시 절감 크기 (MB)
 * @param {number} cacheHitRate - 캐시 히트율
 */
function displayBasicStatistics(totalSizeMB, cacheSavedSizeMB, cacheHitRate) {
  console.log('─'.repeat(50));
  console.log(`   원본 트래픽 (예상): ${(parseFloat(totalSizeMB) + parseFloat(cacheSavedSizeMB)).toFixed(2)} MB`);
  console.log(`   캐시 절감: -${cacheSavedSizeMB} MB`);
  console.log(`   실제 네트워크 사용: ${totalSizeMB} MB`);
  console.log(`   캐시 절감율: ${cacheHitRate}%`);
}

/**
 * 차단 분석 수행
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} optimizationStats - 최적화 통계
 * @param {Object} networkData - 네트워크 데이터
 * @param {Object} options - 실행 옵션
 */
async function performBlockAnalysis(keywordData, optimizationStats, networkData, options) {
  if (!keywordData.optimize || !optimizationStats?.blockedCount || optimizationStats.blockedCount <= 0) {
    return;
  }
  
  try {
    const blockAnalyzer = new BlockAnalyzer();
    
    // 통계 변환
    const blockStats = {};
    if (optimizationStats?.stats?.blockedByType instanceof Map) {
      optimizationStats.stats.blockedByType.forEach((count, type) => {
        blockStats[type] = { count };
      });
    }
    
    // 차단된 도메인
    let blockedDomains = new Map();
    if (optimizationStats?.stats?.blockedByDomain instanceof Map) {
      blockedDomains = optimizationStats.stats.blockedByDomain;
    }
    
    const blockAnalysis = blockAnalyzer.analyze(blockStats, blockedDomains, networkData);
    
    if (blockAnalysis) {
      blockAnalyzer.printAnalysis();
      await blockAnalyzer.saveReport(keywordData.id, keywordData.agent, blockStats, blockedDomains);
    }
  } catch (error) {
    await handleBlockAnalysisError(error, optimizationStats, options);
  }
}

/**
 * 차단 분석 오류 처리
 * @param {Error} error - 오류 객체
 * @param {Object} optimizationStats - 최적화 통계
 * @param {Object} options - 실행 옵션
 */
async function handleBlockAnalysisError(error, optimizationStats, options) {
  if (!options.trafficDetail) return;
  
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const debugFile = path.join(__dirname, '..', '..', 'reports', 'debug', `optimization-error-${Date.now()}.json`);
    
    await fs.mkdir(path.dirname(debugFile), { recursive: true });
    await fs.writeFile(debugFile, JSON.stringify({
      error: error.message,
      stack: error.stack,
      optimizationStats: optimizationStats,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (saveError) {
    // 파일 저장 실패는 무시
  }
}

/**
 * 최적화 적용
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 키워드 데이터
 * @returns {Function|null} 최적화 해제 함수
 */
async function applyOptimization(page, keywordData) {
  if (keywordData.optimize === true) {
    console.log('\n🚀 최적화 활성화 (목표: 500KB 이하)');
    console.log(`   필수 도메인만 허용 | 모든 정적 리소스 차단`);
    return await applyDynamicOptimization(page, keywordData.agent);
  } else {
    console.log('\n⚠️  검색 최적화 비활성화 상태');
    return null;
  }
}

/**
 * 검색 실행
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} options - 실행 옵션
 * @param {boolean} finalSearchMode - 검색 모드
 * @param {Object} networkMonitor - 네트워크 모니터
 * @returns {Object} 검색 결과
 */
async function executeSearch(page, keywordData, options, finalSearchMode, networkMonitor) {
  return await searchAndClickProduct(page, {
    keyword: keywordData.keyword,
    suffix: keywordData.suffix,
    productCode: keywordData.product_code,
    cartClickEnabled: keywordData.cart_click_enabled === true,
    proxyConfig: keywordData.proxy_server ? { server: keywordData.proxy_server } : null,
    searchMode: finalSearchMode,
    optimizationLevel: options.optimize ? 'balanced' : false,
    keywordId: keywordData.id,
    agent: keywordData.agent,
    checkCookies: options.checkCookies,
    networkMonitor: networkMonitor,
    trafficDetail: options.trafficDetail
  });
}

module.exports = {
  executeKeywordSearch
};