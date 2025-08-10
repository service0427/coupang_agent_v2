/**
 * API 모드 실행 모듈
 * 허브 API를 통한 작업 할당/결과 제출 방식
 */

const { executeKeywordSearch } = require('../core/search-executor');
const browserManager = require('../services/browser-manager');
const HubApiClient = require('../services/hub-api-client');
const UserFolderManager = require('../services/user-folder-manager');
const HybridProfileManager = require('../services/hybrid-profile-manager');
const dbServiceV2 = require('../services/db-service-v2');
const { calculateWindowPosition } = require('../utils/window-position');
const { 
  getHttpStatusCode, 
  getHttpStatusInfo, 
  isHttpSuccess, 
  isHttpBlocked,
  ExecutionStatus,
  determineErrorStep 
} = require('../constants/execution-status');

class ApiModeRunner {
  constructor(config = {}) {
    this.baseInstanceNumber = config.baseInstanceNumber || 1; // 시작 인스턴스 번호
    this.threadCount = config.threadCount || 4; // 실제로는 인스턴스 수
    this.pollInterval = config.pollInterval || 10000; // 10초
    this.isRunning = false;
    
    // 인스턴스별 허브 클라이언트 생성 (각각 고유한 인스턴스 번호)
    this.hubApiClients = new Map();
    this.hybridProfileManagers = new Map();
    
    for (let i = 0; i < this.threadCount; i++) {
      const instanceNumber = this.baseInstanceNumber + i; // 1, 2, 3, 4...
      
      // 각 인스턴스별 허브 클라이언트
      this.hubApiClients.set(i, new HubApiClient({
        hubBaseUrl: config.hubBaseUrl,
        instanceNumber: instanceNumber
      }));
      
      // 각 인스턴스별 하이브리드 프로필 매니저
      this.hybridProfileManagers.set(i, new HybridProfileManager({
        instanceNumber: instanceNumber,
        threadCount: 1, // 인스턴스당 1개 쓰레드
        basePath: config.basePath || './browser-data'
      }));
    }
    
    // 인스턴스 관리 (기존 쓰레드 개념을 인스턴스로 변경)
    this.activeInstances = new Map(); // instanceId -> instanceInfo
    
    // 통계
    this.stats = {
      totalAssigned: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      startTime: new Date(),
      activeInstanceCount: 0
    };
    
    console.log(`🤖 ApiModeRunner 초기화 (인스턴스 ${this.baseInstanceNumber}-${this.baseInstanceNumber + this.threadCount - 1})`);
  }

  /**
   * API 모드 시작
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ API 모드가 이미 실행 중입니다');
      return;
    }

    console.log(`🚀 API 모드 시작 (인스턴스 ${this.baseInstanceNumber}-${this.baseInstanceNumber + this.threadCount - 1})`);
    
    try {
      // 모든 허브 클라이언트의 서버 연결 확인
      const healthChecks = Array.from(this.hubApiClients.values()).map(client => client.checkHealth());
      await Promise.all(healthChecks);
      
      this.isRunning = true;
      this.stats.startTime = new Date();
      
      // 메인 워크플로우 루프 시작
      this.startWorkflowLoop();
      
      console.log(`✅ API 모드 시작 완료 (${this.threadCount}개 인스턴스)`);
      
    } catch (error) {
      console.error('❌ API 모드 시작 실패:', error.message);
      throw error;
    }
  }

  /**
   * 멀티인스턴스 워크플로우 루프
   */
  async startWorkflowLoop() {
    console.log(`🔄 멀티인스턴스 워크플로우 시작 (${this.threadCount}개 인스턴스, 폴링 간격: ${this.pollInterval}ms)`);

    // 인스턴스별로 독립적인 워크 루프 시작
    for (let i = 0; i < this.threadCount; i++) {
      this.startInstanceWorkLoop(i);
    }
  }

  /**
   * 개별 인스턴스 워크 루프
   */
  async startInstanceWorkLoop(instanceIndex) {
    const instanceNumber = this.baseInstanceNumber + instanceIndex;
    console.log(`🤖 인스턴스 ${instanceNumber} 시작 (내부 인덱스: ${instanceIndex})`);
    
    const instanceWorkLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.processNextWork(instanceIndex);
      } catch (error) {
        console.error(`🔥 인스턴스 ${instanceNumber} 워크플로우 오류:`, error.message);
      }

      // 다음 폴링 스케줄 (인스턴스별 독립적)
      if (this.isRunning) {
        setTimeout(instanceWorkLoop, this.pollInterval + (Math.random() * 1000)); // 약간의 지연 추가로 동시 요청 방지
      }
    };

    // 인스턴스별 시차 시작 (0.5초씩 간격)
    setTimeout(() => {
      if (this.isRunning) {
        instanceWorkLoop();
      }
    }, instanceIndex * 500);
  }

  /**
   * 다음 작업 처리 (인스턴스별)
   */
  async processNextWork(instanceIndex) {
    const instanceNumber = this.baseInstanceNumber + instanceIndex;
    const hubApiClient = this.hubApiClients.get(instanceIndex);
    
    try {
      // 인스턴스 상태 업데이트
      this.updateInstanceStatus(instanceIndex, 'requesting_work');
      
      // 1. 작업 할당 요청 (각 인스턴스가 고유한 번호로 요청)
      const workAllocation = await hubApiClient.allocateWork();
      
      if (!workAllocation) {
        this.updateInstanceStatus(instanceIndex, 'idle');
        return;
      }

      this.stats.totalAssigned++;
      
      console.log(`🎯 [인스턴스 ${instanceNumber}] 작업 할당됨: ${workAllocation.work.keyword} (${workAllocation.allocationKey})`);
      console.log(`   허브 할당 폴더: ${workAllocation.folder}`);
      
      // 2. 작업 실행
      this.updateInstanceStatus(instanceIndex, 'executing', workAllocation);
      const result = await this.executeWork(workAllocation, instanceIndex);
      
      // 3. 결과 제출 (해당 인스턴스의 허브 클라이언트 사용)
      this.updateInstanceStatus(instanceIndex, 'submitting');
      await this.submitResult(result, instanceIndex);
      
      // 4. 인스턴스 상태 초기화
      this.updateInstanceStatus(instanceIndex, 'completed');
      
    } catch (error) {
      console.error(`❌ [인스턴스 ${instanceNumber}] 작업 처리 실패:`, error.message);
      this.updateInstanceStatus(instanceIndex, 'error', null, error.message);
    }
  }

  /**
   * 인스턴스 상태 업데이트
   */
  updateInstanceStatus(instanceIndex, status, workAllocation = null, error = null) {
    const instanceNumber = this.baseInstanceNumber + instanceIndex;
    const instanceInfo = {
      index: instanceIndex,
      instanceNumber: instanceNumber,
      status: status, // idle, requesting_work, executing, submitting, completed, error, waiting_folder
      workAllocation: workAllocation,
      error: error,
      lastUpdate: new Date()
    };
    
    this.activeInstances.set(instanceIndex, instanceInfo);
    
    // 활성 인스턴스 수 업데이트
    this.stats.activeInstanceCount = Array.from(this.activeInstances.values())
      .filter(i => ['requesting_work', 'executing', 'submitting'].includes(i.status)).length;
  }

  /**
   * 작업 실행
   */
  async executeWork(workAllocation, instanceIndex) {
    const instanceNumber = this.baseInstanceNumber + instanceIndex;
    const hybridProfileManager = this.hybridProfileManagers.get(instanceIndex);
    const startTime = new Date();
    console.log(`▶️ [인스턴스 ${instanceNumber}] 작업 실행 시작: ${workAllocation.work.keyword}`);
    
    let browser = null;
    let page = null;

    try {
      // V2 시스템을 위한 키워드 데이터 구성
      const keywordData = {
        id: null, // API 모드에서는 DB ID 없음
        keyword: workAllocation.work.keyword,
        product_code: workAllocation.work.code,
        agent: `api_instance_${instanceNumber}`,
        cart_click_enabled: workAllocation.settings.cartClickEnabled,
        proxy_server: workAllocation.proxy.url,
        // V2 최적화 설정 적용
        optimize: true,
        coupang_main_allow: '["document"]',
        block_mercury: workAllocation.settings.blockMercury,
        block_image_cdn: workAllocation.settings.blockImageCdn,
        block_img1a_cdn: workAllocation.settings.blockImg1aCdn,
        block_thumbnail_cdn: workAllocation.settings.blockThumbnailCdn
      };

      // 하이브리드 프로필 설정 (캐시 공유 + 세션 분리)
      const hubFolderNumber = workAllocation.folder; // 허브에서 할당한 폴더 번호
      const profile = await hybridProfileManager.getThreadProfile(0, hubFolderNumber); // 인스턴스당 단일 쓰레드
      
      // 유저폴더 준비 안된 경우 다음 사이클로 연기
      if (!profile) {
        console.log(`⏳ [인스턴스 ${instanceNumber}] 폴더 준비 중... 작업 연기`);
        
        // 작업 할당 해제 (허브에게 다시 할당 가능하도록)
        await hubApiClient.releaseWork(workAllocation.allocationKey, 'folder_not_ready');
        
        this.updateInstanceStatus(instanceIndex, 'waiting_folder');
        return; // 다음 폴링 사이클에서 재시도
      }
      
      await hybridProfileManager.setupCacheSharing(profile);
      
      console.log(`   📁 [인스턴스 ${instanceNumber}] ← 허브 폴더 ${hubFolderNumber} 사용`);
      console.log(`   📂 세션 경로: instance${instanceNumber}/${profile.paddedFolderNumber}`);
      console.log(`   💾 공유 캐시: shared_cache (모든 인스턴스 공유)`);
      
      // 브라우저 옵션 구성 (최적화된 프로필 사용)
      const proxyConfig = this.parseProxyUrl(workAllocation.proxy.url);
      const windowPosition = calculateWindowPosition(instanceIndex);

      // 브라우저 실행
      console.log(`   🚀 [인스턴스 ${instanceNumber}] 브라우저 실행 중... (세션 독립 + 캐시 공유)`);
      const browserInfo = await browserManager.getBrowser({
        proxyConfig,
        usePersistent: true,
        profileName: `instance${instanceNumber}_${profile.paddedFolderNumber}`,
        userDataDir: profile.userDataDir, // 최적화된 프로필 경로 사용
        clearSession: false, // 세션 유지
        clearCache: false,   // 캐시 유지
        headless: false,
        windowPosition
      });
      
      browser = browserInfo.browser;
      page = browserInfo.page;
      const networkMonitor = browserInfo.networkMonitor;

      // V2 search-executor를 통한 자동화 실행
      const automationResult = await executeKeywordSearch(
        page,
        keywordData,
        { 
          checkCookies: false,
          monitor: false
        },
        networkMonitor
      );

      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();
      
      // 결과 분석 및 상태 코드 결정
      const isSuccess = automationResult && !automationResult.error;
      const errorMessage = automationResult?.error;
      const executionStatus = isSuccess ? ExecutionStatus.SUCCESS : 
                             (automationResult?.executionStatus || ExecutionStatus.ERROR_UNKNOWN);
      
      // HTTP 상태 코드 생성
      const statusCode = getHttpStatusCode(executionStatus, errorMessage);
      const statusInfo = getHttpStatusInfo(statusCode);
      const isHttpSuccessResult = isHttpSuccess(statusCode);
      const isBlockedResult = isHttpBlocked(statusCode);
      
      // 통계 업데이트
      if (isHttpSuccessResult) {
        this.stats.completed++;
      } else if (isBlockedResult) {
        this.stats.blocked++;
      } else {
        this.stats.failed++;
      }

      console.log(`✅ [인스턴스 ${instanceNumber}] 작업 실행 완료: ${executionTime}ms (${isHttpSuccessResult ? '성공' : '실패'} - ${statusCode})`);
      
      // 상품 데이터 수집 (클릭한 상품이 있는 경우)
      const productData = this.collectProductData(automationResult);
      
      // 적용된 설정 정보
      const appliedSettings = {
        cartClickEnabled: keywordData.cart_click_enabled,
        blockMercury: keywordData.block_mercury,
        blockImageCdn: keywordData.block_image_cdn,
        blockImg1aCdn: keywordData.block_img1a_cdn,
        blockThumbnailCdn: keywordData.block_thumbnail_cdn
      };
      
      // 성능 메트릭 수집
      const performanceData = this.collectPerformanceMetrics(automationResult, networkMonitor);
      
      return {
        allocationKey: workAllocation.allocationKey,
        status: isHttpSuccessResult ? 'completed' : 'failed',
        execution: {
          startedAt: startTime.toISOString(),
          completedAt: endTime.toISOString(),
          executionTimeMs: executionTime,
          userFolder: hubFolderNumber, // 허브에서 받은 폴더 번호
          finalPhase: isHttpSuccessResult ? 'completion' : determineErrorStep(executionStatus),
          failurePhase: isHttpSuccessResult ? null : determineErrorStep(executionStatus)
        },
        result: {
          status: statusInfo.status,
          statusCode: statusCode,
          currentPage: automationResult?.currentPage || 1,
          productsFound: automationResult?.productsFound || 0
        },
        productData: productData,
        appliedSettings: appliedSettings,
        performance: performanceData
      };

    } catch (error) {
      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();
      
      // 오류 상태 코드 결정
      const errorStatusCode = getHttpStatusCode(ExecutionStatus.ERROR_UNKNOWN, error.message);
      const errorStatusInfo = getHttpStatusInfo(errorStatusCode);
      
      console.error(`❌ [인스턴스 ${instanceNumber}] 작업 실행 실패: ${error.message} (${errorStatusCode})`);
      this.stats.failed++;
      
      return {
        allocationKey: workAllocation.allocationKey,
        status: 'failed',
        execution: {
          startedAt: startTime.toISOString(),
          completedAt: endTime.toISOString(),
          executionTimeMs: executionTime,
          userFolder: workAllocation.folder, // 허브에서 받은 폴더 번호
          finalPhase: 'error',
          failurePhase: 'initialization'
        },
        result: {
          status: errorStatusInfo.status,
          statusCode: errorStatusCode,
          currentPage: 1,
          productsFound: 0
        },
        productData: {},
        appliedSettings: {
          cartClickEnabled: false,
          blockMercury: false,
          blockImageCdn: false,
          blockImg1aCdn: false,
          blockThumbnailCdn: false
        },
        performance: {
          pageLoadTimeMs: 0,
          domReadyTimeMs: 0,
          firstProductTimeMs: 0,
          totalRequests: 0,
          blockedRequests: 0,
          cacheHitRate: 0,
          networkEfficiency: 0,
          totalBytes: 0,
          memoryUsageMb: 0,
          cpuUsagePercent: 0
        }
      };
    } finally {
      // 브라우저 정리
      if (browser && browser.isConnected()) {
        try {
          await browser.close();
          console.log(`   ✅ [인스턴스 ${instanceNumber}] 브라우저 정리 완료`);
        } catch (closeError) {
          console.warn(`   ⚠️ 브라우저 정리 실패: ${closeError.message}`);
        }
      }
    }
  }

  /**
   * 작업 결과 제출
   */
  async submitResult(result, instanceIndex) {
    const instanceNumber = this.baseInstanceNumber + instanceIndex;
    const hubApiClient = this.hubApiClients.get(instanceIndex);
    
    try {
      // 🔍 DEBUG: 허브 API로 제출되는 전체 결과 로그 출력
      console.log('\n' + '='.repeat(80));
      console.log(`📤 [인스턴스 ${instanceNumber}] 허브 API 제출 데이터:`);
      console.log('='.repeat(80));
      console.log(JSON.stringify(result, null, 2));
      console.log('='.repeat(80) + '\n');
      
      await hubApiClient.submitResult(result);
      
      if (result.status === 'completed' && result.result.status === 'success') {
        console.log(`✅ [인스턴스 ${instanceNumber}] 작업 성공적으로 완료 및 제출`);
      } else {
        console.log(`⚠️ [인스턴스 ${instanceNumber}] 작업 실패로 제출됨: ${result.result.errorMessage || '알 수 없는 오류'}`);
      }
      
    } catch (error) {
      console.error(`❌ [인스턴스 ${instanceNumber}] 결과 제출 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 프록시 URL 파싱
   */
  parseProxyUrl(proxyUrl) {
    if (!proxyUrl) return null;
    
    try {
      const url = new URL(proxyUrl);
      const proxyConfig = {
        server: `${url.protocol}//${url.host}`
      };
      
      // username과 password가 있는 경우에만 추가
      if (url.username && url.password) {
        proxyConfig.username = url.username;
        proxyConfig.password = url.password;
      }
      
      return proxyConfig;
    } catch (error) {
      console.warn('⚠️ 프록시 URL 파싱 실패:', error.message);
      return null;
    }
  }

  /**
   * 차단 관련 에러인지 확인 (레거시 메서드, 새 시스템에서는 getHttpStatusCode 사용)
   */
  isBlockedError(errorMessage) {
    if (!errorMessage) return false;
    
    const blockIndicators = [
      'ERR_HTTP2_PROTOCOL_ERROR',
      'ERR_HTTP2_PROTOCCOL_ERROR',
      'net::ERR_HTTP2_PROTOCOL_ERROR',
      'net::ERR_HTTP2_PROTOCCOL_ERROR',
      '쿠팡 접속 차단',
      'HTTP/2 프로토콜 오류',
      'access denied',
      'blocked',
      '차단',
      'forbidden'
    ];
    
    return blockIndicators.some(indicator => 
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * 상품 데이터 수집 (유연한 JSON 구조, 향상된 상품 정보 포함)
   */
  collectProductData(automationResult) {
    // 기본 상품 데이터 구조
    const productData = {};

    // 클릭된 상품 정보가 있는 경우
    if (automationResult?.clickedProduct) {
      productData.clicked_product = {
        product_id: automationResult.clickedProduct.productId || null,
        name: automationResult.clickedProduct.name || null,
        price: automationResult.clickedProduct.price || 0,
        position: automationResult.clickedProduct.position || 0,
        url: automationResult.clickedProduct.url || null
      };
    }

    // productInfo가 있는 경우 (향상된 상품 정보)
    if (automationResult?.productInfo) {
      productData.product_name = automationResult.productInfo.name;
      productData.product_rating = automationResult.productInfo.rating;
      productData.review_count = automationResult.productInfo.reviewCount;
      productData.product_price = automationResult.productInfo.price;
      productData.search_rank = automationResult.productRank;
      productData.url_rank = automationResult.urlRank;
      productData.product_code = automationResult.productInfo.productCode;
      productData.item_id = automationResult.itemId;
      productData.vendor_item_id = automationResult.vendorItemId;
    }

    // 빈 객체인 경우에도 반환
    if (Object.keys(productData).length === 0) {
      return {};
    }

    // 추가 정보가 있으면 포함
    if (automationResult.additionalInfo) {
      productData.additional_info = {};
      
      // 리뷰 정보
      if (automationResult.additionalInfo.reviews) {
        productData.additional_info.reviews = {
          count: automationResult.additionalInfo.reviews.count || 0,
          average_rating: automationResult.additionalInfo.reviews.averageRating || 0
        };
      }
      
      // 판매자 정보
      if (automationResult.additionalInfo.seller) {
        productData.additional_info.seller = {
          name: automationResult.additionalInfo.seller.name || null,
          rating: automationResult.additionalInfo.seller.rating || 0,
          is_rocket: automationResult.additionalInfo.seller.isRocket || false
        };
      }
      
      // 배송 정보
      if (automationResult.additionalInfo.shipping) {
        productData.additional_info.shipping = {
          type: automationResult.additionalInfo.shipping.type || null,
          fee: automationResult.additionalInfo.shipping.fee || 0,
          estimated_days: automationResult.additionalInfo.shipping.estimatedDays || 0
        };
      }
      
      // 할인 정보
      if (automationResult.additionalInfo.discount) {
        productData.additional_info.discount = {
          original_price: automationResult.additionalInfo.discount.originalPrice || 0,
          discount_rate: automationResult.additionalInfo.discount.discountRate || 0,
          coupon_available: automationResult.additionalInfo.discount.couponAvailable || false
        };
      }
    }

    return productData;
  }

  /**
   * 성능 메트릭 수집
   */
  collectPerformanceMetrics(automationResult, networkMonitor) {
    const performanceData = {
      pageLoadTimeMs: automationResult?.performanceMetrics?.pageLoadTime || 0,
      domReadyTimeMs: automationResult?.performanceMetrics?.domReadyTime || 0,
      firstProductTimeMs: automationResult?.performanceMetrics?.firstProductTime || 0,
      totalRequests: 0,
      blockedRequests: 0,
      cacheHitRate: 0,
      networkEfficiency: 0,
      totalBytes: 0,
      memoryUsageMb: 0,
      cpuUsagePercent: 0
    };

    // 네트워크 모니터 데이터 수집
    if (networkMonitor && networkMonitor.getStats) {
      try {
        const networkStats = networkMonitor.getStats();
        performanceData.totalRequests = networkStats.totalRequests || 0;
        performanceData.blockedRequests = networkStats.blockedRequests || 0;
        performanceData.totalBytes = networkStats.totalBytes || 0;
        
        // 캐시 히트율 계산
        if (networkStats.totalRequests > 0) {
          const cacheHits = networkStats.cacheHits || 0;
          performanceData.cacheHitRate = Number((cacheHits / networkStats.totalRequests).toFixed(3));
        }
        
        // 네트워크 효율성 계산 (차단된 요청 비율 기반)
        if (networkStats.totalRequests > 0) {
          const efficiency = 1 - (networkStats.blockedRequests / networkStats.totalRequests);
          performanceData.networkEfficiency = Number(efficiency.toFixed(3));
        }
      } catch (error) {
        console.warn('⚠️ 네트워크 메트릭 수집 실패:', error.message);
      }
    }

    // 메모리/CPU 사용량 (시스템 정보가 있는 경우)
    if (automationResult?.systemMetrics) {
      performanceData.memoryUsageMb = automationResult.systemMetrics.memoryUsage || 0;
      performanceData.cpuUsagePercent = automationResult.systemMetrics.cpuUsage || 0;
    }

    return performanceData;
  }

  /**
   * API 모드 중단
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ API 모드가 실행 중이 아닙니다');
      return;
    }

    console.log('🛑 API 모드 정리 중...');
    this.isRunning = false;

    // 인스턴스별 폴더 상태 리셋
    for (const hybridProfileManager of this.hybridProfileManagers.values()) {
      if (hybridProfileManager.resetAllFolderStates) {
        hybridProfileManager.resetAllFolderStates();
      }
    }

    const uptime = (Date.now() - this.stats.startTime.getTime()) / 1000;
    console.log(`✅ API 모드 정상 종료 (가동시간: ${uptime.toFixed(1)}초)`);
    
    this.printStats();
  }

  /**
   * 통계 출력
   */
  printStats() {
    const uptime = (Date.now() - this.stats.startTime.getTime()) / 1000;
    const successRate = this.stats.totalAssigned > 0 ? 
      (this.stats.completed / this.stats.totalAssigned * 100).toFixed(1) : 0;
    
    console.log('\n📊 멀티인스턴스 실행 통계');
    console.log('─'.repeat(60));
    console.log(`⏱️ 총 가동 시간: ${(uptime / 60).toFixed(1)}분`);
    console.log(`🤖 총 인스턴스 수: ${this.threadCount}개`);
    console.log(`⚡ 활성 인스턴스: ${this.stats.activeInstanceCount}개`);
    console.log(`📋 할당된 작업: ${this.stats.totalAssigned}개`);
    console.log(`✅ 완료된 작업: ${this.stats.completed}개`);
    console.log(`❌ 실패한 작업: ${this.stats.failed}개`);
    console.log(`🚫 차단된 작업: ${this.stats.blocked}개`);
    console.log(`📈 성공률: ${successRate}%`);
    if (uptime > 0) {
      console.log(`⚡ 처리량: ${(this.stats.completed / (uptime / 60)).toFixed(1)} 작업/분`);
      console.log(`🔥 인스턴스당 처리량: ${(this.stats.completed / this.threadCount / (uptime / 60)).toFixed(1)} 작업/분/인스턴스`);
    }
    
    // 인스턴스별 상태 표시
    console.log('\n🤖 인스턴스 상태:');
    for (let i = 0; i < this.threadCount; i++) {
      const instanceInfo = this.activeInstances.get(i);
      if (instanceInfo) {
        const statusIcon = this.getStatusIcon(instanceInfo.status);
        const keyword = instanceInfo.workAllocation?.work?.keyword || '-';
        const instanceNumber = this.baseInstanceNumber + i;
        console.log(`   인스턴스 ${instanceNumber}: ${statusIcon} ${instanceInfo.status} (${keyword})`);
      } else {
        const instanceNumber = this.baseInstanceNumber + i;
        console.log(`   인스턴스 ${instanceNumber}: 💤 idle`);
      }
    }
    console.log('─'.repeat(60));
  }

  /**
   * 상태 아이콘 반환
   */
  getStatusIcon(status) {
    const icons = {
      idle: '💤',
      requesting_work: '📋',
      executing: '🚀',
      submitting: '📤',
      completed: '✅',
      error: '❌',
      waiting_folder: '📁'
    };
    return icons[status] || '❓';
  }

  /**
   * 현재 상태 조회
   */
  getStatus() {
    return {
      baseInstanceNumber: this.baseInstanceNumber,
      instanceCount: this.threadCount,
      isRunning: this.isRunning,
      stats: this.stats,
      activeInstances: Array.from(this.activeInstances.entries()).map(([index, info]) => ({
        instanceIndex: index,
        instanceNumber: info.instanceNumber,
        status: info.status,
        keyword: info.workAllocation?.work?.keyword || null,
        lastUpdate: info.lastUpdate
      })),
      hubApiClients: Array.from(this.hubApiClients.entries()).map(([index, client]) => ({
        instanceIndex: index,
        instanceNumber: this.baseInstanceNumber + index,
        status: client.getStatus ? client.getStatus() : 'unknown'
      })),
      hybridProfileManagers: Array.from(this.hybridProfileManagers.entries()).map(([index, manager]) => ({
        instanceIndex: index,
        instanceNumber: this.baseInstanceNumber + index,
        status: manager.getStatus ? manager.getStatus() : 'unknown'
      }))
    };
  }
}

/**
 * API 모드 실행
 */
async function runApiMode(options) {
  const runner = new ApiModeRunner({
    baseInstanceNumber: options.instanceNumber || 1,
    threadCount: options.threadCount || 4,
    hubBaseUrl: options.hubBaseUrl,
    basePath: options.basePath,
    pollInterval: options.pollInterval
  });

  // 우아한 종료 설정
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach(signal => {
    process.on(signal, async () => {
      console.log(`\n🚨 ${signal} 신호 수신 - 우아한 종료 시작...`);
      try {
        await runner.stop();
        process.exit(0);
      } catch (error) {
        console.error('❌ 우아한 종료 실패:', error.message);
        process.exit(1);
      }
    });
  });

  await runner.start();
  
  // 무한 대기 (SIGINT로 종료될 때까지)
  await new Promise(() => {});
}

module.exports = { runApiMode, ApiModeRunner };