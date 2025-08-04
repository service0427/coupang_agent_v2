/**
 * 쿠팡 상품 검색 및 클릭 핸들러
 * - 상품 목록에서 특정 상품 찾기
 * - 랜덤 상품 선택
 * - 상품 클릭 처리
 */

const { addToCart } = require('./cart-handler');
const errorLogger = require('../services/error-logger');
const { isPageBlocked, getBlockedInfo } = require('../utils/block-detector');
const { humanClick } = require('../utils/human-click');

/**
 * 페이지에서 상품 목록 추출
 */
async function extractProductList(page, productCode, keywordId = null) {
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';
  try {
    await page.waitForSelector('#product-list', { timeout: 10000 });
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
  const products = await page.$$eval('#product-list > li[data-id], #product-list > li', (items, targetCode) => {
    return items.map((item, index) => {
      const link = item.querySelector('a[href*="/vp/products/"], a.search-product-link');
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
      try {
        const url = new URL(href.startsWith('http') ? href : 'https://www.coupang.com' + href);
        urlParams = url.searchParams.toString();
      } catch (e) {
        urlParams = href;
      }
      
      // 상품 코드 비교 (정확한 매칭)
      const hasProductCode = targetCode ? (extractedCode === targetCode) : false;
      
      return {
        rank: rank,
        href: href,
        code: extractedCode,
        hasProductCode: hasProductCode,
        urlParams: urlParams,
        productName: item.querySelector('.name')?.textContent?.trim() || ''
      };
    }).filter(item => item !== null);
  }, productCode);
  
  return products;
}

/**
 * 타겟 상품 찾기 또는 랜덤 선택
 */
function findTargetProduct(products, productCode, keywordId = null) {
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';
  let targetProduct = null;
  
  console.log(`   ${idPrefix}총 ${products.length}개 상품 발견`);
  
  if (!productCode) {
    // productCode가 null이면 상품 코드가 있는 상품 중 랜덤 선택
    const validProducts = products.filter(p => p.code && p.href.includes('&rank='));
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
    }
  }
  
  return targetProduct;
}

/**
 * 상품 클릭 및 이동
 */
async function clickProduct(page, targetProduct, productCode, pageNum, productsPerPage, keywordId = null) {
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';
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
    productSelector = `a[href*="/vp/products/${productCode}"]`;
  } else {
    productSelector = `a[href*="/vp/products/${targetProduct.code}"]`;
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
  
  console.log(`   ${idPrefix}⏳ 상품 페이지 로딩 안정화 대기 중...`);
  
  // 차단 여부 먼저 확인
  const isBlocked = await isPageBlocked(page);
  if (isBlocked) {
    console.log(`   ${idPrefix}🚫 쿠팡 접속 차단 감지!`);
    const blockInfo = await getBlockedInfo(page);
    console.log(`   ${idPrefix}차단 URL: ${blockInfo.url}`);
    console.log(`   ${idPrefix}페이지 제목: ${blockInfo.title}`);
    if (blockInfo.blockMessages && blockInfo.blockMessages.length > 0) {
      console.log(`   ${idPrefix}차단 메시지:`);
      blockInfo.blockMessages.forEach(msg => {
        console.log(`     ${idPrefix}- ${msg}`);
      });
    }
    console.log(`   ${idPrefix}⏳ 3초 후 종료됩니다...`);
    await page.waitForTimeout(3000);
    throw new Error('쿠팡 접속 차단 (ERR_HTTP2_PROTOCOL_ERROR)');
  }
  
  // waitForLoadState 대신 더 안정적인 대기 방식 사용
  try {
    // 상품 페이지의 핵심 요소가 로드될 때까지 대기
    await page.waitForSelector('.prod-buy-header__title, h1', { timeout: 10000 });
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
  
  console.log(`   ${idPrefix}✅ 상품 페이지 도착`);
  console.log(`   ${idPrefix}URL: ${page.url()}`);
  console.log('');
  
  return {
    productRank,
    urlRank
  };
}

/**
 * 상품 페이지에서 장바구니 처리
 */
async function handleCart(page, cartClickEnabled, keywordId = null) {
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';
  const result = {
    cartClicked: false,
    cartClickCount: 0
  };
  
  if (cartClickEnabled) {
    console.log(`\n${idPrefix}🛒 장바구니 담기 시도 중...`);
    const cartResult = await addToCart(page, keywordId);
    result.cartClicked = cartResult.success;
    
    if (cartResult.success) {
      result.cartClickCount++;
      console.log(`   ${idPrefix}✅ 장바구니 클릭 횟수: ${result.cartClickCount}`);
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