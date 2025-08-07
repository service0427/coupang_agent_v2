/**
 * 멀티 모드 실행 모듈 V2
 * - 동시 차단 감지 및 딜레이 조절 기능 추가
 */

const { executeKeywordSearch } = require('../core/search-executor');
const dbService = require('../services/db-service');
const dbServiceV2 = require('../services/db-service-v2');
const { calculateWindowPosition } = require('../utils/window-position');
const proxyToggleService = require('../services/proxy-toggle-service');
const browserManager = require('../services/browser-manager');
const concurrentBlockDetector = require('../services/concurrent-block-detector');
// IntegratedTrafficManager는 optimizer_db.js에 통합됨
const os = require('os');

/**
 * 차단 관련 에러인지 확인
 */
function isBlockedError(errorMessage) {
  if (!errorMessage) return false;
  
  const blockIndicators = [
    'ERR_HTTP2_PROTOCOL_ERROR',
    'ERR_HTTP2_PROTOCCOL_ERROR', // 오타 버전도 포함
    'net::ERR_HTTP2_PROTOCOL_ERROR',
    'net::ERR_HTTP2_PROTOCCOL_ERROR', // 오타 버전도 포함
    '쿠팡 접속 차단',
    'HTTP/2 프로토콜 오류',
    'access denied',
    'blocked',
    '차단',
    'forbidden'
  ];
  
  return blockIndicators.some(indicator => errorMessage.includes(indicator));
}

/**
 * 멀티 모드에서 단일 작업 실행
 */
async function runSingleTask(keyword, options, instanceIndex) {
  let browser;
  let trafficManager;
  const startTime = Date.now();
  const taskResult = {
    keywordId: keyword.id,
    keyword: keyword.keyword,
    success: false,
    errorMessage: null,
    duration: 0,
    cartClicked: false
  };
  
  try {
    console.log(`\n🔄 [ID:${keyword.id}] 작업 시작 - "${keyword.keyword}"`);
    
    // 프록시 설정
    let proxyConfig = null;
    if (keyword.proxy_server) {
      proxyConfig = { server: keyword.proxy_server };
      console.log(`   [ID:${keyword.id}] 프록시: ${keyword.proxy_server}`);
    }
    
    // 창 위치 계산
    const windowPosition = calculateWindowPosition(instanceIndex);
    
    // 인스턴스별 프로필 설정
    const profileName = `instance_${instanceIndex}`;
    
    // 브라우저 실행 (브라우저 관리 서비스 사용)
    console.log(`   [ID:${keyword.id}] 브라우저 실행 중...`);
    const { browser: chromeBrowser, page, networkMonitor } = await browserManager.getBrowser({
      proxyConfig,
      usePersistent: true,   // 수정: 영구 프로필로 캐시 최대 활용
      profileName,
      clearSession: false,   // 수정: 세션 유지로 캐시 효과 극대화
      clearCache: false,     // 유지: 캐시 보존
      headless: false,
      gpuDisabled: keyword.gpu_disabled === true,
      windowPosition
      // trafficMonitor 옵션 제거 - 브라우저 매니저에서 항상 true로 설정됨
    });
    browser = chromeBrowser;
    
    // 트래픽 모니터링은 optimizer_db.js에서 통합 처리
    trafficManager = null;
    
    // 브라우저 크기 정보 로깅
    const viewport = page.viewportSize();
    console.log(`   [ID:${keyword.id}] 🖥️ 브라우저 크기: ${viewport.width}x${viewport.height}`);
    
    // 검색 실행 (공통 모듈 사용) - TrafficManager를 옵션으로 전달
    const result = await executeKeywordSearch(page, keyword, { ...options, trafficManager }, networkMonitor);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    taskResult.duration = duration;
    taskResult.success = result.success;
    taskResult.errorMessage = result.errorMessage;
    taskResult.cartClicked = result.cartClicked;
    
    // 차단 에러 감지 및 기록
    if (!result.success && result.errorMessage) {
      const blockInfo = await concurrentBlockDetector.recordBlock(
        keyword.agent || options.agent, 
        result.errorMessage, 
        keyword
      );
      
      // 동시 차단 감지 시 정보 저장
      taskResult.blockInfo = blockInfo;
    }
    
    if (result.success) {
      const trafficInfo = result.totalTrafficMb > 0 ? ` | 📊 ${result.totalTrafficMb.toFixed(2)}MB` : '';
      console.log(`✅ [ID:${keyword.id}] 작업 완료 - ${duration}초${trafficInfo}`);
      if (result.cartClicked) {
        console.log(`   [ID:${keyword.id}] 🛒 장바구니 클릭 완료`);
      }
    } else {
      const trafficInfo = result.totalTrafficMb > 0 ? ` | 📊 ${result.totalTrafficMb.toFixed(2)}MB` : '';
      console.log(`❌ [ID:${keyword.id}] 작업 실패 - ${duration}초${trafficInfo} - ${result.errorMessage}`);
      
      // 차단 정보 로그 출력
      if (taskResult.blockInfo && taskResult.blockInfo.isConcurrentBlock) {
        console.log(`   ⚠️  동시 차단 감지: ${taskResult.blockInfo.blockedAgents}개 에이전트 영향`);
      }
    }
    
    // 개별 대기 없이 바로 브라우저 종료
    
  } catch (error) {
    console.error(`❌ [ID:${keyword.id}] 오류:`, error.message);
    taskResult.errorMessage = error.message;
    taskResult.duration = Math.round((Date.now() - startTime) / 1000);
  } finally {
    // IntegratedTrafficManager 정리
    if (trafficManager) {
      try {
        await trafficManager.cleanup();
      } catch (e) {
        console.error(`⚠️ [ID:${keyword.id}] TrafficManager 정리 실패:`, e.message);
      }
    }
    
    // 브라우저는 여기서 닫지 않고 taskResult에 포함시켜 반환
    taskResult.browser = browser;
  }
  
  return taskResult;
}

/**
 * 에이전트 모드 실행 (해당 agent의 모든 키워드 실행)
 */
async function runMultiMode(options) {
  console.log(`📋 실행 설정:`);
  console.log(`   에이전트: ${options.agent}`);
  console.log(`   쿠키 체크: ${options.checkCookies ? '활성' : '비활성'}`);
  console.log(`   실행 모드: ${options.once ? '1회 실행' : '계속 실행'}`);
  console.log(`   CPU 코어: ${os.cpus().length}개`);
  console.log('');
  
  let roundCount = 0;
  
  try {
    while (!options.once || roundCount < 1) {
      roundCount++;
      
      console.log(`\n🔄 라운드 ${roundCount} 시작`);
      console.log('─'.repeat(50));
      
      // agent의 모든 키워드 조회 (V2 테이블 사용)
      const keywords = await dbServiceV2.getKeywordsV2({ agent: options.agent });
      
      if (keywords.length === 0) {
        console.log('📋 실행 가능한 키워드가 없습니다.');
        console.log('🚪 프로그램을 종료합니다.');
        break;
      }
      
      console.log(`📋 ${keywords.length}개 키워드 실행 예정\n`);
      
      // 프록시를 사용하는 키워드가 있고 --no-ip-change 옵션이 없으면 IP 변경
      const proxyKeywords = keywords.filter(k => k.proxy_server);
      if (proxyKeywords.length > 0 && !options.noIpChange) {
        console.log('🔄 프록시 사용 키워드가 있어 IP를 변경합니다.');
        
        // 고유한 프록시 서버 목록 추출
        const uniqueProxies = [...new Set(proxyKeywords.map(k => k.proxy_server))];
        console.log(`   프록시 서버 ${uniqueProxies.length}개 발견`);
        
        // 각 프록시의 IP 변경 시도
        for (const proxy of uniqueProxies) {
          const result = await proxyToggleService.toggleIp(proxy);
          if (result.success) {
            console.log(`   ✅ ${result.message}`);
          } else {
            console.log(`   ❌ ${proxy} - ${result.error}`);
          }
        }
        
        console.log('   ⏳ IP 변경 적용을 위해 5초 대기...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else if (proxyKeywords.length > 0 && options.noIpChange) {
        console.log('⚠️  프록시 사용 키워드가 있지만 --no-ip-change 옵션으로 IP 변경을 건너뜁니다.\n');
      }
      
      // 동시 실행 (인스턴스 번호 포함)
      let lastBrowser = null;
      const shouldWaitForEnter = options.waitForEnter && keywords.length === 1;
      
      const tasks = keywords.map((keyword, index) => 
        runSingleTask(keyword, options, index).then(result => {
          // 마지막 브라우저 저장 (Enter 대기용)
          if (shouldWaitForEnter && result.browser) {
            lastBrowser = result.browser;
          } else if (result.browser && result.browser.isConnected()) {
            // 다른 경우는 브라우저 닫기
            result.browser.close().catch(() => {});
          }
          return result;
        })
      );
      const results = await Promise.all(tasks);
      
      // 실행 결과 요약
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📊 라운드 ${roundCount} 실행 결과 요약`);
      console.log(`${'═'.repeat(60)}`);
      
      let successCount = 0;
      let failCount = 0;
      let blockedCount = 0;
      let hasConcurrentBlocks = false;
      
      results.forEach(result => {
        const status = result.success ? '✅ 성공' : 
                      isBlockedError(result.errorMessage) ? '🚫 차단' : '❌ 실패';
        
        if (result.success) successCount++;
        else if (isBlockedError(result.errorMessage)) blockedCount++;
        else failCount++;
        
        // 동시 차단 체크
        if (result.blockInfo && result.blockInfo.isConcurrentBlock) {
          hasConcurrentBlocks = true;
        }
        
        // V2에서는 search 모드가 동적이므로 고정 표시
        const searchIndicator = '| 🔗→🔍'; // goto에서 search로 동적 전환
        
        console.log(`ID:${result.keywordId.toString().padEnd(4)} | ${status} | ${result.duration}초 | ${result.keyword} ${searchIndicator} ${result.cartClicked ? '| 🛒' : ''} ${!result.success ? `| ${result.errorMessage}` : ''}`);
      });
      
      console.log(`${'─'.repeat(60)}`);
      console.log(`총 ${results.length}개 작업: ✅ 성공 ${successCount}개, ❌ 실패 ${failCount}개, 🚫 차단 ${blockedCount}개`);
      
      // 동시 차단 정보 표시
      if (hasConcurrentBlocks) {
        const blockStatus = concurrentBlockDetector.getBlockStatus();
        console.log(`⚠️  동시 차단 감지! 다음 라운드 딜레이: ${blockStatus.currentDelay/1000}초`);
        console.log(`   영향받은 에이전트: ${blockStatus.affectedAgents.join(', ')}`);
      }
      
      console.log(`${'═'.repeat(60)}`);
      
      console.log(`\n✅ 라운드 ${roundCount} 완료`);
      
      if (options.once) {
        // --enter 옵션이 있고 키워드가 1개만 있을 경우 Enter 대기
        if (options.waitForEnter && keywords.length === 1 && lastBrowser && lastBrowser.isConnected()) {
          console.log('\n⏸️  브라우저를 닫으려면 Enter를 누르세요...');
          
          await new Promise(resolve => {
            process.stdin.once('data', resolve);
            
            // 브라우저가 먼저 닫히면 종료
            lastBrowser.on('disconnected', () => {
              console.log('\n👋 브라우저가 닫혔습니다.');
              resolve();
            });
          });
          
          // Enter 눌린 후 브라우저 닫기
          if (lastBrowser.isConnected()) {
            await lastBrowser.close();
          }
        }
        break;
      }
      
      // 다음 라운드까지 대기 메시지 먼저 표시 (브라우저 정리 전)
      const recommendedDelay = concurrentBlockDetector.getCurrentRecommendedDelay();
      console.log(`\n⏳ 다음 라운드까지 ${recommendedDelay/1000}초 대기...`);
      
      if (recommendedDelay > 5000) {
        console.log(`   🐌 동시 차단으로 인해 딜레이 증가`);
      }
      
      // 실제 대기 시작
      await new Promise(resolve => setTimeout(resolve, recommendedDelay));
    }
    
  } catch (error) {
    console.error('\n❌ 치명적 오류:', error.message);
  }
}

module.exports = {
  runMultiMode
};