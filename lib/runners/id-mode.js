/**
 * ID 기반 실행 모듈
 */

const { launchChrome } = require('../core/chrome-launcher');
const { searchAndClickProduct } = require('../handlers/coupang-handler');
const dbService = require('../services/db-service');
const proxyToggleService = require('../services/proxy-toggle-service');

/**
 * ID 모드 실행
 */
async function runIdMode(id, options) {
  let browser;
  let exitCode = 0;

  try {
    console.log(`🚀 쿠팡 Chrome 자동화 시작 (ID 모드: ${id})\n`);

    // ID로 키워드 조회
    const keywordData = await dbService.getKeywordById(id);
    
    if (!keywordData) {
      console.log(`❌ ID ${id}에 해당하는 키워드가 없습니다.`);
      exitCode = 1;
      return exitCode;
    }

    // 에이전트 확인
    if (keywordData.agent !== options.agent) {
      console.log(`⚠️ 경고: 키워드의 에이전트(${keywordData.agent})가 현재 에이전트(${options.agent})와 다릅니다.`);
    }

    console.log(`📋 키워드 정보:`);
    console.log(`   ID: ${keywordData.id}`);
    console.log(`   키워드: "${keywordData.keyword}" ${keywordData.suffix ? `+ "${keywordData.suffix}"` : ''}`);
    console.log(`   상품코드: ${keywordData.product_code}`);
    console.log(`   에이전트: ${keywordData.agent}`);

    // 프록시 설정
    let proxyConfig = null;
    if (keywordData.proxy_server) {
      proxyConfig = { server: keywordData.proxy_server };
      console.log(`   프록시: ${keywordData.proxy_server}`);
      
      // IP 변경 (--no-ip-change 옵션이 없을 때만)
      if (!options.noIpChange) {
        console.log(`🔄 프록시 IP 변경 시도...`);
        const toggleResult = await proxyToggleService.toggleIp(keywordData.proxy_server);
        if (toggleResult.success) {
          console.log(`   ✅ ${toggleResult.message}`);
          console.log(`   ⏳ IP 변경 적용을 위해 5초 대기...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.log(`   ❌ IP 변경 실패: ${toggleResult.error}`);
        }
      } else {
        console.log(`   ⚠️ --no-ip-change 옵션으로 IP 변경을 건너뜁니다.`);
      }
    }

    // 브라우저 설정
    const persistent = keywordData.use_persistent !== false;
    const profileName = keywordData.profile_name || 'chrome';
    const clearSession = keywordData.clear_session === true;
    const gpuDisabled = keywordData.gpu_disabled === true;

    console.log(`   프로필: ${profileName} (${persistent ? '영구' : '일시'})`);
    console.log('');

    // 브라우저 실행
    const { browser: chromeBrowser, page, context } = await launchChrome(
      proxyConfig,
      persistent,
      profileName,
      clearSession,
      false, // tracker 비활성화
      gpuDisabled
    );
    browser = chromeBrowser;

    // 브라우저 크기 정보 로깅
    const viewport = page.viewportSize();
    console.log(`🖥️ 브라우저 크기: ${viewport.width}x${viewport.height}\n`);

    // 검색 및 클릭 실행
    const result = await searchAndClickProduct(page, {
      keyword: keywordData.keyword,
      suffix: keywordData.suffix,
      productCode: keywordData.product_code,
      cartClickEnabled: keywordData.cart_click_enabled === true,
      proxyConfig,
      searchMode: options.search,
      optimizationLevel: options.optimize ? 'balanced' : false,
      keywordId: keywordData.id,
      agent: keywordData.agent,
      checkCookies: options.checkCookies,
      profileName: profileName
    });

    // DB에 결과 저장
    await dbService.updateKeywordExecution(keywordData.id, result.success);
    
    await dbService.logExecution({
      keywordId: keywordData.id,
      agent: keywordData.agent,
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
      actualIp: null,
      finalUrl: page.url(),
      searchQuery: keywordData.suffix ? `${keywordData.keyword} ${keywordData.suffix}` : keywordData.keyword
    });

    if (result.success) {
      console.log('\n✅ 작업 완료!');
      if (result.cartClickCount > 0) {
        console.log(`🛒 장바구니 클릭 횟수: ${result.cartClickCount}회`);
      }
    } else {
      console.log('\n❌ 작업 실패');
      exitCode = 1;
    }

    // 작업 완료 후 대기
    console.log('\n⏸️  브라우저를 닫으려면 Enter를 누르세요...');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
      
      // 브라우저가 먼저 닫히면 종료
      if (browser) {
        browser.on('disconnected', () => {
          console.log('\n👋 브라우저가 닫혔습니다.');
          resolve();
        });
      }
    });

  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    exitCode = 1;
  } finally {
    // 브라우저 종료
    if (browser && browser.isConnected()) {
      await browser.close();
    }
  }

  return exitCode;
}

module.exports = {
  runIdMode
};