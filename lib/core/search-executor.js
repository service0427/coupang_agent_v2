/**
 * 검색 실행 공통 모듈 V2
 * id-mode와 multi-mode에서 공통으로 사용하는 검색 로직
 * - V2 상태 기반 로깅 시스템 통합
 * - 크로스플랫폼 성능 메트릭 수집
 */

const { applyDynamicOptimization } = require('./optimizer_db');
const { searchAndClickProduct } = require('../handlers/coupang-handler');
const dbService = require('../services/db-service');
const dbServiceV2 = require('../services/db-service-v2');
const BlockAnalyzer = require('../network/block-analyzer');
const { getSimpleMetrics } = require('../utils/system-metrics');

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
    vendorItemId: null,
    // 성능 메트릭 추가
    performanceMetrics: {
      pageLoadTime: 0,
      domReadyTime: 0,
      firstProductTime: 0
    },
    systemMetrics: {
      memoryUsage: 0,
      cpuUsage: 0,
      platform: process.platform
    }
  };
}

/**
 * 실행 조건 로그 출력
 * @param {Object} keywordData - 키워드 데이터
 * @param {boolean} finalSearchMode - 최종 검색 모드
 */
function logExecutionConditions(keywordData, finalSearchMode) {
  console.log('\n📋 실행 조건:');
  console.log(`   검색어: ${keywordData.keyword}`);
  console.log(`   상품코드: ${keywordData.product_code}`);
  console.log(`   프록시: ${keywordData.proxy_server || '없음'}`);
  console.log(`   장바구니 클릭: ${keywordData.cart_click_enabled ? '✅' : '⬜'}`);
  console.log(`   최적화: 항상 활성 (V2)`);
  console.log(`   검색 모드: ${finalSearchMode ? '✅' : '⬜'} (동적 전환)`);
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
    // V1 업데이트 비활성화 - V2는 별도 로직으로 처리
    // await dbService.updateKeywordExecution(keywordData.id, result.success);
    
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
      searchQuery: keywordData.keyword,
      keywordSuffix: null, // V2에서 제거됨
      optimizeEnabled: true, // V2는 항상 최적화 활성
      clearSession: true,  // V2 하드코딩: session 삭제로 사용자 추적 방지
      clearCache: false,   // V2 하드코딩: 캐시 유지
      usePersistent: false, // V2 하드코딩: 임시 프로필로 완전한 세션 격리
      gpuDisabled: false,  // V2 하드코딩: GPU 활성
      actualTrafficMb: result.actualTrafficMb,
      itemId: result.itemId,
      vendorItemId: result.vendorItemId
    });
  } catch (dbError) {
    console.error('DB 저장 오류:', dbError.message);
  }
}

/**
 * 키워드 검색 및 실행 (V2 로깅 통합)
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 데이터베이스에서 가져온 키워드 정보
 * @param {Object} options - 실행 옵션
 * @param {Object} networkMonitor - 네트워크 모니터 인스턴스 (optional)
 * @returns {Object} 실행 결과
 */
async function executeKeywordSearch(page, keywordData, options, networkMonitor = null) {
  let disableOptimization = null;
  let optimizationContext = null;
  const result = createInitialResult();
  const proxyConfig = keywordData.proxy_server ? { server: keywordData.proxy_server } : null;
  
  // V2 로깅을 위한 keywordData 준비
  const keywordDataForV2 = {
    ...keywordData,
    // V2 테이블 구조에 맞는 필드 추가/변환
    coupang_main_allow: keywordData.coupang_main_allow || '["document"]',
    mercury_allow: keywordData.mercury_allow || null,
    ljc_allow: keywordData.ljc_allow || null,
    assets_cdn_allow: keywordData.assets_cdn_allow || null,
    front_cdn_allow: keywordData.front_cdn_allow || null,
    image_cdn_allow: keywordData.image_cdn_allow || null,
    static_cdn_allow: keywordData.static_cdn_allow || null,
    img1a_cdn_allow: keywordData.img1a_cdn_allow || null,
    thumbnail_cdn_allow: keywordData.thumbnail_cdn_allow || null
  };
  
  try {
    const finalSearchMode = false; // V2: 동적으로 결정 (기본값 goto, 차단시 search)
    
    // 실행 조건 로그 출력
    logExecutionConditions(keywordData, finalSearchMode);
    
    // 최적화 적용
    disableOptimization = await applyOptimization(page, keywordData);
    
    // 최적화 컨텍스트 설정 (실제 키워드 설정 반영)
    const isImageBlocked = (
      (!keywordData.image_cdn_allow || keywordData.image_cdn_allow.length === 0 || keywordData.image_cdn_allow[0] === '') &&
      (!keywordData.img1a_cdn_allow || keywordData.img1a_cdn_allow.length === 0 || keywordData.img1a_cdn_allow[0] === '') &&
      (!keywordData.thumbnail_cdn_allow || keywordData.thumbnail_cdn_allow.length === 0 || keywordData.thumbnail_cdn_allow[0] === '')
    );
    
    optimizationContext = {
      optimizationActive: keywordData.optimize === true,
      imageBlocked: isImageBlocked,
      keywordOptimizeEnabled: keywordData.optimize === true,
      keywordSettings: {
        imageCdnAllowed: keywordData.image_cdn_allow || [],
        img1aCdnAllowed: keywordData.img1a_cdn_allow || [],
        thumbnailCdnAllowed: keywordData.thumbnail_cdn_allow || []
      }
    };
    
    console.log('\n');
    
    // IntegratedTrafficManager에 최적화 컨텍스트 설정
    if (options.trafficManager) {
      options.trafficManager.optimizationContext = optimizationContext;
    }
    
    // 검색 및 클릭 실행 (V2 로깅 포함)
    const searchResult = await executeSearch(page, keywordDataForV2, options, finalSearchMode, networkMonitor, optimizationContext);
    Object.assign(result, searchResult);
    
    return result;
    
  } catch (error) {
    // 에러 발생시 적절한 상태 설정
    console.error(`❌ 검색 실행 중 오류: ${error.message}`);
    
    // 에러 타입에 따른 executionStatus 결정
    const { ExecutionStatus } = require('../constants/execution-status');
    let executionStatus = ExecutionStatus.ERROR_UNKNOWN;
    
    if (error.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
        error.message.includes('net::ERR_HTTP2_PROTOCOL_ERROR')) {
      executionStatus = ExecutionStatus.ERROR_BLOCKED;
    } else if (error.message.includes('timeout') || error.message.includes('TimeoutError')) {
      executionStatus = ExecutionStatus.ERROR_TIMEOUT;
    } else if (error.message.includes('proxy') || error.message.includes('프록시')) {
      executionStatus = ExecutionStatus.ERROR_PROXY;
    } else if (error.message.includes('navigation') || error.message.includes('goto')) {
      executionStatus = ExecutionStatus.ERROR_NAVIGATION;
    }
    
    // 결과에 에러 정보 설정
    result.success = false;
    result.error = error.message;
    result.errorMessage = error.message;
    result.executionStatus = executionStatus;
    
    return result;
    
  } finally {
    // 트래픽 데이터 처리
    processTrafficData(networkMonitor, result);
    
    // V1 DB 저장 비활성화 - V2 시스템 전용
    // await saveExecutionData(keywordData, result, proxyConfig, page);
    
    // V2: TrafficManager로 처리되므로 기존 통계 표시 제거
    // await displayTrafficStatistics(networkMonitor, disableOptimization, keywordData, options);
  }
}

/**
 * 트래픽 통계 표시 (V2에서 비활성화됨 - TrafficManager로 처리)
 * @param {Object} networkMonitor - 네트워크 모니터
 * @param {Function} disableOptimization - 최적화 해제 함수
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} options - 실행 옵션
 */
async function displayTrafficStatistics(networkMonitor, disableOptimization, keywordData, options) {
  // V2: 모든 트래픽 분석은 TrafficManager에서 처리함
  return;
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
  if (!optimizationStats?.blockedCount || optimizationStats.blockedCount <= 0) {
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
  if (!options.monitor) return;
  
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
 * 최적화 적용 (V2는 항상 활성 + 키워드별 설정)
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 키워드 데이터
 * @returns {Function|null} 최적화 해제 함수
 */
async function applyOptimization(page, keywordData) {
  console.log('\n🚀 V2 최적화 활성화 (목표: 500KB 이하)');
  console.log(`   필수 도메인만 허용 | 모든 정적 리소스 차단`);
  // V2 키워드 데이터를 직접 전달하여 키워드별 optimize 설정 사용
  return await applyDynamicOptimization(page, keywordData.agent, keywordData);
}

/**
 * 검색 실행 (V2 로깅 통합)
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 키워드 데이터
 * @param {Object} options - 실행 옵션
 * @param {boolean} finalSearchMode - 검색 모드
 * @param {Object} networkMonitor - 네트워크 모니터
 * @param {Object} optimizationContext - 최적화 컨텍스트
 * @returns {Object} 검색 결과
 */
async function executeSearch(page, keywordData, options, finalSearchMode, networkMonitor, optimizationContext = null) {
  // 성능 측정 시작
  const startTime = Date.now();
  let pageLoadStartTime = null;
  let domReadyTime = null;
  let firstProductTime = null;
  
  // 페이지 로드 시간 측정
  page.on('domcontentloaded', () => {
    domReadyTime = Date.now() - startTime;
  });
  
  page.on('load', () => {
    if (!pageLoadStartTime) {
      pageLoadStartTime = Date.now() - startTime;
    }
  });
  
  try {
    // 시스템 메트릭 수집 (실행 전)
    const initialSystemMetrics = await collectSystemMetrics();
    
    const searchResult = await searchAndClickProduct(page, {
      keyword: keywordData.keyword,
      suffix: null, // V2에서 제거됨
      productCode: keywordData.product_code,
      cartClickEnabled: keywordData.cart_click_enabled === true,
      proxyConfig: keywordData.proxy_server ? { server: keywordData.proxy_server } : null,
      searchMode: finalSearchMode,
      optimizationLevel: 'balanced', // V2는 항상 최적화
      keywordId: keywordData.id,
      agent: keywordData.agent,
      checkCookies: options.checkCookies,
      networkMonitor: networkMonitor,
      monitor: options.monitor,
      // V2 로깅을 위한 파라미터들
      keywordData: keywordData,
      optimizationContext: optimizationContext
    });
    
    // 성능 메트릭 수집 (실행 후)
    const finalSystemMetrics = await collectSystemMetrics();
    
    // 성능 데이터 추가
    if (searchResult) {
      searchResult.performanceMetrics = {
        pageLoadTime: pageLoadStartTime || 0,
        domReadyTime: domReadyTime || 0,
        firstProductTime: firstProductTime || 0
      };
      
      searchResult.systemMetrics = {
        memoryUsage: finalSystemMetrics.memoryUsageMb,
        cpuUsage: finalSystemMetrics.cpuUsagePercent,
        platform: finalSystemMetrics.platform
      };
    }
    
    return searchResult;
    
  } catch (error) {
    // 오류 발생 시에도 기본 성능 데이터 포함
    const errorResult = {
      success: false,
      error: error.message,
      errorMessage: error.message,
      performanceMetrics: {
        pageLoadTime: pageLoadStartTime || 0,
        domReadyTime: domReadyTime || 0,
        firstProductTime: 0
      },
      systemMetrics: {
        memoryUsage: 0,
        cpuUsage: 0,
        platform: process.platform
      }
    };
    
    throw Object.assign(error, { searchResult: errorResult });
  }
}

/**
 * 시스템 메트릭 수집 (크로스플랫폼)
 * @returns {Object} 시스템 메트릭
 */
async function collectSystemMetrics() {
  try {
    return await getSimpleMetrics();
  } catch (error) {
    console.warn('⚠️ 시스템 메트릭 수집 실패:', error.message);
    return {
      memoryUsageMb: 0,
      cpuUsagePercent: 0,
      systemMemoryMb: 0,
      systemCpuPercent: 0,
      platform: process.platform,
      uptime: Math.round(process.uptime())
    };
  }
}

module.exports = {
  executeKeywordSearch
};