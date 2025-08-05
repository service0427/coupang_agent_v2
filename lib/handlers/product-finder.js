/**
 * 쿠팡 상품 검색 및 클릭 핸들러
 * - 상품 목록에서 특정 상품 찾기
 * - 랜덤 상품 선택
 * - 상품 클릭 처리
 */

const { addToCart } = require('./cart-handler');
const errorLogger = require('../services/error-logger');
const { humanClick } = require('../utils/human-click');
const { SELECTORS, DYNAMIC_SELECTORS } = require('../config/selectors');
const { createIdPrefix, safeWait, waitForSelectorWithFallback, isPageBlocked } = require('../utils/common-helpers');

/**
 * 페이지에서 상품 목록 추출
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
  
  // 상품 검색 (더 정확한 선택자 사용)
  const products = await page.$$eval(SELECTORS.PRODUCT_LIST.ITEMS, (items, data) => {
    const { targetCode, productLinkSelector, productNameSelector } = data;
    let realRankCounter = 0; // 광고 제외 실제 순위 카운터
    
    return items.map((item, index) => {
      const link = item.querySelector(productLinkSelector);
      if (!link) return null;
      
      const href = link.getAttribute('href') || link.href || '';
      const rank = index + 1;
      
      // URL에서 상품 코드 추출
      let extractedCode = null;
      const match = href.match(/\/vp\/products\/(\d+)/);
      if (match) {
        extractedCode = match[1];
      }
      
      // URL에서 rank 파라미터 확인
      let urlParams = '';
      let hasRankParam = false;
      try {
        const url = new URL(href.startsWith('http') ? href : 'https://www.coupang.com' + href);
        urlParams = url.searchParams.toString();
        hasRankParam = url.searchParams.has('rank');
      } catch (e) {
        urlParams = href;
        hasRankParam = href.includes('&rank=');
      }
      
      // 광고가 아닌 상품만 실제 순위 카운트
      let realRank = null;
      if (hasRankParam) {
        realRankCounter++;
        realRank = realRankCounter;
      }
      
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
    productLinkSelector: SELECTORS.PRODUCT_LIST.PRODUCT_LINK,
    productNameSelector: SELECTORS.PRODUCT_LIST.PRODUCT_NAME
  });
  
  return products;
}

/**
 * 타겟 상품 찾기 또는 랜덤 선택
 */
function findTargetProduct(products, productCode, keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
  let targetProduct = null;
  
  const nonAdProducts = products.filter(p => p.hasRankParam);
  console.log(`   ${idPrefix}총 ${products.length}개 상품 발견 (광고 제외: ${nonAdProducts.length}개)`);
  
  if (!productCode) {
    // productCode가 null이면 상품 코드가 있는 상품 중 랜덤 선택
    const validProducts = products.filter(p => p.code && p.hasRankParam);
    if (validProducts.length > 0) {
      const randomIndex = Math.floor(Math.random() * validProducts.length);
      targetProduct = validProducts[randomIndex];
      console.log(`   ${idPrefix}🎲 랜덤 상품 선택 (${validProducts.length}개 중 ${randomIndex + 1}번째)`);
      console.log(`   ${idPrefix}선택된 상품코드: ${targetProduct.code}`);
    }
  } else {
    // productCode가 있으면 해당 상품 찾기
    targetProduct = products.find(p => p.hasProductCode);
    if (targetProduct) {
      console.log(`   ${idPrefix}타겟 상품코드 ${productCode} 발견`);
      if (targetProduct.realRank) {
        console.log(`   ${idPrefix}실제 순위: ${targetProduct.realRank}위 (광고 제외)`);
      }
    }
  }
  
  return targetProduct;
}

/**
 * 상품 클릭 및 이동
 */
async function clickProduct(page, targetProduct, productCode, pageNum, productsPerPage, keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
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
  console.log(`🖱️ 상품 클릭 중...`);
  
  // 상품 클릭 (더 정확한 선택자 사용)
  let productSelector;
  if (productCode) {
    productSelector = DYNAMIC_SELECTORS.getProductLinkByCode(productCode);
  } else {
    productSelector = DYNAMIC_SELECTORS.getProductLinkByCode(targetProduct.code);
  }
  
  console.log(`   사용할 선택자: ${productSelector}`);
  
  // 상품 링크 찾기
  const productLink = await page.$(productSelector);
  if (!productLink) {
    console.log(`❌ 상품 링크를 찾을 수 없습니다: ${productSelector}`);
    throw new Error('상품 링크 누락');
  }
  
  // target="_self"로 설정하여 새 탭 방지
  await productLink.evaluate(el => el.setAttribute('target', '_self'));
  
  // Promise.all로 네비게이션 대기와 사람처럼 클릭 동시 수행
  console.log(`   [클릭 시도] 상품 페이지로 이동 중...`);
  
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      humanClick(page, productLink, keywordId)
    ]);
    
    console.log(`   [네비게이션 성공] domcontentloaded 이벤트 수신`);
  } catch (navError) {
    // humanClick 에러인지 네비게이션 에러인지 구분
    if (navError.message.includes('boundingBox') || navError.message.includes('보이지 않습니다')) {
      console.log(`   ${idPrefix}⚠️ 클릭 실패: ${navError.message}`);
      // 대체 클릭 방법 시도
      try {
        console.log(`   ${idPrefix}🔄 대체 클릭 방법 시도 (기본 click)...`);
        await productLink.click({ delay: 100 });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
        console.log(`   ${idPrefix}✅ 대체 클릭 성공`);
      } catch (fallbackError) {
        console.log(`   ${idPrefix}❌ 대체 클릭도 실패: ${fallbackError.message}`);
        throw navError;
      }
    } else {
      // 네비게이션 타임아웃이지만 실제로 페이지가 이동했는지 확인
      const currentUrl = page.url();
      if (currentUrl.includes('/vp/products/')) {
        console.log(`   [네비게이션 경고] 타임아웃이지만 상품 페이지로 이동됨`);
        console.log(`   현재 URL: ${currentUrl}`);
        // 계속 진행
      } else {
        console.log(`   [네비게이션 실패] 상품 페이지로 이동하지 못함`);
        console.log(`   현재 URL: ${currentUrl}`);
        throw navError;
      }
    }
  }
  
  console.log(`   ${idPrefix}⏳ 상품 페이지 로딩 안정화 대기 중...`);
  
  // URL 확인만으로 충분
  const currentUrl = page.url();
  if (!currentUrl.includes('/vp/products/')) {
    console.log(`   ${idPrefix}❌ 상품 페이지로 이동 실패`);
    console.log(`   ${idPrefix}현재 URL: ${currentUrl}`);
    throw new Error('상품 페이지 이동 실패');
  }
  
  // waitForLoadState 대신 더 안정적인 대기 방식 사용
  try {
    // 상품 페이지의 핵심 요소가 로드될 때까지 대기
    await page.waitForSelector(SELECTORS.PRODUCT_DETAIL.TITLE, { timeout: 10000 });
    console.log(`   ${idPrefix}[페이지 로드] 상품 제목 요소 확인됨`);
  } catch (e) {
    // 차단 재확인
    const isBlockedAfterWait = await isPageBlocked(page);
    if (isBlockedAfterWait) {
      console.log(`   ${idPrefix}🚫 쿠팡 접속 차단 감지!`);
      console.log(`   ${idPrefix}⏳ 3초 후 종료됩니다...`);
      await page.waitForTimeout(3000);
      throw new Error('쿠팡 접속 차단 (ERR_HTTP2_PROTOCOL_ERROR)');
    }
    console.log(`   ${idPrefix}[페이지 로드 경고] 상품 제목을 찾을 수 없지만 계속 진행`);
  }
  
  await page.waitForTimeout(3000);
  
  // 최종 URL에서 itemId와 vendorItemId 파싱
  const finalUrl = page.url();
  let itemId = null;
  let vendorItemId = null;
  
  try {
    const url = new URL(finalUrl);
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
  
  // console.log(`   ${idPrefix}✅ 상품 페이지 도착`);
  console.log(`   ${idPrefix}URL: ${finalUrl}`);
  // if (itemId) console.log(`   ${idPrefix}Item ID: ${itemId}`);
  // if (vendorItemId) console.log(`   ${idPrefix}Vendor Item ID: ${vendorItemId}`);
  console.log('');
  
  return {
    productRank,
    urlRank,
    realRank: targetProduct.realRank,
    itemId,
    vendorItemId
  };
}

/**
 * 상품 페이지에서 장바구니 처리
 */
async function handleCart(page, cartClickEnabled, keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
  const result = {
    cartClicked: false
  };
  
  if (cartClickEnabled) {
    console.log(`\n${idPrefix}🛒 장바구니 담기 시도 중...`);
    const cartResult = await addToCart(page, keywordId);
    result.cartClicked = cartResult.success;
    
    if (cartResult.success) {
      console.log(`   ${idPrefix}✅ 장바구니 담기 성공`);
    } else {
      console.log(`   ${idPrefix}⚠️ 장바구니 담기 실패: ${cartResult.message}`);
    }
  }
  
  return result;
}

module.exports = {
  extractProductList,
  findTargetProduct,
  clickProduct,
  handleCart
};