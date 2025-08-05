/**
 * 멀티 모드 실행 모듈
 */

const { executeKeywordSearch } = require('../core/search-executor');
const dbService = require('../services/db-service');
const { calculateWindowPosition } = require('../utils/window-position');
const proxyToggleService = require('../services/proxy-toggle-service');
const browserManager = require('../services/browser-manager');
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
  const startTime = Date.now();
  const taskResult = {
    keywordId: keyword.id,
    keyword: keyword.keyword,
    suffix: keyword.suffix,
    success: false,
    errorMessage: null,
    duration: 0,
    cartClicked: false
  };
  
  try {
    console.log(`\n🔄 [ID:${keyword.id}] 작업 시작 - "${keyword.keyword}" ${keyword.suffix || ''}`);
    
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
    
    // 세션 초기화 옵션 설정
    const clearSession = keyword.clear_session === true;
    const clearCache = keyword.clear_cache === true;
    
    // 브라우저 실행 (브라우저 관리 서비스 사용)
    console.log(`   [ID:${keyword.id}] 브라우저 실행 중...`);
    const { browser: chromeBrowser, page, networkMonitor } = await browserManager.getBrowser({
      proxyConfig,
      usePersistent: keyword.use_persistent !== false,
      profileName,
      clearSession,
      clearCache,
      headless: false,
      gpuDisabled: keyword.gpu_disabled === true,
      windowPosition,
      trafficMonitor: options.trafficMonitor
    });
    browser = chromeBrowser;
    
    // 브라우저 크기 정보 로깅
    const viewport = page.viewportSize();
    console.log(`   [ID:${keyword.id}] 🖥️ 브라우저 크기: ${viewport.width}x${viewport.height}`);
    
    // 검색 실행 (공통 모듈 사용)
    const result = await executeKeywordSearch(page, keyword, options, networkMonitor);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    taskResult.duration = duration;
    taskResult.success = result.success;
    taskResult.errorMessage = result.errorMessage;
    taskResult.cartClicked = result.cartClicked;
    
    if (result.success) {
      console.log(`✅ [ID:${keyword.id}] 작업 완료 - ${duration}초`);
      if (result.cartClicked) {
        console.log(`   [ID:${keyword.id}] 🛒 장바구니 클릭 완료`);
      }
    } else {
      console.log(`❌ [ID:${keyword.id}] 작업 실패 - ${duration}초 - ${result.errorMessage}`);
    }
    
    // 개별 대기 없이 바로 브라우저 종료
    
  } catch (error) {
    console.error(`❌ [ID:${keyword.id}] 오류:`, error.message);
    taskResult.errorMessage = error.message;
    taskResult.duration = Math.round((Date.now() - startTime) / 1000);
  } finally {
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
      
      // agent의 모든 키워드 조회
      const keywords = await dbService.getKeywords(options.agent);
      
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
      
      results.forEach(result => {
        const status = result.success ? '✅ 성공' : 
                      isBlockedError(result.errorMessage) ? '🚫 차단' : '❌ 실패';
        
        if (result.success) successCount++;
        else if (isBlockedError(result.errorMessage)) blockedCount++;
        else failCount++;
        
        // search 정보를 result에서 가져오기 위해 keywords 배열에서 찾기
        const keyword = keywords.find(k => k.id === result.keywordId);
        const searchIndicator = keyword && keyword.search ? '| 🔍' : '| 🔗';
        
        console.log(`ID:${result.keywordId.toString().padEnd(4)} | ${status} | ${result.duration}초 | ${result.keyword} ${result.suffix || ''} ${searchIndicator} ${result.cartClicked ? '| 🛒' : ''} ${!result.success ? `| ${result.errorMessage}` : ''}`);
      });
      
      console.log(`${'─'.repeat(60)}`);
      console.log(`총 ${results.length}개 작업: ✅ 성공 ${successCount}개, ❌ 실패 ${failCount}개, 🚫 차단 ${blockedCount}개`);
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
      
      // 다음 라운드까지 대기 (봇 탐지 방지)
      console.log(`\n⏳ 다음 라운드까지 5초 대기...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
  } catch (error) {
    console.error('\n❌ 치명적 오류:', error.message);
  }
}

module.exports = {
  runMultiMode
};