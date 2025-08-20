#!/usr/bin/env node

const path = require('path');
const browserManager = require('./lib/services/browser-manager');
const { calculateWindowPosition } = require('./lib/utils/window-position');
const dbService = require('./lib/db/sample-service');

// 간단한 로거 (인스턴스 ID 지원)
const logger = {
  log: (prefix, message, instanceId = null) => {
    const instancePrefix = instanceId ? `[인스턴스 ${instanceId}] ` : '';
    console.log(`[${prefix}] ${instancePrefix}${message}`);
  }
};

async function runSample(instanceId = 1) {
  // 인스턴스별 로거
  const log = (message) => logger.log('샘플', message, instanceId);
  
  log('🚀 샘플 테스트 시작 (원본과 동일한 방식)');
  
  // DB 초기화 (첫 번째 인스턴스만)
  if (instanceId === 1) {
    await dbService.createSampleLogTable();
  }
  
  // 프록시 선택 (각 인스턴스마다 랜덤)
  const proxy = await dbService.getAvailableProxy();
  let proxyConfig = null;
  
  if (proxy) {
    proxyConfig = {
      server: proxy.server
    };
    if (proxy.username && proxy.password) {
      proxyConfig.username = proxy.username;
      proxyConfig.password = proxy.password;
    }
    log(`🔐 프록시 사용: ${proxy.server}`);
  } else {
    log('🌐 프록시 없이 진행');
  }
  
  // 실행 시작 로그
  const keyword = '헤파필터';
  const logId = await dbService.logSampleStart(proxy?.id || null, keyword);
  const startTime = Date.now();
  
  let actualIp = null;
  let productId = null;
  let productName = null;
  let cartAdded = false;
  let success = false;
  let errorMessage = null;
  let browser = null;
  let page = null;
  
  try {
    // 원본과 동일한 방식: browserManager 사용
    const folderNumber = instanceId.toString().padStart(2, '0');  // 인스턴스별 폴더 (01, 02, 03, 04)
    const userFolderPath = path.join(__dirname, 'browser-data', folderNumber);
    const windowPosition = calculateWindowPosition(instanceId - 1);  // 인스턴스별 위치
    
    log(`📁 유저폴더 경로: ${userFolderPath}`);
    log('🚀 브라우저 실행 중... (원본과 동일한 browserManager 사용)');
    
    // 원본과 완전히 동일한 옵션
    const browserInfo = await browserManager.getBrowser({
      proxyConfig,
      usePersistent: true,
      profileName: folderNumber,
      userDataDir: userFolderPath,
      clearSession: true,  // 항상 세션 정리
      headless: false,     // GUI 모드
      windowPosition: windowPosition,
      trafficMonitor: false
    });
    
    browser = browserInfo.browser;
    page = browserInfo.page;
    
    log('✅ 브라우저 실행 완료');
    
    // WebDriver 상태 확인
    const webdriverStatus = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      pluginsLength: navigator.plugins ? navigator.plugins.length : 0
    }));
    log(`🤖 WebDriver: ${webdriverStatus.webdriver === undefined ? '숨김' : '노출'}`);
    log(`🔌 Plugins: ${webdriverStatus.pluginsLength}개`);
    
    // 리소스 차단 설정 - 원본의 applyStaticOptimization 사용
    const { applyStaticOptimization } = require('./lib/core/optimizer');
    
    // 원본과 동일한 keywordData 구성 (최적화 활성화)
    const keywordDataForOptimizer = {
      id: null,
      keyword: '헤파필터',
      optimize: true,  // 최적화 활성화
      coupang_main_allow: '["document"]',  // 기본값
      mercury_allow: null,
      image_cdn_allow: null,
      img1a_cdn_allow: null,
      thumbnail_cdn_allow: null,
      static_cdn_allow: null
    };
    
    // 원본과 동일한 옵션
    const optimizerOptions = {
      monitor: false,  // 모니터링 비활성화
      agent: 'sample'
    };
    
    // 최적화 적용 (원본과 동일)
    const disableOptimization = await applyStaticOptimization(
      page, 
      'sample',  // agent
      keywordDataForOptimizer,  // keywordData
      optimizerOptions  // options
    );
    
    log('✅ 리소스 차단 설정 완료 (원본 optimizer 사용)');
    
    // IP 확인
    try {
      await page.goto('https://mkt.techb.kr/ip', { timeout: 10000 });
      const ipData = await page.locator('body').textContent();
      const ipJson = JSON.parse(ipData);
      actualIp = ipJson.ip;
      log( `🌍 현재 IP: ${actualIp}`);
    } catch (err) {
      log('⚠️ IP 확인 실패');
    }
    
    // 쿠팡 검색 페이지 접속 - 원본의 executeDirectMode 사용
    const { executeDirectMode } = require('./lib/handlers/search-mode-handler');
    const searchQuery = '헤파필터';
    
    log( `🔍 검색어: "${searchQuery}"`);
    
    // 원본과 완전히 동일한 executeDirectMode 호출
    const directOptions = {
      keywordId: null,
      agent: 'sample',
      threadPrefix: '[샘플] '
    };
    
    const directResult = await executeDirectMode(page, searchQuery, directOptions);
    
    if (!directResult.success) {
      log( `❌ 페이지 접근 실패: ${directResult.errorMessage}`);
      errorMessage = directResult.errorMessage;
      throw new Error(directResult.errorMessage);
    }
    
    log('✅ 검색 결과 페이지 도달');
    
    // 원본과 동일한 처리
    await page.waitForTimeout(3000);
    
    // 프록시 리다이렉트 체크 (원본과 동일)
    const currentUrl = page.url();
    if (currentUrl.includes('192.168.') || currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      log( `⚠️ 프록시 리다이렉트 감지: ${currentUrl}`);
      log('❌ 네트워크 연결 문제로 검색 중단');
      errorMessage = '프록시 리다이렉트 발생 - 네트워크 연결 문제';
      throw new Error(errorMessage);
    }
    
    log( `🔗 현재 URL: ${currentUrl}`);
    
    // 검색 결과 대기
    await page.waitForSelector('#product-list', { timeout: 5000 }).catch(() => {
      log('⚠️ 검색 결과 대기 시간 초과');
    });
    
    // 상품 목록 추출 (광고 제외)
    const products = await page.$$eval('#product-list > li[data-id]', (items) => {
      function isAd(li) {
        if (li.querySelector('[data-adsplatform]')) return true;
        if (li.querySelector('[class^="AdMark_"]')) return true;
        
        const a = li.querySelector('a[href]');
        if (a) {
          const href = a.getAttribute('href') || '';
          if (href.includes('sourceType=srp_product_ads')) return true;
          if (href.includes('korePlacement=')) return true;
          if (!href.includes('&rank=') && !href.includes('?rank=')) return true;
        }
        return false;
      }
      
      let realRankCounter = 0;
      return items.map((item, index) => {
        const link = item.querySelector('a[href]');
        if (!link) return null;
        
        const href = link.getAttribute('href') || '';
        const productId = item.dataset.id || null;
        const adStatus = isAd(item);
        
        if (!adStatus) realRankCounter++;
        
        const nameElement = item.querySelector('[class*="productName"], [class^="ProductUnit_productName"], .name');
        const productName = nameElement ? nameElement.textContent.trim() : '';
        
        return {
          rank: index + 1,
          realRank: adStatus ? null : realRankCounter,
          isAd: adStatus,
          link: href,
          productId: productId,
          productName: productName
        };
      }).filter(product => product !== null);
    });
    
    log( `📦 검색된 상품 수: ${products.length}개`);
    
    // 광고 제외한 상품들
    const nonAdProducts = products.filter(p => !p.isAd);
    
    if (nonAdProducts.length > 0) {
      // 랜덤하게 상품 선택
      const randomIndex = Math.floor(Math.random() * nonAdProducts.length);
      const selectedProduct = nonAdProducts[randomIndex];
      
      productId = selectedProduct.productId;
      productName = selectedProduct.productName;
      
      log( `🎯 광고 제외 상품 중 랜덤 선택 (${randomIndex + 1}/${nonAdProducts.length})`);
      log( `   상품명: ${productName}`);
      log( `   상품 ID: ${productId}`);
      
      // 상품 클릭
      const productSelector = selectedProduct.productId 
        ? `#product-list > li[data-id="${selectedProduct.productId}"] a[href]`
        : `a[href*="${selectedProduct.link}"]`;
      const productLink = await page.$(productSelector);
      
      if (productLink) {
        // href 바꿔치기
        const originalHref = await productLink.evaluate(el => el.href);
        log( `   원본 링크: ${originalHref}`);
        
        const targetProductId = '8575068479';
        const targetItemId = '24848153621';
        const targetVendorItemId = '91855260496';
        
        await productLink.evaluate((el, params) => {
          if (el.tagName === 'A') {
            let newHref = el.href;
            newHref = newHref.replace(/\/products\/\d+/, `/products/${params.productId}`);
            if (newHref.includes('itemId=')) {
              newHref = newHref.replace(/itemId=\d+/, `itemId=${params.itemId}`);
            }
            if (newHref.includes('vendorItemId=')) {
              newHref = newHref.replace(/vendorItemId=\d+/, `vendorItemId=${params.vendorItemId}`);
            }
            el.href = newHref;
            el.setAttribute('target', '_self');
          }
        }, { productId: targetProductId, itemId: targetItemId, vendorItemId: targetVendorItemId });
        
        const modifiedHref = await productLink.evaluate(el => el.href);
        log( `   🔄 변경 링크: ${modifiedHref}`);
        
        log('🖱️ 상품 클릭 중...');
        
        // 클릭 전 URL 저장
        const beforeUrl = page.url();
        
        // 스크롤 및 클릭 (원본처럼 간단하게)
        await productLink.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        
        let clickedSuccessfully = false;
        try {
          await productLink.hover();
          await page.waitForTimeout(200);
          await productLink.click();
          
          // URL 변경 확인만 (원본과 동일)
          await page.waitForFunction(
            (oldUrl) => window.location.href !== oldUrl,
            beforeUrl,
            { timeout: 10000 }
          );
          log('   ✅ 클릭 후 네비게이션 성공');
          clickedSuccessfully = true;
        } catch (navError) {
          log('   ⚠️ 클릭 후 네비게이션 타임아웃');
        }
        
        if (clickedSuccessfully) {
          // 클릭 성공 시 2초만 대기 (원본과 동일)
          await page.waitForTimeout(2000);
        } else {
          // 실패 시 JavaScript 클릭 시도
          log('   ⚠️ JavaScript로 클릭 재시도');
          await productLink.evaluate(el => el.click());
          await page.waitForTimeout(2000);
        }
        
        try{
          // 상품 페이지 도달 확인
          const currentUrl = page.url();
          const isProductPage = currentUrl.includes('/vp/products/') || currentUrl.includes('/vm/products/');
          
          if (isProductPage) {
            log('✅ 상품 페이지 도달');
            success = true;
              
            // 장바구니 담기
            const cartButton = await page.$('button.prod-cart-btn');
            if (cartButton) {
              await cartButton.click();
              await page.waitForTimeout(3000);
              cartAdded = true;
              log('✅ 장바구니 담기 완료');
            }
          }
        } catch (navError) {
          log('⚠️ 페이지 이동 타임아웃');
        }
      }
    } else {
      log('⚠️ 광고가 아닌 상품을 찾을 수 없음');
      errorMessage = '광고가 아닌 상품을 찾을 수 없음';
    }
    
    // 3초 대기
    log('⏱️ 3초 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 최적화 해제 및 통계 수집
    if (disableOptimization) {
      const optimizationResult = await disableOptimization();
      log( `📊 리소스 차단 통계: 차단 ${optimizationResult.blockedCount}개, 허용 ${optimizationResult.allowedCount}개`);
    }
    
  } catch (error) {
    errorMessage = error.message;
    log( `❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    // 브라우저 종료
    if (browser && browser.isConnected()) {
      try {
        await browser.close();
        log('🔚 브라우저 종료 완료');
      } catch (closeError) {
        console.warn('⚠️ 브라우저 정리 실패:', closeError.message);
      }
    }
  }
  
  // 실행 완료 로그
  const executionTime = Date.now() - startTime;
  if (logId) {
    await dbService.logSampleComplete(logId, {
      productId,
      productName,
      cartAdded,
      success,
      errorMessage,
      executionTime,
      actualIp
    });
  }
  
  // 통계 출력
  await dbService.getSampleStats();
  
  log('✅ 샘플 테스트 완료');
  // process.exit(0); 제거 - 무한 루프를 위해
}

// 단일 인스턴스 무한 루프
async function runSingleLoop(instanceId) {
  let loopCount = 0;
  
  while (true) {
    loopCount++;
    console.log(`\n[인스턴스 ${instanceId}] 루프 실행 횟수: ${loopCount}`);
    
    try {
      await runSample(instanceId);
    } catch (error) {
      console.error(`[인스턴스 ${instanceId}] ❌ 샘플 실행 중 오류:`, error.message);
    }
    
    // 3초 대기
    console.log(`[인스턴스 ${instanceId}] ⏳ 3초 후 다음 루프 시작...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

// 4개 인스턴스 동시 실행
async function runMultipleInstances() {
  console.log('🚀 4개 인스턴스 동시 실행 시작');
  console.log('='.repeat(80));
  console.log('인스턴스 1: 폴더 01');
  console.log('인스턴스 2: 폴더 02');
  console.log('인스턴스 3: 폴더 03');
  console.log('인스턴스 4: 폴더 04');
  console.log('='.repeat(80) + '\n');
  
  // 4개 인스턴스 동시 시작 (await 없이)
  const instances = [];
  for (let i = 1; i <= 4; i++) {
    instances.push(runSingleLoop(i));
  }
  
  // 모든 인스턴스가 종료될 때까지 대기 (실제로는 무한 루프라 종료 안됨)
  await Promise.all(instances);
}

// 실행
if (require.main === module) {
  // 명령행 인자로 단일/다중 모드 선택
  const args = process.argv.slice(2);
  if (args.includes('--single')) {
    const instanceId = parseInt(args[args.indexOf('--single') + 1]) || 1;
    runSingleLoop(instanceId);
  } else {
    // 기본: 4개 동시 실행
    runMultipleInstances();
  }
}