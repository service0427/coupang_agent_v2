#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const { clearSessionWithCDP } = require('./lib/utils/session-cleaner');
const SharedCacheManager = require('./lib/services/shared-cache-manager');
const { cleanChromeProfile } = require('./lib/utils/preferences-cleaner');
const dbService = require('./lib/db/sample-service');

// 간단한 로거 (프로젝트의 logger는 클래스 기반이라 복잡함)
const logger = {
  log: (prefix, message) => console.log(`[${prefix}] ${message}`)
};

async function runSample() {
  const sampleFolder = 'sample-01';  // 샘플 전용 폴더
  const profilePath = path.join(__dirname, 'browser-data', sampleFolder);
  
  logger.log('샘플', '🚀 샘플 테스트 시작');
  logger.log('샘플', `📁 프로필 폴더: ${sampleFolder}`);
  
  // DB 초기화
  await dbService.createSampleLogTable();
  
  // 프록시 선택
  const proxy = await dbService.getAvailableProxy();
  let proxyConfig = null;
  
  if (proxy) {
    proxyConfig = {
      server: proxy.server
    };
    // 인증 정보가 있을 때만 추가
    if (proxy.username && proxy.password) {
      proxyConfig.username = proxy.username;
      proxyConfig.password = proxy.password;
    }
    logger.log('샘플', `🔐 프록시 사용: ${proxy.server}`);
  } else {
    logger.log('샘플', '🌐 프록시 없이 진행');
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
  
  try {
    // Default 폴더 생성 (없으면)
    await fs.mkdir(path.join(profilePath, 'Default'), { recursive: true });
    
    // Chrome Preferences 정리 (복구 메시지 방지)
    await cleanChromeProfile(profilePath);
    
    // 공유 캐시 매니저 설정
    const cacheManager = new SharedCacheManager({
      basePath: path.join(__dirname, 'browser-data')
    });
    await cacheManager.initialize();
    
    // 유저 폴더가 최초 실행인지 확인
    const isFirstRun = !(await fs.access(path.join(profilePath, 'Default', 'Cache')).then(() => true).catch(() => false));
    
    // 캐시 설정 (최초 실행이 아니면 공유 캐시로 전환)
    const cacheInfo = await cacheManager.setupUserFolderCache(profilePath, isFirstRun, false);
    logger.log('샘플', `💾 캐시 설정: ${cacheInfo.cacheType} (심볼릭 링크: ${cacheInfo.isSymlinked})`);
    
    // 원본과 동일한 Chrome 인자 생성 방식 사용
    const { getChromeArgs, getRandomViewportSize } = require('./lib/utils/browser-utils');
    const environment = require('./environment');
    
    // 원본과 동일한 viewport 설정
    const viewport = getRandomViewportSize(environment.screenWidth, environment.screenHeight);
    const chromeArgs = getChromeArgs({ viewport, headless: false });
    
    logger.log('샘플', `🔧 Chrome 인자 (원본과 동일):`, chromeArgs);
    logger.log('샘플', `🖥️ Viewport: ${viewport.width}x${viewport.height}`);
    
    // 브라우저 실행 (원본과 동일한 설정)
    logger.log('샘플', '🌐 브라우저 실행 중...');
    const launchOptions = {
      headless: false,
      channel: 'chrome',
      args: chromeArgs,
      viewport: viewport,  // 원본과 동일한 랜덤 viewport
      acceptDownloads: true
    };
    
    // proxy가 있을 때만 옵션에 추가
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    const context = await chromium.launchPersistentContext(profilePath, launchOptions);
    
    // 페이지 가져오기 또는 생성 (원본과 동일)
    const pages = context.pages();
    let page;
    if (pages.length > 0) {
      page = pages[0];
      logger.log('샘플', '📄 기존 페이지 재사용');
    } else {
      page = await context.newPage();
      logger.log('샘플', '📄 새 페이지 생성');
    }
    
    // Chrome 자동화 흔적 제거 - 원본과 동일한 방식
    // 원본은 hideAutomationTraces를 사용하는데 현재 비어있으므로 직접 구현
    await page.addInitScript(() => {
      // navigator.webdriver 제거
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // navigator.plugins 길이를 자연스럽게 설정
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ]
      });
      
      // Chrome 자동화 관련 속성 숨기기
      if (window.navigator.permissions && window.navigator.permissions.query) {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      }
    })
    
    // 세션 클리너로 쿠키, 세션, 로컬 스토리지만 삭제 (원본과 동일: clearCache=false)
    // 원본은 chrome-launcher.js에서 이미 처리하므로 여기서는 생략
    // await clearSessionWithCDP(page, true, false);
    
    // WebDriver 상태 확인
    const webdriverStatus = await page.evaluate(() => {
      return {
        webdriver: navigator.webdriver,
        userAgent: navigator.userAgent,
        pluginsLength: navigator.plugins ? navigator.plugins.length : 0,
        languages: navigator.languages
      };
    });
    logger.log('샘플', `🤖 WebDriver: ${webdriverStatus.webdriver === undefined ? '숨김' : '노출'}`);
    logger.log('샘플', `🔌 Plugins: ${webdriverStatus.pluginsLength}개`);
    
    // 이미지 및 리소스 차단 설정 (트래픽 최적화)
    logger.log('샘플', '🚫 리소스 차단 설정 중...');
    
    const blockedDomains = [
      'mercury.coupang.com',
      'image*.coupangcdn.com',
      'img1a.coupangcdn.com',
      'thumbnail*.coupangcdn.com',
      'static.coupangcdn.com'
    ];
    
    let blockedCount = 0;
    let allowedCount = 0;
    
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      const resourceType = request.resourceType();
      
      try {
        const domain = new URL(url).hostname;
        
        // 차단할 도메인 체크
        const shouldBlock = blockedDomains.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(domain);
          }
          return domain === pattern;
        });
        
        // 이미지와 미디어 리소스 차단
        if (shouldBlock || ['image', 'media', 'font'].includes(resourceType)) {
          blockedCount++;
          if (blockedCount <= 5) {
            logger.log('샘플', `   🚫 차단: ${resourceType} - ${domain}`);
          }
          
          // 투명 이미지로 대체
          if (resourceType === 'image') {
            await route.fulfill({
              status: 200,
              contentType: 'image/png',
              body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
            });
          } else {
            await route.abort();
          }
        } else {
          allowedCount++;
          await route.continue();
        }
      } catch (err) {
        await route.continue();
      }
    });
    
    logger.log('샘플', '✅ 리소스 차단 설정 완료');
    
    // IP 확인 (프록시 적용 확인)
    try {
      await page.goto('https://mkt.techb.kr/ip', { timeout: 10000 });
      const ipData = await page.locator('body').textContent();
      const ipJson = JSON.parse(ipData);
      actualIp = ipJson.ip;
      logger.log('샘플', `🌍 현재 IP: ${actualIp}`);
    } catch (err) {
      logger.log('샘플', '⚠️ IP 확인 실패');
    }
    
    // 타겟 URL 접속 (원본의 executeDirectMode와 완전 동일)
    const searchQuery = '헤파필터';
    const encodedQuery = encodeURIComponent(searchQuery);
    const targetUrl = `https://www.coupang.com/np/search?q=${encodedQuery}&channel=auto&listSize=72`;
    logger.log('샘플', `🌐 검색 결과 페이지 직접 접속 중... (URL 직접 모드)`);
    logger.log('샘플', `📍 URL: ${targetUrl}`);
    
    try {
      // 원본과 동일한 방식 - gotoPromise와 earlyErrorDetection을 Promise.race로 처리
      const gotoPromise = page.goto(targetUrl, {
        waitUntil: 'load',
        timeout: 20000
      });
      
      // ERR_HTTP2_PROTOCOL_ERROR 차단 에러 조기 감지 (3초 타임아웃)
      const earlyErrorDetection = new Promise((resolve, reject) => {
        let isResolved = false;
        
        // HTTP2_PROTOCOL_ERROR 즉시 감지
        const requestFailedHandler = (request) => {
          if (isResolved) return;
          const failure = request.failure();
          if (failure && failure.errorText.includes('HTTP2_PROTOCOL_ERROR')) {
            logger.log('샘플', '🚫 차단 감지! 즉시 에러 처리');
            isResolved = true;
            reject(new Error('쿠팡 접속 차단 감지됨'));
          }
        };
        page.on('requestfailed', requestFailedHandler);
        
        // 3초 내에 HTTP2_PROTOCOL_ERROR 패턴 감지시 즉시 실패
        const quickFailTimer = setTimeout(() => {
          if (!isResolved) {
            // 3초 후에도 로딩 중이면 차단 가능성 체크
            const currentUrl = page.url();
            if (currentUrl === 'about:blank' || currentUrl.includes('chrome-error://')) {
              logger.log('샘플', '🚫 3초 내 로딩 실패 - 차단 추정');
              isResolved = true;
              reject(new Error('쿠팡 접속 차단 감지됨'));
            }
          }
        }, 3000);
        
        // 정상 로딩 완료시 resolve
        gotoPromise.then((result) => {
          if (!isResolved) {
            clearTimeout(quickFailTimer);
            isResolved = true;
            page.off('requestfailed', requestFailedHandler);
            resolve(result);
          }
        }).catch((error) => {
          if (!isResolved) {
            clearTimeout(quickFailTimer);
            isResolved = true;
            page.off('requestfailed', requestFailedHandler);
            reject(error);
          }
        });
      });
      
      // gotoPromise가 먼저 완료되거나 에러가 먼저 발생하면 즉시 반환
      await Promise.race([
        gotoPromise,
        earlyErrorDetection
      ]);
      
      logger.log('샘플', '✅ 검색 결과 페이지 도달');
      
      // 페이지 로드 후 차단 확인
      await page.waitForTimeout(1000);
      
      // 차단 여부 재확인 (페이지 로드 후)
      const currentTitle = await page.title();
      const currentUrl = page.url();
      
      if (currentTitle.toLowerCase().includes('http2') || 
          currentTitle.toLowerCase().includes('err_http2') ||
          currentTitle.includes('ERR_HTTP2_PROTOCOL_ERROR')) {
        logger.log('샘플', '❌ HTTP/2 차단 감지됨! (페이지 타이틀)');
        errorMessage = 'HTTP/2 차단';
        throw new Error('HTTP/2 차단 감지');
      }
      
      if (currentUrl.includes('chrome-error://') || 
          currentUrl === 'about:blank') {
        logger.log('샘플', '❌ 페이지 로드 실패 - 차단 추정');
        errorMessage = '페이지 로드 실패';
        throw new Error('페이지 로드 실패 - 차단 추정');
      }
      
      // 쿠팡 도메인 확인
      if (!currentUrl.includes('coupang.com')) {
        logger.log('샘플', `❌ 쿠팡이 아닌 페이지로 이동: ${currentUrl}`);
        errorMessage = '잘못된 페이지 이동';
        throw new Error('쿠팡 페이지가 아님');
      }
      
      // 추가 대기
      await page.waitForTimeout(2000);
      
    } catch (navError) {
      // 프록시 연결 실패 시 즉시 종료
      if (navError.message.includes('ERR_PROXY_CONNECTION_FAILED') ||
          navError.message.includes('ERR_CONNECTION_REFUSED') ||
          navError.message.includes('ERR_NETWORK_CHANGED')) {
        logger.log('샘플', '🚨 프록시 연결 실패 - 즉시 종료');
        logger.log('샘플', `   에러: ${navError.message}`);
        errorMessage = `PROXY_FAILED: ${navError.message}`;
        throw navError;
      }
      
      // HTTP2_PROTOCOL_ERROR 즉시 처리
      if (navError.message.includes('HTTP2_PROTOCOL_ERROR')) {
        logger.log('샘플', '🚫 차단으로 인한 즉시 실패');
        errorMessage = '쿠팡 접속 차단 감지됨';
        throw navError;
      }
      
      logger.log('샘플', `❌ URL 직접 모드 실행 실패: ${navError.message}`);
      errorMessage = navError.message;
      throw navError;
    }
    
    logger.log('샘플', '✅ 페이지 로드 완료');
    
    // 페이지 정보 출력
    const title = await page.title();
    const url = page.url();
    logger.log('샘플', `📄 페이지 제목: ${title}`);
    logger.log('샘플', `🔗 현재 URL: ${url}`);
    
    // HTTP/2 차단 체크 (여러 패턴 확인)
    if (title.toLowerCase().includes('http2') || 
        title.toLowerCase().includes('err_http2') ||
        title.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
        title === '' ||  // 빈 타이틀도 차단 가능성
        title.includes('This site can\'t be reached')) {
      logger.log('샘플', '❌ HTTP/2 차단 감지됨!');
      errorMessage = 'HTTP/2 차단';
      throw new Error('HTTP/2 차단 감지');
    }
    
    // 페이지 내용 확인 (차단 메시지 감지)
    try {
      const bodyText = await page.$eval('body', el => el.innerText).catch(() => '');
      if (bodyText.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
          bodyText.includes('This site can\'t be reached') ||
          bodyText.includes('took too long to respond')) {
        logger.log('샘플', '❌ 차단 메시지 감지 (페이지 내용)');
        errorMessage = 'HTTP/2 차단';
        throw new Error('HTTP/2 차단 감지');
      }
    } catch (checkError) {
      if (checkError.message === 'HTTP/2 차단 감지') {
        throw checkError;
      }
      // 다른 에러는 무시
    }
    
    // 프록시 리다이렉트 체크
    if (url.includes('192.168.') || url.includes('localhost') || url.includes('127.0.0.1')) {
      logger.log('샘플', '❌ 프록시 리다이렉트 감지!');
      errorMessage = '프록시 리다이렉트';
      throw new Error('프록시 리다이렉트 발생');
    }
    
    // 검색 결과 대기
    await page.waitForSelector('#product-list', { timeout: 5000 }).catch(() => {
      logger.log('샘플', '⚠️ 검색 결과 대기 시간 초과');
    });
    
    // 상품 목록 추출 (광고 제외 - 개선된 로직)
    const products = await page.$$eval('#product-list > li[data-id]', (items) => {
      // 광고 여부 판별 함수 (여러 신호를 종합)
      function isAd(li) {
        // (a) 명시적 광고 마크/속성
        if (li.querySelector('[data-adsplatform]')) return true;
        if (li.querySelector('[class^="AdMark_"]')) return true;
        
        // (b) 링크 파라미터 기반
        const a = li.querySelector('a[href]');
        if (a) {
          const href = a.getAttribute('href') || '';
          if (href.includes('sourceType=srp_product_ads')) return true;
          if (href.includes('korePlacement=')) return true;
          // rank 파라미터가 없으면 광고일 가능성
          if (!href.includes('&rank=') && !href.includes('?rank=')) return true;
        }
        
        // (c) "AD" 텍스트 체크
        const adTextEl = li.querySelector('[class^="AdMark_"] span, span[class*="AdMark"]');
        if (adTextEl && adTextEl.textContent.trim().toUpperCase() === 'AD') return true;
        
        return false;
      }
      
      let realRankCounter = 0;
      
      return items.map((item, index) => {
        const link = item.querySelector('a[href]');
        if (!link) return null;
        
        const href = link.getAttribute('href') || link.href || '';
        const rank = index + 1;
        const productId = item.dataset.id || null;
        
        // 광고 여부 확인
        const adStatus = isAd(item);
        
        // 실제 순위 계산 (광고 제외)
        if (!adStatus) {
          realRankCounter++;
        }
        
        // 상품명 추출 (더 정확한 선택자)
        const nameElement = item.querySelector('[class*="productName"], [class^="ProductUnit_productName"], .name');
        const productName = nameElement ? nameElement.textContent.trim() : '';
        
        return {
          rank: rank,
          realRank: adStatus ? null : realRankCounter,
          isAd: adStatus,
          link: href,
          productId: productId,
          productName: productName
        };
      }).filter(product => product !== null);
    });
    
    logger.log('샘플', `📦 검색된 상품 수: ${products.length}개`);
    
    // 광고 제외한 상품들 필터링
    const nonAdProducts = products.filter(p => !p.isAd);
    
    if (nonAdProducts.length > 0) {
      // 랜덤하게 상품 선택
      const randomIndex = Math.floor(Math.random() * nonAdProducts.length);
      const selectedProduct = nonAdProducts[randomIndex];
      
      // 선택된 상품 정보 저장
      productId = selectedProduct.productId;
      productName = selectedProduct.productName;
      
      logger.log('샘플', `🎯 광고 제외 상품 중 랜덤 선택 (${randomIndex + 1}/${nonAdProducts.length})`);
      logger.log('샘플', `   상품명: ${productName}`);
      logger.log('샘플', `   상품 ID: ${productId}`);
      logger.log('샘플', `   순위: ${selectedProduct.rank}위 (실제: ${selectedProduct.realRank}위)`);
      
      // 상품 클릭 준비 (data-id 기반으로 더 정확하게 선택)
      const productSelector = selectedProduct.productId 
        ? `#product-list > li[data-id="${selectedProduct.productId}"] a[href]`
        : `a[href*="${selectedProduct.link}"]`;
      const productLink = await page.$(productSelector);
      
      if (productLink) {
        // 먼저 target 속성만 변경
        await productLink.evaluate(el => {
          if (el.tagName === 'A') {
            el.setAttribute('target', '_self');
          }
        });
        
        // 약간의 대기 시간 (자연스러운 동작)
        await page.waitForTimeout(500);
        
        // href 바꿔치기
        const originalHref = await productLink.evaluate(el => el.href);
        logger.log('샘플', `   원본 링크: ${originalHref}`);
        
        // 타겟 상품 정보
        const targetProductId = '8575068479';
        const targetItemId = '24848153621';
        const targetVendorItemId = '91855260496';
        
        // href 수정 (단순하게)
        await productLink.evaluate((el, params) => {
          if (el.tagName === 'A') {
            let newHref = el.href;
            // products ID만 변경
            newHref = newHref.replace(/\/products\/\d+/, `/products/${params.productId}`);
            // 파라미터는 그대로 유지하되 특정 값만 변경
            if (newHref.includes('itemId=')) {
              newHref = newHref.replace(/itemId=\d+/, `itemId=${params.itemId}`);
            }
            if (newHref.includes('vendorItemId=')) {
              newHref = newHref.replace(/vendorItemId=\d+/, `vendorItemId=${params.vendorItemId}`);
            }
            el.href = newHref;
          }
        }, { productId: targetProductId, itemId: targetItemId, vendorItemId: targetVendorItemId });
        
        const modifiedHref = await productLink.evaluate(el => el.href);
        logger.log('샘플', `   🔄 변경 링크: ${modifiedHref}`);
        
        // 추가 대기
        await page.waitForTimeout(300);
        
        logger.log('샘플', '🖱️ 상품 클릭 중...');
        
        // 클릭 전 URL 저장
        const beforeUrl = page.url();
        
        // 스크롤하여 요소를 뷰포트로 가져오기
        await productLink.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500); // 스크롤 안정화 대기
        
        // 사람처럼 클릭 (요소 중앙)
        try {
          // 먼저 호버 효과를 위해 마우스를 이동
          await productLink.hover();
          await page.waitForTimeout(200);
          
          // 클릭
          await productLink.click();
        } catch (clickError) {
          logger.log('샘플', `⚠️ 첫 번째 클릭 시도 실패, 대체 방법 시도: ${clickError.message}`);
          
          // 대체 클릭 방법: JavaScript로 직접 클릭
          await productLink.evaluate(el => el.click());
        }
        
        // 페이지 이동 대기
        try {
            await page.waitForFunction(
              (oldUrl) => window.location.href !== oldUrl,
              beforeUrl,
              { timeout: 10000 }
            );
            
            // 추가 로드 대기
            await page.waitForTimeout(2000);
            
            // 상품 페이지 도달 확인
            const currentUrl = page.url();
            const isProductPage = currentUrl.includes('/vp/products/') || currentUrl.includes('/vm/products/');
            
            if (isProductPage) {
              logger.log('샘플', '✅ 상품 페이지 도달 확인');
              logger.log('샘플', `🔗 현재 URL: ${currentUrl}`);
              
              // 상품 정보 추출 시도
              try {
                // 상품명 재확인
                const productTitle = await page.$eval('h2.prod-buy-header__title', el => el.textContent.trim()).catch(() => null);
                if (productTitle) {
                  logger.log('샘플', `📦 상품명 확인: ${productTitle}`);
                  productName = productTitle; // 더 정확한 상품명으로 업데이트
                }
                
                // 상품 ID 추출 (URL에서)
                const urlMatch = currentUrl.match(/\/vp\/products\/(\d+)/);
                if (urlMatch) {
                  const urlProductId = urlMatch[1];
                  logger.log('샘플', `🆔 상품 ID 확인: ${urlProductId}`);
                  if (!productId) productId = urlProductId;
                }
                
                // 장바구니 담기 시도
                logger.log('샘플', '🛒 장바구니 담기 시도...');
                
                // 페이지 안정화 대기
                await page.waitForTimeout(1000);
                
                // 장바구니 버튼 찾기
                const cartButtonSelector = 'button.prod-cart-btn';
                const hasCartButton = await page.evaluate((selector) => {
                  const btn = document.querySelector(selector);
                  return btn !== null;
                }, cartButtonSelector);
                
                if (hasCartButton) {
                  // 버튼 상태 확인
                  const buttonState = await page.evaluate((selector) => {
                    const btn = document.querySelector(selector);
                    if (!btn) return { exists: false };
                    return {
                      exists: true,
                      disabled: btn.disabled,
                      visible: btn.offsetParent !== null,
                      text: btn.textContent?.trim() || ''
                    };
                  }, cartButtonSelector);
                  
                  if (buttonState.visible && !buttonState.disabled) {
                    logger.log('샘플', `   장바구니 버튼 발견: "${buttonState.text}"`);
                    
                    // JavaScript로 직접 클릭
                    const clicked = await page.evaluate((selector) => {
                      const btn = document.querySelector(selector);
                      if (btn && !btn.disabled) {
                        btn.click();
                        return true;
                      }
                      return false;
                    }, cartButtonSelector);
                    
                    if (clicked) {
                      logger.log('샘플', '   ✅ 장바구니 버튼 클릭 성공');
                      
                      // 장바구니 처리 대기
                      logger.log('샘플', '   ⏳ 장바구니 처리 대기 (3초)...');
                      await page.waitForTimeout(3000);
                      
                      // 장바구니 팝업/모달 확인
                      const hasCartModal = await page.evaluate(() => {
                        // 여러 가능한 장바구니 팝업 선택자들
                        const modalSelectors = [
                          '.cart-modal',
                          '.cart-popup',
                          '[class*="cart-layer"]',
                          '[class*="CartModal"]',
                          '.prod-atf-cart-modal'
                        ];
                        return modalSelectors.some(selector => 
                          document.querySelector(selector) !== null
                        );
                      });
                      
                      if (hasCartModal) {
                        logger.log('샘플', '   📦 장바구니 팝업 확인됨');
                        
                        // 팝업 닫기 버튼 찾기 (옵션)
                        const closeButtonClicked = await page.evaluate(() => {
                          const closeSelectors = [
                            '.cart-modal .close',
                            '.cart-popup .close-btn',
                            '[class*="cart-layer"] button.close',
                            '.prod-atf-cart-modal__close'
                          ];
                          for (const selector of closeSelectors) {
                            const closeBtn = document.querySelector(selector);
                            if (closeBtn) {
                              closeBtn.click();
                              return true;
                            }
                          }
                          return false;
                        });
                        
                        if (closeButtonClicked) {
                          logger.log('샘플', '   🔚 장바구니 팝업 닫기');
                        }
                      }
                      
                      logger.log('샘플', '✅ 장바구니 담기 완료');
                      cartAdded = true; // 장바구니 담기 성공 표시
                    } else {
                      logger.log('샘플', '   ⚠️ 장바구니 버튼 클릭 실패');
                    }
                  } else if (buttonState.disabled) {
                    logger.log('샘플', '   ⚠️ 장바구니 버튼이 비활성화 상태');
                  } else {
                    logger.log('샘플', '   ⚠️ 장바구니 버튼이 보이지 않음');
                  }
                } else {
                  logger.log('샘플', '   ⚠️ 장바구니 버튼을 찾을 수 없음');
                }
                
                success = true; // 상품 페이지 도달은 성공
              } catch (extractError) {
                logger.log('샘플', '⚠️ 상품 정보 추출 실패 (페이지는 도달)');
                success = true; // 페이지 도달은 성공
              }
            } else if (currentUrl.includes('chrome-error://')) {
              logger.log('샘플', '❌ 네트워크 오류 - 상품 페이지 로드 실패');
              errorMessage = '네트워크 오류';
            } else {
              // 차단 페이지 확인
              const title = await page.title();
              const blockIndicators = ['access denied', 'blocked', 'forbidden', '차단', '접근 거부'];
              const isBlocked = blockIndicators.some(indicator => 
                title.toLowerCase().includes(indicator) || currentUrl.toLowerCase().includes(indicator)
              );
              
              if (isBlocked) {
                logger.log('샘플', '❌ 쿠팡 접속 차단 감지');
                errorMessage = '접속 차단';
              } else {
                logger.log('샘플', `⚠️ 상품 페이지가 아님: ${currentUrl}`);
                errorMessage = '상품 페이지 도달 실패';
              }
            }
          } catch (navError) {
            logger.log('샘플', '⚠️ 페이지 이동 타임아웃');
            
            // 타임아웃이어도 상품 페이지인지 확인
            const currentUrl = page.url();
            const isProductPage = currentUrl.includes('/vp/products/') || currentUrl.includes('/vm/products/');
            
            if (isProductPage) {
              logger.log('샘플', '✅ 타임아웃이지만 상품 페이지 도달함');
              success = true;
            } else {
              errorMessage = '페이지 이동 타임아웃';
            }
          }
        } else {
          logger.log('샘플', '⚠️ 상품 링크를 찾을 수 없음');
          errorMessage = '상품 링크를 찾을 수 없음';
        }
      } else {
        logger.log('샘플', '⚠️ 광고가 아닌 상품을 찾을 수 없음');
        errorMessage = '광고가 아닌 상품을 찾을 수 없음';
      }
    
    // 3초 대기 (페이지 확인용)
    logger.log('샘플', '⏱️ 3초 대기 중...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 리소스 차단 통계
    logger.log('샘플', `📊 리소스 차단 통계: 차단 ${blockedCount}개, 허용 ${allowedCount}개`);
    
    // 브라우저 종료
    logger.log('샘플', '🔚 브라우저 종료 중...');
    await context.close();
    
  } catch (error) {
    errorMessage = error.message;
    logger.log('샘플', `❌ 오류 발생: ${error.message}`);
    console.error(error);
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
  
  logger.log('샘플', '✅ 샘플 테스트 완료');
  process.exit(0);
}

// 실행
if (require.main === module) {
  runSample();
}