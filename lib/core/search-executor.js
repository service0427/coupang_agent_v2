/**
 * 검색 실행 공통 모듈
 * id-mode와 multi-mode에서 공통으로 사용하는 검색 로직
 */

const { applyDynamicOptimization } = require('./optimizer_db');
const { searchAndClickProduct } = require('../handlers/coupang-handler');
const dbService = require('../services/db-service');
const BlockAnalyzer = require('../network/block-analyzer');

/**
 * 키워드 검색 및 실행
 * @param {Object} page - Playwright page 객체
 * @param {Object} keywordData - 데이터베이스에서 가져온 키워드 정보
 * @param {Object} options - 실행 옵션
 * @param {Object} networkMonitor - 네트워크 모니터 인스턴스 (optional)
 * @returns {Object} 실행 결과
 */
async function executeKeywordSearch(page, keywordData, options, networkMonitor = null) {
  let disableOptimization = null;
  let result = {
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
  
  // 프록시 설정 가져오기 (finally 블록에서도 사용)
  const proxyConfig = keywordData.proxy_server ? { server: keywordData.proxy_server } : null;
  
  try {
    // 키워드별 search 모드 확인 (v1_keywords.search 컬럼에서만 관리)
    const finalSearchMode = keywordData.search || false;
    
    // 실행 조건 정보 표시
    console.log('\n📋 실행 조건:');
    console.log(`   검색어: ${keywordData.keyword} ${keywordData.suffix || ''}`);
    console.log(`   상품코드: ${keywordData.product_code}`);
    console.log(`   프록시: ${keywordData.proxy_server || '없음'}`);
    console.log(`   장바구니 클릭: ${keywordData.cart_click_enabled ? '✅' : '⬜'}`);
    console.log(`   최적화: ${keywordData.optimize ? '✅' : '⬜'}`);
    console.log(`   초기화: 세션 ${keywordData.clear_session ? '✅' : '⬜'} | 캐시 ${keywordData.clear_cache ? '✅' : '⬜'}`);
    console.log(`   검색 모드: ${finalSearchMode ? '✅' : '⬜'} (keyword DB)`);
    
    // 검색 최적화 적용
    if (keywordData.optimize === true) {
      // 공격적 최적화 (500KB 목표)
      console.log('\n🚀 최적화 활성화 (목표: 500KB 이하)');
      console.log(`   필수 도메인만 허용 | 모든 정적 리소스 차단`);
      
      disableOptimization = await applyDynamicOptimization(page, keywordData.agent);
    } else {
      console.log('\n⚠️  검색 최적화 비활성화 상태');
    }
    
    
    console.log('\n');
    
    // 검색 및 클릭 실행
    const searchResult = await searchAndClickProduct(page, {
      keyword: keywordData.keyword,
      suffix: keywordData.suffix,
      productCode: keywordData.product_code,
      cartClickEnabled: keywordData.cart_click_enabled === true,
      proxyConfig,
      searchMode: finalSearchMode,
      optimizationLevel: options.optimize ? 'balanced' : false,
      keywordId: keywordData.id,
      agent: keywordData.agent,
      checkCookies: options.checkCookies,
      networkMonitor: networkMonitor,
      trafficDetail: options.trafficDetail
    });
    
    // result 객체에 검색 결과 복사
    Object.assign(result, searchResult);
    
    return result;
    
  } finally {
    // 네트워크 모니터가 활성화된 경우 트래픽 데이터 계산
    if (networkMonitor) {
      const networkData = networkMonitor.getAnalysisData();
      
      if (networkData) {
        // 전체 트래픽 계산
        const totalSizeMB = (networkData.totalSize / (1024 * 1024)).toFixed(2);
        
        // 실제 트래픽 계산 (캐시 제외된 네트워크 전송 트래픽)
        result.actualTrafficMb = parseFloat(totalSizeMB);
      }
    }
    
    // DB 업데이트 및 로그 저장 (항상 실행)
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
    
    // 네트워크 모니터가 활성화된 경우 트래픽 통계 표시
    if (networkMonitor) {
      const networkData = networkMonitor.getAnalysisData();
      
      if (networkData) {
        // 전체 트래픽 계산 (표시용)
        const totalSizeMB = (networkData.totalSize / (1024 * 1024)).toFixed(2);
        
        // 캐시로 절감된 트래픽 계산
        const cacheHitRequests = networkData.cacheStats.fromCache;
        const cacheHitRate = parseFloat(networkData.cacheStats.cacheHitRate) || 0;
        
        // 캐시로 절감된 예상 크기 (평균 요청 크기 * 캐시 히트 수)
        const avgRequestSize = networkData.totalSize / networkData.totalRequests;
        const cacheSavedSizeMB = ((avgRequestSize * cacheHitRequests) / (1024 * 1024)).toFixed(2);
        
        console.log('\n📊 네트워크 트래픽 통계:');
        console.log('─'.repeat(50));
        console.log(`   전체 요청: ${networkData.totalRequests}개`);
        console.log(`   캐시 히트: ${cacheHitRequests}개 (${cacheHitRate}%)`);
        
        // 캐시 타입별 상세 정보 (항상 표시)
        console.log(`   캐시 상세:`);
        console.log(`     - Memory Cache: ${networkData.cacheStats.fromMemoryCache}개`);
        console.log(`     - Disk Cache: ${networkData.cacheStats.fromDiskCache}개`);
        if (networkData.cacheStats.fromServiceWorker > 0) {
          console.log(`     - Service Worker: ${networkData.cacheStats.fromServiceWorker}개`);
        }
        console.log(`     - 네트워크 전송: ${networkData.cacheStats.fromNetwork}개`);
        
        // 최적화가 활성화된 경우
        if (disableOptimization && typeof disableOptimization === 'function') {
          const optimizationStats = disableOptimization();
          const optimizedRequests = (optimizationStats.blockedCount || 0);
          
          // 최적화로 절감된 예상 크기
          const optimizedSizeMB = ((avgRequestSize * optimizedRequests) / (1024 * 1024)).toFixed(2);
          
          console.log(`   최적화 처리: ${optimizedRequests}개 차단`);
          console.log('─'.repeat(50));
          console.log(`   원본 트래픽 (예상): ${(parseFloat(totalSizeMB) + parseFloat(cacheSavedSizeMB) + parseFloat(optimizedSizeMB)).toFixed(2)} MB`);
          console.log(`   캐시 절감: -${cacheSavedSizeMB} MB`);
          console.log(`   최적화 절감: -${optimizedSizeMB} MB`);
          console.log(`   실제 네트워크 사용: ${totalSizeMB} MB`);
          console.log(`   총 절감율: ${(((parseFloat(cacheSavedSizeMB) + parseFloat(optimizedSizeMB)) / (parseFloat(totalSizeMB) + parseFloat(cacheSavedSizeMB) + parseFloat(optimizedSizeMB))) * 100).toFixed(1)}%`);
          
          // 차단 분석 (최적화가 활성화된 경우)
          if (keywordData.optimize === true && optimizationStats && 
              optimizationStats.blockedCount && optimizationStats.blockedCount > 0) {
            try {
              const blockAnalyzer = new BlockAnalyzer();
              
              // aggressive-optimizer의 통계를 BlockAnalyzer 형식으로 변환
              const blockStats = {};
              
              // null/undefined 체크 강화
              if (optimizationStats && optimizationStats.stats) {
                if (optimizationStats.stats.blockedByType && optimizationStats.stats.blockedByType instanceof Map) {
                  optimizationStats.stats.blockedByType.forEach((count, type) => {
                    blockStats[type] = { count };
                  });
                }
              }
              
              // blockedDomains null 체크 강화
              let blockedDomains = new Map();
              if (optimizationStats && optimizationStats.stats && 
                  optimizationStats.stats.blockedByDomain && optimizationStats.stats.blockedByDomain instanceof Map) {
                blockedDomains = optimizationStats.stats.blockedByDomain;
              }
              
              const blockAnalysis = blockAnalyzer.analyze(
                blockStats,
                blockedDomains,
                networkData
              );
              
              if (blockAnalysis) {
                blockAnalyzer.printAnalysis();
                
                // 차단 리포트 저장
                await blockAnalyzer.saveReport(
                  keywordData.id,
                  keywordData.agent,
                  blockStats,
                  blockedDomains
                );
              }
            } catch (error) {
              // 차단 분석 오류는 무시 (핵심 기능에 영향 없음)
              // 필요시 --traffic-detail 옵션으로 디버그 파일 확인 가능
              if (options.trafficDetail) {
                const fs = require('fs').promises;
                const path = require('path');
                const debugFile = path.join(__dirname, '..', '..', 'reports', 'debug', `optimization-error-${Date.now()}.json`);
                
                try {
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
            }
          }
        } else {
          // 최적화 비활성화 상태
          console.log('─'.repeat(50));
          console.log(`   원본 트래픽 (예상): ${(parseFloat(totalSizeMB) + parseFloat(cacheSavedSizeMB)).toFixed(2)} MB`);
          console.log(`   캐시 절감: -${cacheSavedSizeMB} MB`);
          console.log(`   실제 네트워크 사용: ${totalSizeMB} MB`);
          console.log(`   캐시 절감율: ${cacheHitRate}%`);
        }
        console.log('─'.repeat(50));
      }
    }
  }
}

module.exports = {
  executeKeywordSearch
};