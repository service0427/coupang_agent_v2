/**
 * 쿠팡 상품 검색 및 클릭 핸들러 V2
 * - 페이지 로딩 단계별 메트릭 수집
 * - DOMContentLoaded와 Load 이벤트 개별 추적
 * - 타임아웃 상황에서도 실제 이동 성공 여부 확인
 */

const { addToCart } = require('./cart-handler');
const errorLogger = require('../services/error-logger');
const { humanClick } = require('../utils/human-click');
const { SELECTORS, DYNAMIC_SELECTORS } = require('../config/selectors');
const { createIdPrefix, safeWait, waitForSelectorWithFallback, isPageBlocked } = require('../utils/common-helpers');
const dbService = require('../services/db-service');

/**
 * 페이지 로딩 메트릭 저장
 */
async function savePageLoadMetrics(executionId, keywordId, agent, metrics) {
  try {
    const query = `
      INSERT INTO v2_page_load_metrics (
        execution_id, keyword_id, agent,
        click_attempted, click_success, click_method, click_error, click_duration_ms,
        domcontentloaded_start, domcontentloaded_end, domcontentloaded_duration_ms, 
        domcontentloaded_success, domcontentloaded_timeout,
        load_start, load_end, load_duration_ms, load_success, load_timeout,
        initial_url, final_url, url_changed, is_product_page,
        product_title_found, product_title_load_ms, cart_button_found, cart_button_load_ms,
        error_type, error_message, is_blocked, proxy_used
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, $26,
        $27, $28, $29, $30
      )
    `;
    
    await dbService.query(query, [
      executionId, keywordId, agent,
      metrics.click_attempted, metrics.click_success, metrics.click_method, 
      metrics.click_error, metrics.click_duration_ms,
      metrics.domcontentloaded_start, metrics.domcontentloaded_end, 
      metrics.domcontentloaded_duration_ms, metrics.domcontentloaded_success, 
      metrics.domcontentloaded_timeout,
      metrics.load_start, metrics.load_end, metrics.load_duration_ms, 
      metrics.load_success, metrics.load_timeout,
      metrics.initial_url, metrics.final_url, metrics.url_changed, 
      metrics.is_product_page,
      metrics.product_title_found, metrics.product_title_load_ms, 
      metrics.cart_button_found, metrics.cart_button_load_ms,
      metrics.error_type, metrics.error_message, metrics.is_blocked, 
      metrics.proxy_used
    ]);
  } catch (error) {
    console.error('페이지 로딩 메트릭 저장 실패:', error.message);
  }
}

/**
 * 상품 클릭 및 페이지 로딩 (메트릭 수집 포함)
 */
async function clickProductWithMetrics(page, targetProduct, productCode, pageNum, productsPerPage, options = {}) {
  const { keywordId = null, executionId = null, agent = 'default', proxyConfig = null } = options;
  const idPrefix = createIdPrefix(keywordId);
  
  const metrics = {
    click_attempted: new Date(),
    initial_url: page.url(),
    proxy_used: proxyConfig?.server || null,
    // 기본값 설정
    click_success: false,
    domcontentloaded_success: false,
    load_success: false,
    is_blocked: false
  };
  
  const productRank = ((pageNum - 1) * productsPerPage) + targetProduct.rank;
  
  // URL에서 rank 파라미터 찾기
  let urlRank = 0;
  const urlMatch = targetProduct.urlParams.match(/rank=(\d+)/);
  if (urlMatch) {
    urlRank = parseInt(urlMatch[1]);
  }
  
  if (!productCode) {
    console.log(`   ${idPrefix}✅ 랜덤 상품 발견!`);
  } else {
    console.log(`   ${idPrefix}✅ 상품 발견!`);
  }
  console.log(`   ${idPrefix}순위: ${productRank}위 (페이지 ${pageNum}, ${targetProduct.rank}번째)`);
  console.log(`   ${idPrefix}URL rank: ${urlRank || '없음'}`);
  console.log(`   ${idPrefix}상품명: ${targetProduct.productName}`);
  console.log('');
  
  // 상품 클릭
  console.log(`🖱️ ${idPrefix}상품 클릭 중...`);
  
  // 상품 선택자 설정
  let productSelector;
  if (productCode) {
    productSelector = DYNAMIC_SELECTORS.getProductLinkByCode(productCode);
  } else {
    productSelector = DYNAMIC_SELECTORS.getProductLinkByCode(targetProduct.code);
  }
  
  console.log(`   ${idPrefix}사용할 선택자: ${productSelector}`);
  
  // 상품 링크 찾기
  const productLink = await page.$(productSelector);
  if (!productLink) {
    console.log(`❌ ${idPrefix}상품 링크를 찾을 수 없습니다: ${productSelector}`);
    metrics.error_type = 'click_error';
    metrics.error_message = '상품 링크 누락';
    await savePageLoadMetrics(executionId, keywordId, agent, metrics);
    throw new Error('상품 링크 누락');
  }
  
  // target="_self"로 설정하여 새 탭 방지
  await productLink.evaluate(el => el.setAttribute('target', '_self'));
  
  try {
    // 네비게이션 추적을 위한 Promise 설정
    const navigationPromise = new Promise(async (resolve, reject) => {
      let domContentLoadedResolved = false;
      let loadResolved = false;
      let navigationTimeout = null;
      
      // DOMContentLoaded 이벤트 리스너
      const domContentLoadedHandler = () => {
        metrics.domcontentloaded_end = new Date();
        metrics.domcontentloaded_duration_ms = 
          metrics.domcontentloaded_end - metrics.domcontentloaded_start;
        metrics.domcontentloaded_success = true;
        domContentLoadedResolved = true;
        console.log(`   ${idPrefix}[DOMContentLoaded] ${metrics.domcontentloaded_duration_ms}ms`);
      };
      
      // Load 이벤트 리스너
      const loadHandler = () => {
        metrics.load_end = new Date();
        metrics.load_duration_ms = 
          metrics.load_end - metrics.load_start;
        metrics.load_success = true;
        loadResolved = true;
        console.log(`   ${idPrefix}[Load Complete] ${metrics.load_duration_ms}ms`);
        
        // 타임아웃 클리어
        if (navigationTimeout) {
          clearTimeout(navigationTimeout);
        }
        
        // 이벤트 리스너 제거
        page.removeListener('domcontentloaded', domContentLoadedHandler);
        page.removeListener('load', loadHandler);
        
        resolve();
      };
      
      // 이벤트 리스너 등록
      page.once('domcontentloaded', domContentLoadedHandler);
      page.once('load', loadHandler);
      
      // 타임아웃 설정 (30초)
      navigationTimeout = setTimeout(() => {
        // DOMContentLoaded 타임아웃 체크
        if (!domContentLoadedResolved) {
          metrics.domcontentloaded_timeout = true;
          console.log(`   ${idPrefix}[DOMContentLoaded Timeout] 30초 초과`);
        }
        
        // Load 타임아웃 체크
        if (!loadResolved) {
          metrics.load_timeout = true;
          console.log(`   ${idPrefix}[Load Timeout] 30초 초과`);
          
          // URL 체크로 실제 이동 여부 확인
          const currentUrl = page.url();
          if (currentUrl.includes('/vp/products/')) {
            console.log(`   ${idPrefix}[타임아웃 but 이동 성공] ${currentUrl}`);
            metrics.final_url = currentUrl;
            metrics.url_changed = true;
            metrics.is_product_page = true;
            
            // 이벤트 리스너 제거
            page.removeListener('domcontentloaded', domContentLoadedHandler);
            page.removeListener('load', loadHandler);
            
            resolve(); // 타임아웃이지만 이동은 성공
          } else {
            reject(new Error('Navigation timeout - 상품 페이지 이동 실패'));
          }
        }
      }, 30000);
    });
    
    // 클릭 실행 및 시간 측정
    const clickStartTime = Date.now();
    metrics.domcontentloaded_start = new Date();
    metrics.load_start = new Date();
    
    try {
      // 클릭과 네비게이션 동시 대기
      await Promise.all([
        navigationPromise,
        humanClick(page, productLink, keywordId)
      ]);
      
      metrics.click_success = true;
      metrics.click_method = 'human_click';
      metrics.click_duration_ms = Date.now() - clickStartTime;
      
      console.log(`   ${idPrefix}[클릭 성공] ${metrics.click_method} (${metrics.click_duration_ms}ms)`);
      
    } catch (navError) {
      // 클릭 실패 시 대체 방법 시도
      if (navError.message.includes('boundingBox') || navError.message.includes('보이지 않습니다')) {
        console.log(`   ${idPrefix}⚠️ human_click 실패, 대체 방법 시도...`);
        
        try {
          await productLink.click({ delay: 100 });
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
          
          metrics.click_success = true;
          metrics.click_method = 'fallback_click';
          metrics.click_duration_ms = Date.now() - clickStartTime;
          metrics.domcontentloaded_success = true;
          
          console.log(`   ${idPrefix}✅ 대체 클릭 성공`);
        } catch (fallbackError) {
          console.log(`   ${idPrefix}❌ 대체 클릭도 실패: ${fallbackError.message}`);
          throw navError;
        }
      } else {
        throw navError;
      }
    }
    
    // 최종 URL 및 페이지 확인
    metrics.final_url = page.url();
    metrics.url_changed = metrics.initial_url !== metrics.final_url;
    metrics.is_product_page = metrics.final_url.includes('/vp/products/');
    
    if (!metrics.is_product_page) {
      throw new Error('상품 페이지 이동 실패');
    }
    
    console.log(`   ${idPrefix}⏳ 핵심 요소 로딩 확인 중...`);
    
    // 상품명 로딩 확인
    const titleLoadStart = Date.now();
    try {
      await page.waitForSelector(SELECTORS.PRODUCT_DETAIL.TITLE, { timeout: 5000 });
      metrics.product_title_found = true;
      metrics.product_title_load_ms = Date.now() - titleLoadStart;
      console.log(`   ${idPrefix}[상품명 로드] ${metrics.product_title_load_ms}ms`);
    } catch (e) {
      metrics.product_title_found = false;
      console.log(`   ${idPrefix}[상품명 미발견] 5초 타임아웃`);
    }
    
    // 장바구니 버튼 확인
    const cartLoadStart = Date.now();
    try {
      await page.waitForSelector(SELECTORS.CART.ADD_BUTTON, { timeout: 3000 });
      metrics.cart_button_found = true;
      metrics.cart_button_load_ms = Date.now() - cartLoadStart;
      console.log(`   ${idPrefix}[장바구니 버튼 로드] ${metrics.cart_button_load_ms}ms`);
    } catch (e) {
      metrics.cart_button_found = false;
      console.log(`   ${idPrefix}[장바구니 버튼 미발견] 3초 타임아웃`);
    }
    
    // 차단 확인
    metrics.is_blocked = await isPageBlocked(page);
    if (metrics.is_blocked) {
      metrics.error_type = 'blocked';
      metrics.error_message = '쿠팡 접속 차단 감지';
      console.log(`   ${idPrefix}🚫 쿠팡 접속 차단 감지!`);
    }
    
    // 추가 대기
    await page.waitForTimeout(3000);
    
    console.log(`   ${idPrefix}✅ 상품 페이지 도착`);
    console.log(`   ${idPrefix}URL: ${metrics.final_url}`);
    console.log('');
    
  } catch (error) {
    metrics.click_success = metrics.click_success || false;
    metrics.click_error = error.message;
    
    // 에러 타입 분류
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      metrics.error_type = 'timeout';
    } else if (error.message.includes('ERR_') || error.message.includes('net::')) {
      metrics.error_type = 'network_error';
    } else if (error.message.includes('차단')) {
      metrics.error_type = 'blocked';
    } else {
      metrics.error_type = 'unknown';
    }
    metrics.error_message = error.message;
    
    console.error(`   ${idPrefix}❌ 상품 클릭 오류: ${error.message}`);
    throw error;
    
  } finally {
    // 메트릭 저장
    if (executionId && keywordId) {
      await savePageLoadMetrics(executionId, keywordId, agent, metrics);
    }
  }
  
  // URL에서 itemId와 vendorItemId 파싱
  let itemId = null;
  let vendorItemId = null;
  
  try {
    const url = new URL(metrics.final_url);
    const itemIdParam = url.searchParams.get('itemId');
    const vendorItemIdParam = url.searchParams.get('vendorItemId');
    
    if (itemIdParam) {
      itemId = parseInt(itemIdParam);
    }
    if (vendorItemIdParam) {
      vendorItemId = parseInt(vendorItemIdParam);
    }
  } catch (e) {
    console.log(`   ${idPrefix}⚠️ URL 파싱 오류: ${e.message}`);
  }
  
  return {
    productRank,
    urlRank,
    realRank: targetProduct.realRank,
    itemId,
    vendorItemId,
    metrics
  };
}

/**
 * 페이지에서 상품 목록 추출 (기존 함수 재사용)
 */
async function extractProductList(page, productCode, keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
  try {
    await waitForSelectorWithFallback(page, SELECTORS.PRODUCT_LIST.CONTAINER, { timeout: 10000 }, keywordId);
  } catch (error) {
    console.log(`   ${idPrefix}⚠️ 상품 목록을 찾을 수 없습니다.`);
    
    // 에러 페이지나 차단 확인
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body?.innerText?.substring(0, 200) || ''
      };
    });
    
    console.log(`   ${idPrefix}페이지 제목: ${pageContent.title}`);
    console.log(`   ${idPrefix}페이지 내용: ${pageContent.bodyText}`);
    
    throw new Error('상품 목록 로드 실패');
  }
  
  // CSS 선택자들
  const containerSelector = SELECTORS.PRODUCT_LIST.CONTAINER;
  const itemsSelector = SELECTORS.PRODUCT_LIST.ITEMS;
  const productLinkSelector = SELECTORS.PRODUCT_LIST.PRODUCT_LINK;
  const productNameSelector = SELECTORS.PRODUCT_LIST.PRODUCT_NAME;
  
  console.log(`   ${idPrefix}🔍 상품 목록 추출 중...`);
  console.log(`   ${idPrefix}컨테이너: ${containerSelector}`);
  console.log(`   ${idPrefix}아이템: ${itemsSelector}`);
  
  // 상품 목록 추출
  const products = await page.$eval(SELECTORS.PRODUCT_LIST.ITEMS, (items, data) => {
    const { targetCode, productLinkSelector, productNameSelector } = data;
    
    return Array.from(items).map((item, index) => {
      const rank = index + 1;
      const realRank = rank;
      
      // 상품 링크 찾기
      const linkElement = item.querySelector(productLinkSelector);
      if (!linkElement) return null;
      
      const href = linkElement.getAttribute('href') || '';
      
      // URL 파라미터 파싱
      const urlParams = href.split('?')[1] || '';
      const params = new URLSearchParams(urlParams);
      
      // rank 파라미터 확인
      const hasRankParam = params.has('rank');
      
      // productId 추출
      const productIdMatch = href.match(/products\/(\d+)/);
      const extractedCode = productIdMatch ? productIdMatch[1] : '';
      
      // 상품 코드 비교 (정확한 매칭)
      const hasProductCode = targetCode ? (extractedCode === targetCode) : false;
      
      return {
        rank: rank,
        realRank: realRank,
        href: href,
        code: extractedCode,
        hasProductCode: hasProductCode,
        urlParams: urlParams,
        hasRankParam: hasRankParam,
        productName: item.querySelector(productNameSelector)?.textContent?.trim() || ''
      };
    }).filter(item => item !== null);
  }, {
    targetCode: productCode,
    productLinkSelector: productLinkSelector,
    productNameSelector: productNameSelector
  });
  
  console.log(`   ${idPrefix}✅ ${products.length}개 상품 발견`);
  
  // rank 파라미터가 있는 상품 개수
  const rankedProducts = products.filter(p => p.hasRankParam);
  console.log(`   ${idPrefix}📊 rank 파라미터 있는 상품: ${rankedProducts.length}개`);
  
  return products;
}

/**
 * 타겟 상품 찾기 (기존 함수 재사용)
 */
function findTargetProduct(products, productCode, keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
  let targetProduct = null;
  
  if (productCode) {
    // 특정 상품 코드로 찾기
    targetProduct = products.find(p => p.hasProductCode);
    
    if (targetProduct) {
      console.log(`   ${idPrefix}🎯 상품 코드 ${productCode} 매칭!`);
    }
  } else {
    // 랜덤 선택 - rank 파라미터가 있는 상품 중에서
    const rankedProducts = products.filter(p => p.hasRankParam);
    
    if (rankedProducts.length > 0) {
      const randomIndex = Math.floor(Math.random() * rankedProducts.length);
      targetProduct = rankedProducts[randomIndex];
      console.log(`   ${idPrefix}🎲 랜덤 선택: rank 파라미터 있는 상품 ${rankedProducts.length}개 중 선택`);
    }
  }
  
  return targetProduct;
}

/**
 * 상품 페이지에서 장바구니 처리 (메트릭 추가)
 */
async function handleCart(page, cartClickEnabled, keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
  const result = {
    cartClicked: false,
    cartClickSuccess: false,
    cartClickError: null
  };
  
  if (!cartClickEnabled) {
    console.log(`   ${idPrefix}🛒 장바구니 클릭 비활성화`);
    return result;
  }
  
  try {
    console.log(`   ${idPrefix}🛒 장바구니 담기 시도 중...`);
    const added = await addToCart(page, keywordId);
    
    if (added) {
      result.cartClicked = true;
      result.cartClickSuccess = true;
      console.log(`   ${idPrefix}✅ 장바구니 담기 성공`);
    } else {
      result.cartClicked = true;
      result.cartClickSuccess = false;
      console.log(`   ${idPrefix}⚠️ 장바구니 담기 실패`);
    }
  } catch (error) {
    result.cartClicked = true;
    result.cartClickSuccess = false;
    result.cartClickError = error.message;
    console.log(`   ${idPrefix}❌ 장바구니 오류: ${error.message}`);
  }
  
  return result;
}

module.exports = {
  extractProductList,
  findTargetProduct,
  clickProductWithMetrics,
  handleCart,
  savePageLoadMetrics
};