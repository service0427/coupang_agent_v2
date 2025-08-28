/**
 * API 모드 실행 모듈
 * 허브 API를 통한 작업 할당/결과 제출 방식
 */

const { executeKeywordSearch } = require('../core/search-executor');
const { executeProductDetailExtraction } = require('../modules/product-detail-handler');
const { browserManager } = require('../modules/browser-service');
const { HubApiClient } = require('../modules/api-service');
const { SharedCacheManager } = require('../modules/browser-service');
const { cleanChromeProfile, calculateWindowPosition, setTotalThreadCount, initializeScreenResolution } = require('../utils/browser-helpers');

/**
 * 실행 결과에서 IP 정보 추출 헬퍼
 */
function extractIpFromResult(automationResult) {
  // automationResult가 없거나 에러인 경우에도 actualIp 추출 시도
  const actualIp = automationResult?.actualIp;
  
  // checkIP 함수에서 반환하는 객체 형태인 경우 ip 필드만 추출
  if (actualIp && typeof actualIp === 'object' && actualIp.ip) {
    return actualIp.ip;
  }
  
  // 이미 문자열인 경우 그대로 반환
  if (typeof actualIp === 'string') {
    return actualIp;
  }
  
  return null;
}

/**
 * referer URL에서 rank_data 객체 추출
 * @param {string} refererUrl - 쿠팡 검색 페이지 URL
 * @param {number} realRank - 실제 순위 (광고 제외)
 * @returns {Object} rank_data 객체 {page, listSize, rank}
 */
function extractRankDataFromReferer(refererUrl, realRank) {
  const defaultRankData = {
    page: 1,
    listSize: 36,
    rank: realRank ?? null
  };

  if (!refererUrl) {
    return defaultRankData;
  }

  try {
    const url = new URL(refererUrl);
    
    // page 파라미터 추출 (기본값: 1)
    const pageParam = url.searchParams.get('page');
    const page = pageParam ? parseInt(pageParam) : 1;
    
    // listSize 파라미터 추출 (기본값: 36)
    const listSizeParam = url.searchParams.get('listSize');
    const listSize = listSizeParam ? parseInt(listSizeParam) : 36;
    
    return {
      page: isNaN(page) ? 1 : page,
      listSize: isNaN(listSize) ? 36 : listSize,
      rank: realRank ?? null
    };
  } catch (error) {
    // URL 파싱 실패 시 기본값 반환
    return defaultRankData;
  }
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
        threadNumber: i + 1,  // 쓰레드 번호 (1부터 시작)
        workType: config.workType  // work_type 파라미터 전달
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
    
    // V2 시스템을 위한 키워드 데이터 구성 (catch 블록에서도 접근 가능하도록 밖으로 이동)
    const keywordData = {
        id: null, // API 모드에서는 DB ID 없음
        keyword: workAllocation.work.keyword,
        product_code: workAllocation.work.code,
        search_url: workAllocation.work.searchUrl, // 서버 제공 검색 URL (필터 포함)
        work_type: workAllocation.work.workType, // work_type 추가 ("rank" 등)
        item_id: workAllocation.work.itemId, // item_id 추가
        vendor_item_id: workAllocation.work.vendorItemId, // vendor_item_id 추가
        agent: `api_instance_${threadNumber}`,
        cart_click_enabled: true, // 항상 활성화 (고정)
        proxy_server: workAllocation.proxy.url,
        // V2 최적화 설정 적용 (모든 차단 활성화)
        optimize: true,
        coupang_main_allow: '["document"]'
      };

    try {
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

      // work_type에 따른 작업 실행 분기
      let automationPromise;
      
      if (keywordData.work_type === 'product_info') {
        // 상품 상세 정보 추출 작업
        console.log(`   📄 [쓰레드 ${threadNumber}] 상품 정보 추출 모드 (product_info)`);
        
        // product_id를 keywordData에 추가 (code에서 복사)
        keywordData.product_id = keywordData.product_code;
        
        automationPromise = executeProductDetailExtraction(
          page,
          keywordData,
          { 
            threadNumber: threadNumber  // 쓰레드 번호 추가
          }
        );
      } else {
        // 기존 키워드 검색 작업 (rank 등)
        console.log(`   🔍 [쓰레드 ${threadNumber}] 키워드 검색 모드 (${keywordData.work_type || 'rank'})`);
        
        automationPromise = executeKeywordSearch(
          page,
          keywordData,
          { 
            // checkCookies 옵션 제거됨
            // monitor 옵션 제거됨
            threadNumber: threadNumber  // 쓰레드 번호 추가
          }
        );
      }
      
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Maximum execution time (${MAX_EXECUTION_TIME/1000}s) exceeded`));
        }, MAX_EXECUTION_TIME);
      });
      
      let automationResult;
      let isTimeout = false;
      try {
        automationResult = await Promise.race([automationPromise, timeoutPromise]);
      } catch (timeoutError) {
        // 타임아웃 발생, 하지만 즉시 throw하지 않고 부분 결과 처리 가능성 확인
        console.log(`⏱️ [쓰레드 ${threadNumber}] 최대 실행 시간(${MAX_EXECUTION_TIME/1000}s) 초과`);
        isTimeout = true;
        
        // automationPromise가 이미 부분적으로 완료된 상태일 수 있으므로
        // 타임아웃 플래그만 설정하고 계속 진행
        // automationResult는 undefined로 유지
      }

      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();
      
      // 타임아웃 발생 시 특수 처리
      if (isTimeout) {
        // rank 모드에서 타임아웃 발생 시 부분 성공 처리 가능성 확인
        if (workAllocation.work.workType === 'rank') {
          // automationResult가 없어도 기본 결과 구조 생성
          if (!automationResult) {
            // 90초 타임아웃 기준으로 대략적인 페이지 수 추정 (페이지당 평균 10초)
            const estimatedPages = Math.floor(MAX_EXECUTION_TIME / 1000 / 10);
            automationResult = {
              success: false,
              productFound: false,
              pagesSearched: estimatedPages,  // 추정치 사용
              errorMessage: 'Timeout occurred',
              errorType: 'timeout'
            };
          }
          
          // 5페이지 이상 검색했으면 부분 성공으로 처리
          const pagesCompleted = automationResult.pagesSearched || 0;
          if (pagesCompleted >= 5) {
            console.log(`   ✅ [쓰레드 ${threadNumber}] rank 모드 타임아웃 부분 성공 (${pagesCompleted}페이지 완료)`);
            automationResult.success = true;
            automationResult.partialSuccess = true;
            automationResult.errorType = 'timeout_partial';
            automationResult.errorMessage = `${pagesCompleted}페이지 검색 후 타임아웃 (부분 성공)`;
          } else {
            console.log(`   ❌ [쓰레드 ${threadNumber}] rank 모드 타임아웃 실패 (${pagesCompleted}페이지만 완료)`);
            automationResult.success = false;
            automationResult.errorType = 'timeout';
            automationResult.errorMessage = `타임아웃 발생 (${pagesCompleted}페이지 완료)`;
          }
        } else {
          // rank 모드가 아닌 경우 타임아웃은 실패
          console.log(`   ❌ [쓰레드 ${threadNumber}] 타임아웃으로 작업 실패`);
          if (!automationResult) {
            automationResult = {
              success: false,
              errorMessage: 'Maximum execution time exceeded',
              errorType: 'timeout'
            };
          }
        }
      }
      
      // 결과 분석 - 상품을 찾고 클릭 성공하거나, 정상적으로 검색을 완료한 경우 성공
      const productFound = automationResult && automationResult.productFound;
      const clickSuccess = automationResult && !automationResult.error && automationResult.success && automationResult.productFound;
      const errorMessage = automationResult?.error || automationResult?.errorMessage;
      const productFoundButFailed = automationResult?.productFound && !clickSuccess;  // 상품은 찾았지만 클릭 실패
      
      // 에러 타입 및 성공 여부 결정 - 차단(blocked)인 경우만 실패
      let errorType = automationResult?.errorType || null;
      let isBlocked = false;
      
      // 먼저 차단 여부 확인 (타임아웃이 아닌 경우에만)
      if (!isTimeout && errorMessage) {
        const lowerMessage = errorMessage.toLowerCase();
        
        if (lowerMessage.includes('err_http2_protocol_error') || 
            errorMessage.includes('쿠팡 접속 차단') ||
            lowerMessage.includes('captcha')) {
          errorType = 'blocked';
          isBlocked = true;
        }
      }
      
      // 최종 성공 여부 결정: 차단이 아니고 타임아웃 부분 성공이 아니면 실패
      const isSuccess = isTimeout ? (automationResult?.success || false) : !isBlocked;
      
      // referer 검증 - 추가 차단 상황 감지
      let actualPageNumber = 0;
      
      if (!isBlocked && automationResult?.referer) {
        const refererUrl = automationResult.referer;
        console.log(`   📍 [쓰레드 ${threadNumber}] Referer 검증: ${refererUrl}`);
        
        // work_type별로 다른 검증 로직 적용
        if (keywordData.work_type === 'product_info') {
          // 상품 상세 페이지 검증
          if (!refererUrl.includes('coupang.com/vp/products/') && !refererUrl.includes('coupang.com')) {
            console.log(`   ⚠️ [쓰레드 ${threadNumber}] 비정상 Referer - 쿠팡 상품 페이지가 아님`);
            errorType = 'blocked';
            isBlocked = true;
          } else {
            console.log(`   ✅ [쓰레드 ${threadNumber}] 정상 상품 페이지 접근`);
          }
        } else {
          // 기존 키워드 검색 검증 로직
          if (!refererUrl.includes('coupang.com/np/search')) {
            console.log(`   ⚠️ [쓰레드 ${threadNumber}] 비정상 Referer - 검색 페이지가 아님`);
            errorType = 'blocked';
            isBlocked = true;
          } else {
            // URL에서 page 파라미터 추출
            const pageMatch = refererUrl.match(/[&?]page=(\d+)/);
            actualPageNumber = pageMatch ? parseInt(pageMatch[1]) : 1;
            
            // 상품을 찾지 못했고 10페이지 미만에서 종료된 경우 차단 의심
            if (!productFound && actualPageNumber < 10 && actualPageNumber > 1) {
              // 2-9페이지에서 종료는 비정상
              console.log(`   ⚠️ [쓰레드 ${threadNumber}] 비정상 종료: ${actualPageNumber}페이지에서 중단됨 (10페이지 미도달)`);
              errorType = 'blocked';
              isBlocked = true;
            } else {
              console.log(`   ✅ [쓰레드 ${threadNumber}] 정상 검색: ${actualPageNumber}페이지까지 검색 완료`);
            }
          }
        }
      } else if (!isBlocked && !automationResult?.referer) {
        // work_type별로 다른 referer 검증
        if (keywordData.work_type === 'product_info') {
          // 상품 상세 페이지에서는 referer 없음을 덜 엄격하게 처리
          console.log(`   ⚠️ [쓰레드 ${threadNumber}] Referer 없음 - 상품 페이지 직접 접근 가능성`);
        } else {
          // 키워드 검색에서는 referer 없음을 비정상으로 처리
          console.log(`   ⚠️ [쓰레드 ${threadNumber}] Referer 없음 - 비정상 종료 의심`);
          errorType = 'blocked';
          isBlocked = true;
        }
      }
      
      // 최종 성공 여부 재결정 (referer 검증 후 및 타임아웃 부분 성공 고려)
      const finalSuccess = isTimeout ? (automationResult?.success || false) : !isBlocked;
      
      // 통계 업데이트 (referer 검증 후)
      if (finalSuccess) {
        this.stats.completed++;
        if (productFound && clickSuccess) {
          console.log(`✅ [쓰레드 ${threadNumber}] 작업 성공 완료 (상품 발견 및 클릭): ${executionTime}ms`);
        } else if (productFound) {
          console.log(`✅ [쓰레드 ${threadNumber}] 작업 성공 완료 (상품 발견했지만 클릭 실패): ${executionTime}ms`);
        } else {
          console.log(`✅ [쓰레드 ${threadNumber}] 작업 성공 완료 (상품 미발견, 순위 0): ${executionTime}ms`);
        }
      } else {
        // 실패 처리 (차단 또는 타임아웃)
        if (isTimeout && !finalSuccess) {
          // 타임아웃 실패
          this.stats.failed++;
          console.log(`⏱️ [쓰레드 ${threadNumber}] 타임아웃 실패: ${executionTime}ms`);
          console.log(`   ❌ rank 모드 조기 타임아웃 (${automationResult?.pagesSearched || 0}페이지만 완료)`);
        } else {
          // 차단된 경우
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
        }
      }
      
      // 간소화된 결과 반환 (work_type에 따라 다른 응답 구조)
      if (finalSuccess) {
        // 성공 시 - work_type에 따라 다른 응답 구조
        if (keywordData.work_type === 'product_info') {
          // 상품 정보 추출 작업 응답
          return {
            allocation_key: workAllocation.allocationKey,
            success: true,
            actual_ip: extractIpFromResult(automationResult),
            product_data: automationResult.productData || {}
          };
        } else {
          // 기존 키워드 검색 작업 응답
          const productData = this.collectProductData(automationResult);
          return {
            allocation_key: workAllocation.allocationKey,
            proxy_id: workAllocation.proxyId,
            success: true,
            actual_ip: extractIpFromResult(automationResult),
            rank_data: productData.rank_data,  // {page, listSize, rank} 객체 (상품 미발견시 rank=0)
            rating: productData.rating,
            review_count: productData.review_count
          };
        }
      } else {
        // 차단된 경우만 실패로 처리
        let finalErrorMessage = errorMessage;
        
        // 차단 메시지 생성
        if (errorMessage && errorMessage.includes('HTTP2_PROTOCOL_ERROR')) {
          finalErrorMessage = `쿠팡 차단 - HTTP2_PROTOCOL_ERROR`;
        } else if (actualPageNumber > 0 && actualPageNumber < 10) {
          finalErrorMessage = `쿠팡 차단 - ${actualPageNumber}페이지에서 중단됨`;
        } else if (!automationResult?.referer) {
          finalErrorMessage = `쿠팡 차단 - 초기 접속 차단`;
        } else {
          finalErrorMessage = finalErrorMessage || '쿠팡 차단 감지';
        }
        
        // 차단 실패 응답 (work_type에 따라 다른 응답 구조)
        if (keywordData.work_type === 'product_info') {
          // 상품 정보 추출 작업 실패 응답 - 단순화
          return {
            allocation_key: workAllocation.allocationKey,
            success: false,
            actual_ip: extractIpFromResult(automationResult),
            product_data: {}
          };
        } else {
          // 기존 키워드 검색 작업 실패 응답
          return {
            allocation_key: workAllocation.allocationKey,
            proxy_id: workAllocation.proxyId,
            success: false,
            actual_ip: extractIpFromResult(automationResult),
            error_type: 'blocked',
            error_message: finalErrorMessage
          };
        }
      }

    } catch (error) {
      const endTime = new Date();
      const executionTime = endTime.getTime() - startTime.getTime();
      
      console.error(`❌ [쓰레드 ${threadNumber}] 작업 실행 실패: ${error.message}`);
      this.stats.failed++;
      
      // work_type별 에러 응답
      if (keywordData.work_type === 'product_info') {
        // 상품 정보 추출 실패 - 단순한 응답
        return {
          allocation_key: workAllocation.allocationKey,
          success: false,
          actual_ip: null,
          product_data: {}
        };
      } else {
        // 기존 키워드 검색 에러 응답
        let errorType = 'unknown';
        if (error.message.includes('browser') || error.message.includes('Chrome')) {
          errorType = 'browser_error';
        } else if (error.message.includes('timeout')) {
          errorType = 'timeout';
        }
        
        return {
          allocation_key: workAllocation.allocationKey,
          proxy_id: workAllocation.proxyId,
          success: false,
          actual_ip: null,
          error_type: errorType,
          error_message: error.message
        };
      }
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
   * 상품 데이터 수집 (최적화된 구조 - rank_data 객체 사용, 상품 미발견시 rank=0, rating/review_count=null)
   * Updated: 2025-08-25
   */
  collectProductData(automationResult) {
    // 상품을 찾았는지 여부 확인
    const productFound = automationResult?.productFound;
    
    // referer에서 rank_data 추출 (상품을 찾지 못했으면 rank=0)
    const realRank = productFound ? automationResult.realRank : 0;
    const rankData = extractRankDataFromReferer(automationResult?.referer, realRank);

    // 축소된 product_data: 3개 필드만 반환
    const productData = {
      rank_data: rankData,  // {page, listSize, rank} 객체 (상품 미발견시 rank=0)
      rating: productFound ? (automationResult.productInfo?.rating ?? 0) : null,  // 상품 미발견시 null
      review_count: productFound ? (automationResult.productInfo?.reviewCount ?? 0) : null  // 상품 미발견시 null
    };

    return productData;
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
    hubBaseUrl: 'http://61.84.75.37:3302',  // 고정 허브 서버 (IP 직접 사용)
    basePath: options.basePath,
    pollInterval: 5000,  // 고정 5초 폴링
    // checkCookies 옵션 제거됨
    // monitor 옵션 제거됨
    once: options.once || false,
    keepBrowser: options.keepBrowser || false,
    workType: options.workType || null  // work_type 파라미터 전달
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