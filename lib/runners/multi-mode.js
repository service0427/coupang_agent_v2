/**
 * 멀티 모드 실행 모듈
 */

const { launchChrome } = require('../core/chrome-launcher');
const { searchAndClickProduct } = require('../handlers/coupang-handler');
const dbService = require('../services/db-service');
const { calculateWindowPosition } = require('../utils/window-position');
const proxyToggleService = require('../services/proxy-toggle-service');
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
    
    // 프로필 이름 설정 (null이면 자동 인스턴스 번호 사용)
    const profileName = keyword.profile_name || `instance_${instanceIndex}`;
    
    // 브라우저 실행
    console.log(`   [ID:${keyword.id}] 브라우저 실행 중...`);
    const { browser: chromeBrowser, page } = await launchChrome(
      proxyConfig,
      keyword.use_persistent !== false,
      profileName,
      keyword.clear_session === true,
      false,
      keyword.gpu_disabled === true,
      windowPosition
    );
    browser = chromeBrowser;
    
    // 브라우저 크기 정보 로깅
    const viewport = page.viewportSize();
    console.log(`   [ID:${keyword.id}] 🖥️ 브라우저 크기: ${viewport.width}x${viewport.height}`);
    
    // 검색 및 클릭 실행
    const result = await searchAndClickProduct(page, {
      keyword: keyword.keyword,
      suffix: keyword.suffix,
      productCode: keyword.product_code,
      cartClickEnabled: keyword.cart_click_enabled === true,
      proxyConfig,
      searchMode: options.search,
      optimizationLevel: options.optimize ? 'balanced' : false,
      keywordId: keyword.id,
      agent: options.agent,
      checkCookies: options.checkCookies,
      profileName: profileName
    });
    
    // DB 업데이트
    await dbService.updateKeywordExecution(keyword.id, result.success);
    
    await dbService.logExecution({
      keywordId: keyword.id,
      agent: options.agent,
      success: result.success,
      productFound: result.productFound,
      productRank: result.productRank,
      urlRank: result.urlRank,
      pagesSearched: result.pagesSearched,
      cartClicked: result.cartClicked,
      cartClickCount: result.cartClickCount || 0,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
      proxyUsed: proxyConfig?.server,
      actualIp: result.actualIp,
      finalUrl: page.url(),
      searchQuery: keyword.suffix ? `${keyword.keyword} ${keyword.suffix}` : keyword.keyword
    });
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    taskResult.duration = duration;
    taskResult.success = result.success;
    taskResult.errorMessage = result.errorMessage;
    taskResult.cartClicked = result.cartClicked;
    
    if (result.success) {
      console.log(`✅ [ID:${keyword.id}] 작업 완료 - ${duration}초`);
      if (result.cartClickCount > 0) {
        console.log(`   [ID:${keyword.id}] 🛒 장바구니 클릭: ${result.cartClickCount}회`);
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
    if (browser && browser.isConnected()) {
      await browser.close();
    }
  }
  
  return taskResult;
}

/**
 * 에이전트 모드 실행 (해당 agent의 모든 키워드 실행)
 */
async function runMultiMode(options) {
  console.log(`📋 실행 설정:`);
  console.log(`   에이전트: ${options.agent}`);
  console.log(`   최적화: ${options.optimize ? '활성' : '비활성'}`);
  console.log(`   쿠키 체크: ${options.checkCookies ? '활성' : '비활성'}`);
  console.log(`   실행 모드: ${options.once ? '1회' : `최대 ${options.maxRounds}라운드`}`);
  console.log(`   CPU 코어: ${os.cpus().length}개`);
  console.log('');
  
  let roundCount = 0;
  
  try {
    while (roundCount < options.maxRounds || !options.once) {
      roundCount++;
      
      console.log(`\n🔄 라운드 ${roundCount} 시작`);
      console.log('─'.repeat(50));
      
      // 동일 agent의 모든 키워드 조회 (limit 없이)
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
      const tasks = keywords.map((keyword, index) => runSingleTask(keyword, options, index));
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
        
        console.log(`ID:${result.keywordId.toString().padEnd(4)} | ${status} | ${result.duration}초 | ${result.keyword} ${result.suffix || ''} ${result.cartClicked ? '| 🛒' : ''} ${!result.success ? `| ${result.errorMessage}` : ''}`);
      });
      
      console.log(`${'─'.repeat(60)}`);
      console.log(`총 ${results.length}개 작업: ✅ 성공 ${successCount}개, ❌ 실패 ${failCount}개, 🚫 차단 ${blockedCount}개`);
      console.log(`${'═'.repeat(60)}`);
      
      console.log(`\n✅ 라운드 ${roundCount} 완료`);
      
      // 모든 작업 완료 후 5초 대기 (봇 탐지 방지)
      console.log(`\n⏳ 5초 후 다음 라운드 진행...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (options.once) {
        break;
      }
      
      // 다음 라운드까지 짧은 대기 (5초)
      console.log(`⏳ 다음 라운드까지 5초 대기...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
  } catch (error) {
    console.error('\n❌ 치명적 오류:', error.message);
  }
}

module.exports = {
  runMultiMode
};