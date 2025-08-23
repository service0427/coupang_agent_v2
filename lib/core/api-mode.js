/**
 * API 모드 실행 모듈
 * 허브 API를 통한 작업 할당/결과 제출 방식
 */

const { executeKeywordSearch } = require('../core/search-executor');
const { browserManager } = require('../modules/browser-service');
const { HubApiClient } = require('../modules/api-service');
const { SharedCacheManager } = require('../modules/browser-service');
const { cleanChromeProfile, calculateWindowPosition, setTotalThreadCount, initializeScreenResolution } = require('../utils/browser-helpers');

/**
 * 실행 결과에서 IP 정보 추출 헬퍼
 */
function extractIpFromResult(automationResult) {
  // automationResult가 없거나 에러인 경우에도 actualIp 추출 시도
  return automationResult?.actualIp || null;
}

class ApiModeRunner {
  constructor(config = {}) {
    this.options = config; // 전체 옵션 저장
    this.threadCount = config.threadCount || 4; // 동시 실행 쓰레드 수
    this.pollInterval = config.pollInterval || 5000; // 5초
    this.isRunning = false;
    this.completedThreads = 0; // --once 모드에서 완료된 쓰레드 수
    
    // 브라우저 레이아웃을 위해 전체 스레드 수 설정
    setTotalThreadCount(this.threadCount);
    
    // 화면 해상도 초기화 (비동기로 처리)
    initializeScreenResolution().catch(err => {
      console.log('⚠️ 화면 해상도 초기화 실패, 기본값 사용');
    });
    
    // 쓰레드별 허브 클라이언트 생성
    this.hubApiClients = new Map();
    
    // 쓰레드 수만큼 클라이언트 생성
    for (let i = 0; i < this.threadCount; i++) {
      // 각 쓰레드별 허브 클라이언트
      this.hubApiClients.set(i, new HubApiClient({
        hubBaseUrl: config.hubBaseUrl,
        threadNumber: i + 1  // 쓰레드 번호 (1부터 시작)
      }));
    }
    
    // 쓰레드 관리
    this.activeThreads = new Map(); // threadId -> threadInfo
    
    // 통계
    this.stats = {
      totalAssigned: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      startTime: new Date(),
      activeThreadCount: 0
    };
    
    // 간소화된 통계
    this.threadStats = new Map(); // 쓰레드별 사용 추적
    
    // SharedCache 초기화
    this.sharedCacheManager = new SharedCacheManager({ basePath: config.basePath || './browser-data' });
    
    console.log(`🤖 ApiModeRunner 초기화 (쓰레드: ${this.threadCount}개)`);
  }

  /**
   * API 모드 시작
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ API 모드가 이미 실행 중입니다');
      return;
    }

    console.log(`🚀 API 모드 시작 (쓰레드: ${this.threadCount}개)`);
    
    try {
      // SharedCache 초기화
      await this.sharedCacheManager.initialize();
      
      // 모든 허브 클라이언트의 서버 연결 확인
      const healthChecks = Array.from(this.hubApiClients.values()).map(client => client.checkHealth());
      await Promise.all(healthChecks);
      
      this.isRunning = true;
      this.stats.startTime = new Date();
      
      // 메인 워크플로우 루프 시작
      this.startWorkflowLoop();
      
      console.log(`✅ API 모드 시작 완료 (쓰레드: ${this.threadCount}개)`);
      
    } catch (error) {
      console.error('❌ API 모드 시작 실패:', error.message);
      throw error;
    }
  }

  /**
   * 워크플로우 루프
   */
  async startWorkflowLoop() {
    console.log(`🔄 워크플로우 시작 (쓰레드: ${this.threadCount}개, 폴링 간격: ${this.pollInterval}ms)`);

    // 모든 쓰레드 시작
    for (let i = 0; i < this.threadCount; i++) {
      this.startThreadWorkLoop(i);
    }
  }

  /**
   * 개별 쓰레드 워크 루프
   */
  async startThreadWorkLoop(threadIndex) {
    const threadNumber = threadIndex + 1; // 쓰레드 번호 (1부터 시작)
    console.log(`🔧 쓰레드 ${threadNumber} 시작`);
    
    const threadWorkLoop = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.processNextWork(threadIndex);
      } catch (error) {
        console.error(`🔥 쓰레드 ${threadNumber} 워크플로우 오류:`, error.message);
      }

      // 다음 폴링 스케줄 (쓰레드별 독립적)
      if (this.isRunning) {
        // --once 옵션이 활성화되면 한 번만 실행하고 종료
        if (this.options.once) {
          console.log(`🏁 [쓰레드 ${threadNumber}] --once 모드: 작업 완료 후 종료`);
          this.completedThreads++;
          
          // 모든 쓰레드가 완료되면 프로그램 종료
          if (this.completedThreads >= this.threadCount) {
            console.log(`\n✅ 모든 쓰레드 완료 (${this.completedThreads}/${this.threadCount})`);
            console.log(`🛑 --once 모드: 프로그램 종료`);
            this.stop();
            process.exit(0);
          }
          return;
        }
        setTimeout(threadWorkLoop, this.pollInterval + (Math.random() * 500)); // 약간의 지연 추가로 동시 요청 방지
      }
    };

    // 쓰레드별 시차 시작 (0.5초씩 간격)
    setTimeout(() => {
      if (this.isRunning) {
        threadWorkLoop();
      }
    }, threadIndex * 500);
  }

  /**
   * 다음 작업 처리 (쓰레드별)
   */
  async processNextWork(threadIndex) {
    const threadNumber = threadIndex + 1;
    const hubApiClient = this.hubApiClients.get(threadIndex);
    
    try {
      // 쓰레드 상태 업데이트
      this.updateThreadStatus(threadIndex, 'requesting_work');
      
      // 1. 작업 할당 요청 (각 쓰레드가 고유한 번호로 요청)
      const workAllocation = await hubApiClient.allocateWork();
      
      if (!workAllocation) {
        this.updateThreadStatus(threadIndex, 'idle');
        
        // --once 모드에서 작업이 없으면 해당 쓰레드 종료
        if (this.options.once) {
          console.log(`📍 [쓰레드 ${threadNumber}] 작업이 없음. --once 모드로 종료`);
          this.completedThreads++;
          
          // 모든 쓰레드가 완료되면 프로그램 종료
          if (this.completedThreads >= this.threadCount) {
            console.log(`\n✅ 모든 쓰레드 완료 (${this.completedThreads}/${this.threadCount})`);
            console.log(`🛑 --once 모드: 프로그램 종료`);
            this.stop();
            process.exit(0);
          }
          return;
        }
        
        console.log(`⏳ [쓰레드 ${threadNumber}] 작업이 없음. 10초 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기
        return;
      }

      this.stats.totalAssigned++;
      
      console.log(`🎯 [쓰레드 ${threadNumber}] 작업 할당됨: ${workAllocation.work.keyword} (${workAllocation.allocationKey})`);
      
      // 2. 작업 실행
      this.updateThreadStatus(threadIndex, 'executing', workAllocation);
      const result = await this.executeWork(workAllocation, threadIndex);
      
      // 3. 결과 제출 (해당 쓰레드의 허브 클라이언트 사용)
      this.updateThreadStatus(threadIndex, 'submitting');
      await this.submitResult(result, threadIndex);
      
      // 4. 쓰레드 상태 초기화
      this.updateThreadStatus(threadIndex, 'completed');
      
    } catch (error) {
      // 서버 메시지를 그대로 표시
      console.error(`❌ [쓰레드 ${threadNumber}] ${error.message}`);
      this.updateThreadStatus(threadIndex, 'error', null, error.message);
      
      // 작업 할당 관련 에러인 경우
      if (error.message.includes('No proxies available') || 
          error.message.includes('No keywords') ||
          error.message.includes('No active keywords')) {
        
        // --once 모드에서는 에러 발생 시에도 종료
        if (this.options.once) {
          console.log(`📍 [쓰레드 ${threadNumber}] 작업 할당 불가. --once 모드로 종료`);
          this.completedThreads++;
          
          // 모든 쓰레드가 완료되면 프로그램 종료
          if (this.completedThreads >= this.threadCount) {
            console.log(`\n✅ 모든 쓰레드 완료 (${this.completedThreads}/${this.threadCount})`);
            console.log(`🛑 --once 모드: 프로그램 종료`);
            this.stop();
            process.exit(0);
          }
          return;
        }
        
        console.log(`⏳ [쓰레드 ${threadNumber}] 10초 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기
      }
    }
  }

  /**
   * 쓰레드 상태 업데이트
   */
  updateThreadStatus(threadIndex, status, workAllocation = null, error = null) {
    const threadNumber = threadIndex + 1;
    const threadInfo = {
      index: threadIndex,
      threadNumber: threadNumber,
      status: status, // idle, requesting_work, executing, submitting, completed, error, waiting_proxy, waiting_work, waiting_limit
      workAllocation: workAllocation,
      error: error,
      lastUpdate: new Date()
    };
    
    this.activeThreads.set(threadIndex, threadInfo);
    
    // 활성 쓰레드 수 업데이트
    this.stats.activeThreadCount = Array.from(this.activeThreads.values())
      .filter(i => ['requesting_work', 'executing', 'submitting'].includes(i.status)).length;
  }

  /**
   * 작업 실행
   */
  async executeWork(workAllocation, threadIndex) {
    const threadNumber = threadIndex + 1;
    const startTime = new Date();
    const MAX_EXECUTION_TIME = 90000; // 최대 1분 30초 (120초는 너무 김)
    console.log(`▶️ [쓰레드 ${threadNumber}] 작업 실행 시작: ${workAllocation.work.keyword}`);
    
    let browser = null;
    let page = null;

    try {
      // V2 시스템을 위한 키워드 데이터 구성
      const keywordData = {
        id: null, // API 모드에서는 DB ID 없음
        keyword: workAllocation.work.keyword,
        product_code: workAllocation.work.code,
        agent: `api_instance_${threadNumber}`,
        cart_click_enabled: true, // 항상 활성화 (고정)
        proxy_server: workAllocation.proxy.url,
        // V2 최적화 설정 적용 (모든 차단 활성화)
        optimize: true,
        coupang_main_allow: '["document"]'
      };

      // 쓰레드별 고정 폴더 사용 (01, 02, 03... 형식)
      const folderNumber = String(threadNumber).padStart(2, '0'); // 1 -> 01, 10 -> 10
      const userFolderPath = `/home/tech/coupang_agent_v2/browser-data/${folderNumber}`;
      
      console.log(`   📁 [쓰레드 ${threadNumber}] 고정 폴더 사용`);
      console.log(`   📂 유저폴더 경로: ${userFolderPath}`);
      
      // 프로필 초기화 체크 (최초 실행시)
      try {
        const needsInit = await this.sharedCacheManager.needsProfileInitialization(userFolderPath);
        if (needsInit) {
          console.log(`   🆕 [쓰레드 ${threadNumber}] 최초 실행 - 프로필 초기화`);
          const initSuccess = await this.sharedCacheManager.createInitialProfile(userFolderPath);
          if (!initSuccess) {
            console.warn(`   ⚠️ [쓰레드 ${threadNumber}] 프로필 초기화 실패 - 계속 진행`);
          }
        }
      } catch (initError) {
        console.warn(`   ⚠️ [쓰레드 ${threadNumber}] 프로필 초기화 체크 실패: ${initError.message}`);
      }
      
      // 캐시 공유 설정
      try {
        const isFirstRun = await this.sharedCacheManager.isFirstRun(userFolderPath);
        await this.sharedCacheManager.setupUserFolderCache(userFolderPath, isFirstRun, false);
        console.log(`   🔗 [쓰레드 ${threadNumber}] 캐시 공유 설정 완료`);
      } catch (cacheError) {
        console.log(`   ⚠️ [쓰레드 ${threadNumber}] 캐시 설정 실패 (무시): ${cacheError.message}`);
      }
      
      // Chrome Preferences 정리 (복구 메시지 방지)
      try {
        await cleanChromeProfile(userFolderPath);
      } catch (prefError) {
        console.log(`   ⚠️ [쓰레드 ${threadNumber}] Preferences 정리 실패 (무시): ${prefError.message}`);
      }
      
      // 브라우저 옵션 구성 (최적화된 프로필 사용)
      const proxyConfig = this.parseProxyUrl(workAllocation.proxy.url);
      
      // 브라우저 위치와 크기 계산 (스레드 수에 따라 자동 배치)
      const { calculateViewportSize } = require('../utils/browser-helpers');
      const windowPosition = calculateWindowPosition(threadIndex);
      const viewportSize = calculateViewportSize(threadIndex);
      
      // 위치와 크기 정보 합치기
      const browserLayout = {
        x: windowPosition.x,
        y: windowPosition.y,
        width: viewportSize.width,
        height: viewportSize.height
      };
      
      console.log(`   📐 [쓰레드 ${threadNumber}] 브라우저 배치: (${browserLayout.x}, ${browserLayout.y}) 크기: ${browserLayout.width}x${browserLayout.height}`);

      // 브라우저 실행 (항상 GUI 모드)
      console.log(`   🚀 [쓰레드 ${threadNumber}] 브라우저 실행 중... (쓰레드별 고정 폴더, GUI 모드)`);
      const browserInfo = await browserManager.getBrowser({
        proxyConfig,
        usePersistent: true,
        profileName: folderNumber,  // 01, 02, 03... 형식
        userDataDir: userFolderPath, // 쓰레드별 고정 폴더 경로 사용
        clearSession: true, // 항상 세션 정리
        headless: false,     // 항상 GUI 모드
        windowPosition: browserLayout  // 위치와 크기 정보 전달
      });
      
      browser = browserInfo.browser;
      page = browserInfo.page;

      // V2 search-executor를 통한 자동화 실행 (최대 실행 시간 제한)
      const automationPromise = executeKeywordSearch(
        page,
        keywordData,
        { 
          // checkCookies 옵션 제거됨
          // monitor 옵션 제거됨
          threadNumber: threadNumber  // 쓰레드 번호 추가
        }
      );
      
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Maximum execution time (${MAX_EXECUTION_TIME/1000}s) exceeded`));
        }, MAX_EXECUTION_TIME);
      });
      
      let automationResult;
      try {
        automationResult = await Promise.race([automationPromise, timeoutPromise]);
      } catch (timeoutError) {
        console.error(`❌ [쓰레드 ${threadNumber}] 최대 실행 시간 초과`);
        throw timeoutError;
      }

      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();
      
      // 결과 분석 - 상품을 찾고 클릭까지 성공한 경우만 성공
      const isSuccess = automationResult && !automationResult.error && automationResult.success && automationResult.productFound;
      const errorMessage = automationResult?.error || automationResult?.errorMessage;
      const productFoundButFailed = automationResult?.productFound && !isSuccess;  // 상품은 찾았지만 클릭 실패
      
      // 에러 타입 결정
      let errorType = null;
      if (!isSuccess) {
        if (productFoundButFailed) {
          // 상품은 찾았지만 클릭이나 처리 실패
          errorType = 'product_found_but_failed';
        } else if (!errorMessage && automationResult && !automationResult.productFound) {
          errorType = 'product_not_found';
        } else if (errorMessage) {
          // 대소문자 구분 없이 체크
          const lowerMessage = errorMessage.toLowerCase();
          
          if (lowerMessage.includes('timeout') || 
              lowerMessage.includes('exceeded')) {
            errorType = 'timeout';
          } else if (lowerMessage.includes('err_http2_protocol_error') || 
                     errorMessage.includes('쿠팡 접속 차단') ||
                     lowerMessage.includes('captcha')) {
            errorType = 'blocked';
          } else if (errorMessage.includes('프록시') || 
                     errorMessage.includes('프록시 리다이렉트')) {
            errorType = 'proxy_error';
          } else if (errorMessage.includes('네트워크 오류') || 
                     lowerMessage.includes('chrome-error://')) {
            errorType = 'network_error';
          } else if (errorMessage.includes('상품을 찾을 수 없음')) {
            errorType = 'product_not_found';
          } else {
            errorType = 'unknown';
          }
        } else {
          errorType = 'unknown';
        }
      }
      
      // referer 검증 - product_not_found일 경우 실제로 10페이지까지 검색했는지 확인
      // product_found_but_failed는 검증 불필요 (이미 상품을 찾았으므로)
      let refererValidated = false;
      let actualPageNumber = 0;
      
      if (errorType === 'product_not_found') {
        if (automationResult?.referer) {
          const refererUrl = automationResult.referer;
          console.log(`   📍 [쓰레드 ${threadNumber}] Referer 검증: ${refererUrl}`);
          
          // 쿠팡 검색 페이지인지 확인
          if (!refererUrl.includes('coupang.com/np/search')) {
            console.log(`   ⚠️ [쓰레드 ${threadNumber}] 비정상 Referer - 검색 페이지가 아님`);
            errorType = 'blocked';
            refererValidated = true;
          } else {
            // URL에서 page 파라미터 추출
            const pageMatch = refererUrl.match(/[&?]page=(\d+)/);
            actualPageNumber = pageMatch ? parseInt(pageMatch[1]) : 1;
            
            // 10페이지 미만에서 종료된 경우 처리
            if (actualPageNumber < 10) {
              // 1페이지에서 종료된 경우는 검색 결과가 적을 수 있음
              if (actualPageNumber === 1) {
                // errorMessage에 HTTP2 에러나 차단 관련 메시지가 있는지 확인
                if (errorMessage && (errorMessage.includes('HTTP2_PROTOCOL_ERROR') || 
                    errorMessage.includes('쿠팡 접속 차단'))) {
                  console.log(`   ⚠️ [쓰레드 ${threadNumber}] 1페이지 차단 감지: HTTP2 에러`);
                  errorType = 'blocked';
                  refererValidated = true;
                } else {
                  // 1페이지만 있는 정상적인 경우일 수 있음
                  console.log(`   ℹ️ [쓰레드 ${threadNumber}] 1페이지 검색 완료 (검색 결과 부족 가능성)`);
                  // errorType은 product_not_found 유지
                }
              } else {
                // 2-9페이지에서 종료는 비정상
                console.log(`   ⚠️ [쓰레드 ${threadNumber}] 비정상 종료: ${actualPageNumber}페이지에서 중단됨 (10페이지 미도달)`);
                errorType = 'blocked';
                refererValidated = true;
              }
            } else {
              console.log(`   ✅ [쓰레드 ${threadNumber}] 정상 검색: ${actualPageNumber}페이지까지 검색 완료`);
            }
          }
        } else {
          // referer가 없는 경우도 비정상
          console.log(`   ⚠️ [쓰레드 ${threadNumber}] Referer 없음 - 비정상 종료 의심`);
          errorType = 'blocked';
          refererValidated = true;
        }
      }
      
      // 통계 업데이트 (referer 검증 후)
      if (isSuccess) {
        this.stats.completed++;
        console.log(`✅ [쓰레드 ${threadNumber}] 작업 성공 완료: ${executionTime}ms`);
      } else {
        // 에러 타입별 통계
        if (errorType === 'blocked') {
          this.stats.blocked++;
          console.log(`🚫 [쓰레드 ${threadNumber}] 쿠팡 차단 감지: ${executionTime}ms`);
          
          // 차단 상세 정보 표시
          if (errorMessage && errorMessage.includes('HTTP2_PROTOCOL_ERROR')) {
            console.log(`   🔴 HTTP2 프로토콜 에러 - 명확한 차단 신호`);
          } else if (actualPageNumber > 0 && actualPageNumber < 10) {
            console.log(`   🔴 ${actualPageNumber}페이지에서 비정상 종료 - 차단 가능성 높음`);
          } else if (!automationResult?.referer) {
            console.log(`   🔴 Referer 없음 - 초기 차단 의심`);
          }
          console.log(`   💡 대응: 프록시 변경 또는 대기 시간 필요`);
          
        } else if (errorType === 'product_found_but_failed') {
          this.stats.failed++;
          console.log(`⚠️ [쓰레드 ${threadNumber}] 상품 발견했지만 클릭 실패: ${executionTime}ms`);
          if (automationResult?.productRank) {
            console.log(`   📍 상품 순위: ${automationResult.productRank}위 (실제: ${automationResult.realRank}위)`);
          }
        } else {
          this.stats.failed++;
          console.log(`❌ [쓰레드 ${threadNumber}] 작업 실패: ${executionTime}ms`);
        }
        
        if (errorMessage && errorType !== 'blocked') {
          console.log(`   📍 오류: ${errorMessage}`);
        } else if (automationResult && !automationResult.productFound && errorType !== 'blocked') {
          console.log(`   📍 오류: 상품을 찾을 수 없음`);
        }
      }
      
      // 간소화된 결과 반환
      if (isSuccess) {
        // 성공 시
        const productData = this.collectProductData(automationResult);
        return {
          allocation_key: workAllocation.allocationKey,
          proxy_id: workAllocation.proxyId,  // proxy_id 추가
          user_folder: workAllocation.userFolder,  // user_folder 추가
          success: true,
          execution_time_ms: executionTime,
          actual_ip: extractIpFromResult(automationResult),
          product_data: productData,
          referer: automationResult?.referer || null
        };
      } else {
        // 실패 시
        let finalErrorMessage = errorMessage;
        
        // referer 검증 결과 반영
        if (refererValidated && errorType === 'blocked') {
          // referer 검증에서 차단으로 판명된 경우
          if (!finalErrorMessage || finalErrorMessage === '상품을 찾을 수 없음') {
            if (actualPageNumber > 0) {
              finalErrorMessage = `쿠팡 차단 - ${actualPageNumber}페이지에서 중단됨`;
            } else {
              finalErrorMessage = `쿠팡 차단 - 초기 접속 차단`;
            }
          }
        } else if (errorType === 'blocked' && errorMessage && errorMessage.includes('HTTP2_PROTOCOL_ERROR')) {
          // HTTP2 에러로 명확한 차단
          finalErrorMessage = `쿠팡 차단 - HTTP2_PROTOCOL_ERROR`;
        } else if (!finalErrorMessage && errorType === 'product_not_found') {
          // 진짜 product_not_found인 경우
          finalErrorMessage = `Product not found (${automationResult?.pagesSearched || 0} pages searched)`;
        }
        
        // product_found_but_failed인 경우 상품 정보도 포함
        const failedResult = {
          allocation_key: workAllocation.allocationKey,
          proxy_id: workAllocation.proxyId,  // proxy_id 추가
          user_folder: workAllocation.userFolder,  // user_folder 추가
          success: false,
          execution_time_ms: executionTime,
          actual_ip: extractIpFromResult(automationResult),
          error_type: errorType,
          error_message: finalErrorMessage || 'Unknown error',
          referer: automationResult?.referer || null
        };
        
        // 상품을 찾았지만 실패한 경우 상품 정보 추가
        if (errorType === 'product_found_but_failed' && automationResult) {
          failedResult.product_rank = automationResult.productRank || null;
          failedResult.real_rank = automationResult.realRank || null;
          failedResult.url_rank = automationResult.urlRank || null;
        }
        
        return failedResult;
      }

    } catch (error) {
      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();
      
      console.error(`❌ [쓰레드 ${threadNumber}] 작업 실행 실패: ${error.message}`);
      this.stats.failed++;
      
      // 에러 타입 결정
      let errorType = 'unknown';
      if (error.message.includes('browser') || error.message.includes('Chrome')) {
        errorType = 'browser_error';
      } else if (error.message.includes('timeout')) {
        errorType = 'timeout';
      }
      
      return {
        allocation_key: workAllocation.allocationKey,
        proxy_id: workAllocation.proxyId,  // proxy_id 추가
        user_folder: workAllocation.userFolder,  // user_folder 추가
        success: false,
        execution_time_ms: executionTime,
        actual_ip: null,
        error_type: errorType,
        error_message: error.message,
        referer: error.referer || null
      };
    } finally {
      // 브라우저 정리
      if (browser && browser.isConnected()) {
        try {
          // --keep-browser 옵션이 활성화된 경우 브라우저를 유지하고 사용자 입력 대기
          if (this.options.keepBrowser) {
            console.log(`   🔍 [쓰레드 ${threadNumber}] --keep-browser 옵션: 브라우저 분석을 위해 열어둡니다`);
            console.log(`   ⌨️  브라우저를 닫으려면 Enter를 누르세요...`);
            
            // 사용자 입력 대기
            await new Promise(resolve => {
              process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.once('data', () => {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                resolve();
              });
            });
          }
          
          await browser.close();
          console.log(`   ✅ [쓰레드 ${threadNumber}] 브라우저 정리 완료`);
        } catch (closeError) {
          console.warn(`   ⚠️ 브라우저 정리 실패: ${closeError.message}`);
        }
      }
    }
  }

  /**
   * 작업 결과 제출
   */
  async submitResult(result, threadIndex) {
    const threadNumber = threadIndex + 1;
    const hubApiClient = this.hubApiClients.get(threadIndex);
    
    try {
      // 간소화된 제출 결과 로그
      console.log(`📤 [쓰레드 ${threadNumber}] 결과 제출: ${result.allocation_key}`);
      
      await hubApiClient.submitResult(result);
      
      if (result.success) {
        console.log(`✅ [쓰레드 ${threadNumber}] 작업 성공적으로 완료 및 제출`);
        
        // 1초 대기 (서버 부하 방지)
        console.log(`   ⏳ 다음 작업 전 1초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`   ✅ 대기 완료, 다음 작업 준비`);
      } else {
        console.log(`⚠️ [쓰레드 ${threadNumber}] 작업 실패로 제출됨: ${result.error_message}`);
      }
      
    } catch (error) {
      console.error(`❌ [쓰레드 ${threadNumber}] 결과 제출 실패: ${error.message}`);
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
   * 상품 데이터 수집 (간소화된 구조)
   */
  collectProductData(automationResult) {
    // 상품 클릭 성공한 경우에만 데이터 반환
    if (!automationResult?.productFound) {
      return {};
    }

    return {
      name: automationResult.productInfo?.name || '',
      rating: automationResult.productInfo?.rating || null,
      review_count: automationResult.productInfo?.reviewCount || null,
      thumbnail_url: automationResult.productInfo?.thumbnailUrl || null,
      product_url: automationResult.productInfo?.url || '',
      real_rank: automationResult.realRank || null,
      url_rank: automationResult.urlRank || automationResult.productRank || null  // URL에서 추출한 공식 순위
    };
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
    
    console.log('\n📊 실행 통계');
    console.log('─'.repeat(60));
    console.log(`⏱️ 총 가동 시간: ${(uptime / 60).toFixed(1)}분`);
    console.log(`🔧 쓰레드 설정: ${this.threadCount}개`);
    console.log(`⚡ 활성 상태: ${this.isRunning ? '작동중' : '정지'}`);
    console.log(`📋 할당된 작업: ${this.stats.totalAssigned}개`);
    console.log(`✅ 완료된 작업: ${this.stats.completed}개`);
    console.log(`❌ 실패한 작업: ${this.stats.failed}개`);
    console.log(`🚫 차단된 작업: ${this.stats.blocked}개`);
    console.log(`📈 성공률: ${successRate}%`);
    if (uptime > 0) {
      console.log(`⚡ 처리량: ${(this.stats.completed / (uptime / 60)).toFixed(1)} 작업/분`);
    }
    
    // 간소화된 쓰레드 사용 통계
    if (this.threadStats && this.threadStats.size > 0) {
      console.log(`\n📡 쓰레드 사용 통계: ${this.threadStats.size}개 쓰레드 사용됨`);
    }
    
    // 모든 쓰레드 상태 표시
    console.log('\n🤖 쓰레드 상태:');
    for (let i = 0; i < this.threadCount; i++) {
      const threadInfo = this.activeThreads.get(i);
      const threadNumber = i + 1;
      if (threadInfo) {
        const statusIcon = this.getStatusIcon(threadInfo.status);
        const keyword = threadInfo.workAllocation?.work?.keyword || '-';
        console.log(`   쓰레드 ${threadNumber}: ${statusIcon} ${threadInfo.status} (${keyword})`);
      } else {
        console.log(`   쓰레드 ${threadNumber}: 💤 idle`);
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
      error: '❌'
    };
    return icons[status] || '❓';
  }
}

/**
 * API 모드 실행
 */
async function runApiMode(options) {
  const runner = new ApiModeRunner({
    threadCount: options.threadCount || 4,
    hubBaseUrl: 'http://mkt.techb.kr:3001',  // 고정 허브 서버
    basePath: options.basePath,
    pollInterval: 5000,  // 고정 5초 폴링
    // checkCookies 옵션 제거됨
    // monitor 옵션 제거됨
    once: options.once || false,
    keepBrowser: options.keepBrowser || false
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