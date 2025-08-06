/**
 * 실행 로그 관리 모듈
 * - V2 데이터베이스 구조를 사용한 상세 실행 로그
 * - 단계별 실행 상태 추적
 * - 네트워크 트래픽 통합
 */

const dbServiceV2 = require('./db-service-v2');
const NetworkMonitor = require('../network/monitor');
const { 
  ExecutionStatus, 
  SuccessLevel, 
  FinalStatus,
  isTerminalStatus,
  isSuccessfulStatus,
  isErrorStatus,
  calculateSuccessLevel,
  determineErrorStep
} = require('../constants/execution-status');

class ExecutionLogger {
  constructor() {
    this.executionId = null;
    this.sessionId = null;
    this.keywordData = null;
    this.networkMonitor = null;
    this.actionSequence = 0;
    this.startTime = null;
    this.currentStatus = ExecutionStatus.INIT;
    this.statusHistory = [];
    this.stages = {
      pageReached: false,
      productSearched: false,
      productFound: false,
      productClicked: false,
      pageLoaded: false,
      cartClicked: false
    };
  }

  /**
   * 실행 상태 업데이트
   */
  async updateExecutionStatus(newStatus, data = {}) {
    const previousStatus = this.currentStatus;
    const timestamp = Date.now();
    
    this.statusHistory.push({
      status: previousStatus,
      timestamp: this.statusHistory.length > 0 ? this.statusHistory[this.statusHistory.length - 1].timestamp : this.startTime,
      endTimestamp: timestamp,
      duration: timestamp - (this.statusHistory.length > 0 ? this.statusHistory[this.statusHistory.length - 1].timestamp : this.startTime),
      data
    });
    
    this.currentStatus = newStatus;
    
    // 상태 변경 로그
    const statusIcon = this.getStatusIcon(newStatus);
    console.log(`📊 실행 상태: ${previousStatus} → ${newStatus} ${statusIcon}`);
    
    if (data.message) {
      console.log(`   └─ ${data.message}`);
    }
    
    // 종료 상태면 완료 처리 준비
    if (isTerminalStatus(newStatus)) {
      this.prepareCompletion(newStatus);
    }
  }

  /**
   * 상태 아이콘 가져오기
   */
  getStatusIcon(status) {
    const iconMap = {
      [ExecutionStatus.INIT]: '🔄',
      [ExecutionStatus.BROWSER_READY]: '🌐',
      [ExecutionStatus.HOME_LOADED]: '🏠',
      [ExecutionStatus.SEARCHING]: '🔍',
      [ExecutionStatus.PRODUCT_FOUND]: '🎯',
      [ExecutionStatus.PRODUCT_CLICKED]: '👆',
      [ExecutionStatus.PRODUCT_PAGE_LOADED]: '📄',
      [ExecutionStatus.CART_READY]: '🛒',
      [ExecutionStatus.SUCCESS]: '✅',
      [ExecutionStatus.PARTIAL_SUCCESS]: '⚠️',
      [ExecutionStatus.ERROR_BLOCKED]: '🚫',
      [ExecutionStatus.ERROR_TIMEOUT]: '⏱️'
    };
    
    return iconMap[status] || '•';
  }

  /**
   * 완료 준비
   */
  prepareCompletion(finalStatus) {
    this.finalExecutionStatus = finalStatus;
    this.finalSuccessLevel = calculateSuccessLevel(finalStatus);
    
    if (isErrorStatus(finalStatus)) {
      this.errorStep = determineErrorStep(finalStatus);
    }
  }

  /**
   * 실행 시작
   */
  async startExecution(keywordData, searchMode = 'goto') {
    try {
      this.keywordData = keywordData;
      this.startTime = Date.now();
      this.actionSequence = 0;
      
      // 초기 상태 설정
      await this.updateExecutionStatus(ExecutionStatus.PREPARING, {
        message: '실행 준비 중'
      });
      
      // 최적화 설정 준비
      const optimizeConfig = this.prepareOptimizeConfig(keywordData);
      
      // 실행 로그 시작
      const result = await dbServiceV2.startExecutionV2(
        keywordData.id,
        keywordData.agent,
        searchMode,
        optimizeConfig
      );
      
      this.executionId = result.executionId;
      this.sessionId = result.sessionId;
      
      console.log(`\n📝 실행 로그 시작 - ID: ${this.executionId}, Session: ${this.sessionId}`);
      
      return {
        executionId: this.executionId,
        sessionId: this.sessionId
      };
    } catch (error) {
      console.error('실행 로그 시작 실패:', error);
      await this.updateExecutionStatus(ExecutionStatus.ERROR_UNKNOWN, {
        message: '실행 시작 실패',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 최적화 설정 준비
   */
  prepareOptimizeConfig(keywordData) {
    const config = {};
    
    // 도메인별 allow 설정
    const domainFields = [
      'coupang_main_allow',
      'mercury_allow',
      'ljc_allow',
      'assets_cdn_allow',
      'front_cdn_allow',
      'image_cdn_allow',
      'static_cdn_allow',
      'img1a_cdn_allow',
      'thumbnail_cdn_allow'
    ];
    
    for (const field of domainFields) {
      if (keywordData[field]) {
        try {
          config[field] = JSON.parse(keywordData[field]);
        } catch (e) {
          config[field] = keywordData[field];
        }
      }
    }
    
    if (keywordData.coupang_main_block_patterns) {
      config.block_patterns = keywordData.coupang_main_block_patterns;
    }
    
    return Object.keys(config).length > 0 ? config : null;
  }

  /**
   * 네트워크 모니터 연결
   */
  setNetworkMonitor(monitor) {
    this.networkMonitor = monitor;
  }

  /**
   * 페이지 도달 로그
   */
  async logPageReached(loadTime) {
    if (!this.executionId) return;
    
    this.stages.pageReached = true;
    
    await this.updateExecutionStatus(ExecutionStatus.HOME_LOADED, {
      message: `페이지 도달 (${loadTime}ms)`,
      loadTime
    });
    
    await dbServiceV2.updateExecutionStageV2(this.executionId, 'page_reached', {
      loadTime
    });
    
    console.log(`   ✓ 페이지 도달 (${loadTime}ms)`);
  }

  /**
   * 상품 검색 로그
   */
  async logProductSearched(productCount, pagesSearched = 1) {
    if (!this.executionId) return;
    
    this.stages.productSearched = true;
    
    await this.updateExecutionStatus(ExecutionStatus.RESULTS_LOADED, {
      message: `상품 검색 완료 (${productCount}개 상품, ${pagesSearched}페이지)`,
      productCount,
      pagesSearched
    });
    
    await dbServiceV2.updateExecutionStageV2(this.executionId, 'product_searched', {
      productCount,
      pagesSearched
    });
    
    console.log(`   ✓ 상품 검색 완료 (${productCount}개 상품, ${pagesSearched}페이지)`);
  }

  /**
   * 상품 발견 로그
   */
  async logProductFound(foundData) {
    if (!this.executionId) return;
    
    this.stages.productFound = true;
    
    await this.updateExecutionStatus(ExecutionStatus.PRODUCT_FOUND, {
      message: `상품 발견 (${foundData.page}페이지, 순위: ${foundData.rank})`,
      ...foundData
    });
    
    await dbServiceV2.updateExecutionStageV2(this.executionId, 'product_found', {
      page: foundData.page,
      rank: foundData.rank,
      rankInPage: foundData.rankInPage,
      urlRank: foundData.urlRank,
      realRank: foundData.realRank
    });
    
    console.log(`   ✓ 상품 발견 (${foundData.page}페이지, 순위: ${foundData.rank})`);
  }

  /**
   * 상품 클릭 로그
   */
  async logProductClicked(clickData) {
    if (!this.executionId) return;
    
    this.stages.productClicked = clickData.success;
    
    await dbServiceV2.updateExecutionStageV2(this.executionId, 'product_clicked', {
      success: clickData.success,
      clickTime: clickData.clickTime,
      pageReached: clickData.pageReached || false
    });
    
    if (clickData.success) {
      console.log(`   ✓ 상품 클릭 성공 (${clickData.clickTime}ms)`);
    } else {
      console.log(`   ✗ 상품 클릭 실패`);
    }
  }

  /**
   * 페이지 로딩 상태 로그
   */
  async logPageLoadStatus(loadStatus) {
    if (!this.executionId) return;
    
    this.stages.pageLoaded = loadStatus.fullyLoaded;
    
    await dbServiceV2.updateExecutionStageV2(this.executionId, 'page_load_status', {
      urlChanged: loadStatus.urlChanged,
      domLoaded: loadStatus.domLoaded,
      fullyLoaded: loadStatus.fullyLoaded,
      titleLoaded: loadStatus.titleLoaded,
      cartVisible: loadStatus.cartVisible,
      cartEnabled: loadStatus.cartEnabled,
      timeout: loadStatus.timeout || false
    });
    
    const statusParts = [];
    if (loadStatus.urlChanged) statusParts.push('URL변경');
    if (loadStatus.domLoaded) statusParts.push('DOM로드');
    if (loadStatus.fullyLoaded) statusParts.push('완전로드');
    if (loadStatus.cartVisible) statusParts.push('장바구니표시');
    
    console.log(`   ✓ 페이지 로딩 상태: ${statusParts.join(', ')}`);
  }

  /**
   * 장바구니 클릭 로그
   */
  async logCartClicked(cartData) {
    if (!this.executionId) return;
    
    this.stages.cartClicked = cartData.success;
    
    await dbServiceV2.updateExecutionStageV2(this.executionId, 'cart_clicked', {
      success: cartData.success,
      clickCount: cartData.clickCount || 1
    });
    
    if (cartData.success) {
      console.log(`   ✓ 장바구니 클릭 성공`);
    }
  }

  /**
   * 실행 완료
   */
  async completeExecution(result) {
    if (!this.executionId) return;
    
    try {
      // 네트워크 트래픽 수집
      let networkData = {};
      if (this.networkMonitor) {
        const trafficData = this.networkMonitor.getData();
        networkData = {
          totalTrafficBytes: trafficData.totalSize || 0,
          cachedTrafficBytes: this.calculateCachedBytes(trafficData),
          blockedRequestsCount: 0, // 차단 통계는 별도 수집 필요
          allowedRequestsCount: trafficData.totalRequests || 0,
          trafficByDomain: this.summarizeTrafficByDomain(trafficData),
          trafficByType: this.summarizeTrafficByType(trafficData)
        };
      }
      
      // 성공 레벨 결정
      const successLevel = this.determineSuccessLevel();
      
      // 최종 상태 결정
      const finalStatus = this.determineFinalStatus(result);
      
      // 부분적 성공 여부
      const partialSuccess = this.stages.productClicked && !this.stages.pageLoaded;
      
      // 실행 로그 완료
      await dbServiceV2.completeExecutionV2(this.executionId, {
        success: result.success || false,
        successLevel,
        partialSuccess,
        finalStatus,
        errorMessage: result.errorMessage,
        errorStep: result.errorStep,
        warningMessages: result.warningMessages || [],
        finalUrl: result.finalUrl,
        searchQuery: result.searchQuery,
        proxyUsed: result.proxyUsed,
        actualIp: result.actualIp,
        itemId: result.itemId,
        vendorItemId: result.vendorItemId,
        ...networkData
      });
      
      const duration = Date.now() - this.startTime;
      console.log(`\n📝 실행 완료 - ${finalStatus} (${duration}ms)`);
      
    } catch (error) {
      console.error('실행 로그 완료 실패:', error);
    }
  }

  /**
   * 캐시된 바이트 계산
   */
  calculateCachedBytes(trafficData) {
    if (!trafficData.requests) return 0;
    
    return trafficData.requests
      .filter(req => req.fromCache)
      .reduce((sum, req) => sum + (req.size || 0), 0);
  }

  /**
   * 도메인별 트래픽 요약
   */
  summarizeTrafficByDomain(trafficData) {
    if (!trafficData.domains) return null;
    
    const summary = {};
    for (const [domain, stats] of trafficData.domains) {
      summary[domain] = stats.size;
    }
    
    return summary;
  }

  /**
   * 타입별 트래픽 요약
   */
  summarizeTrafficByType(trafficData) {
    if (!trafficData.resourceTypes) return null;
    
    const summary = {};
    for (const [type, stats] of trafficData.resourceTypes) {
      summary[type] = stats.size;
    }
    
    return summary;
  }

  /**
   * 성공 레벨 결정
   */
  determineSuccessLevel() {
    if (this.stages.cartClicked) return 'cart_clicked';
    if (this.stages.pageLoaded) return 'page_loaded';
    if (this.stages.productClicked) return 'page_navigated';
    if (this.stages.productFound) return 'product_found';
    if (this.stages.pageReached) return 'page_reached';
    return null;
  }

  /**
   * 최종 상태 결정
   */
  determineFinalStatus(result) {
    if (result.success) return 'success';
    if (this.stages.productClicked && !this.stages.pageLoaded) return 'partial_success';
    if (!this.stages.productFound) return 'product_not_found';
    if (this.stages.productFound && !this.stages.productClicked) return 'click_failed';
    if (this.stages.productClicked && !this.stages.pageLoaded) return 'page_load_incomplete';
    if (result.errorMessage) {
      if (result.errorMessage.includes('차단')) return 'blocked';
      if (result.errorMessage.includes('timeout')) return 'timeout';
    }
    return 'error';
  }

  /**
   * 액션 로그 기록
   */
  async logAction(actionType, actionTarget, actionDetail = null) {
    if (!this.executionId) return;
    
    this.actionSequence++;
    
    const actionData = {
      actionSeq: this.actionSequence,
      actionType,
      actionTarget,
      actionDetail,
      processStep: this.getCurrentProcessStep()
    };
    
    try {
      const actionId = await dbServiceV2.logActionV2(
        this.executionId,
        this.sessionId,
        actionData
      );
      
      return actionId;
    } catch (error) {
      console.error('액션 로그 기록 실패:', error);
      return null;
    }
  }

  /**
   * 현재 프로세스 단계
   */
  getCurrentProcessStep() {
    if (!this.stages.pageReached) return 'initialization';
    if (!this.stages.productSearched) return 'navigation';
    if (!this.stages.productFound) return 'search';
    if (!this.stages.productClicked) return 'find_product';
    if (!this.stages.pageLoaded) return 'click_product';
    if (!this.stages.cartClicked) return 'page_load';
    return 'add_cart';
  }

  /**
   * 에러 로그 기록
   */
  async logError(errorLevel, errorMessage, errorData = {}) {
    if (!this.executionId) return;
    
    await dbServiceV2.logErrorV2(this.executionId, this.sessionId, {
      errorLevel,
      errorMessage,
      ...errorData
    });
  }

  /**
   * 상품 추적 로그
   */
  async logProductTracking(pageNumber, trackingData) {
    if (!this.executionId) return;
    
    await dbServiceV2.logProductTrackingV2(this.executionId, this.sessionId, {
      pageNumber,
      ...trackingData
    });
  }
}

module.exports = ExecutionLogger;