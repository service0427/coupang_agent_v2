/**
 * 쿠팡 상품 검색 및 클릭 핸들러 - DB 코드 제거 버전
 * - 상품 목록에서 특정 상품 찾기
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
async function extractProductList(page, productCode, keywordId = null, threadPrefix = '', pageNum = 1) {
  const idPrefix = createIdPrefix(keywordId);
  
  try {
    // 2페이지 이상에서는 선택자 로그 숨김
    await waitForSelectorWithFallback(page, SELECTORS.PRODUCT_LIST.CONTAINER, { 
      timeout: 10000, 
      silent: pageNum > 1 
    }, keywordId);
    
  } catch (error) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 상품 목록을 찾을 수 없습니다.`);
    
    // 페이지 상태 분석
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body?.innerText?.substring(0, 200) || ''
      };
    });
    
    console.log(`${threadPrefix}    ${idPrefix}페이지 제목: ${pageContent.title}`);
    console.log(`${threadPrefix}    ${idPrefix}페이지 내용: ${pageContent.bodyText}`);
    
    // HTTP2 프로토콜 에러 감지 (차단)
    if (pageContent.bodyText.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
        pageContent.bodyText.includes('사이트에 연결할 수 없음')) {
      const error = new Error('쿠팡 접속 차단 감지됨 (HTTP2_PROTOCOL_ERROR)');
      error.errorType = 'blocked';
      throw error;
    }
    
    // 점검 페이지 감지
    if (pageContent.title.includes('점검') || 
        pageContent.bodyText.includes('점검 중') ||
        pageContent.bodyText.includes('더 나은 서비스')) {
      console.log(`${threadPrefix}    ${idPrefix}⚠️ 점검 페이지 감지, 새로고침 시도...`);
      
      // 새로고침 시도
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      // 다시 시도
      try {
        await waitForSelectorWithFallback(page, SELECTORS.PRODUCT_LIST.CONTAINER, { timeout: 10000 }, keywordId);
        // 성공하면 다시 진행
      } catch (retryError) {
        // 여전히 실패하면 에러
        throw new Error('상품 목록 로드 실패 (점검 또는 차단)');
      }
    } else {
      throw new Error('상품 목록 로드 실패');
    }
  }
  
  // 상품 검색 (더 정확한 선택자 사용, 평점/리뷰수 추출 기능 추가)
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
      
      // 광고 여부 확인 (광고 상품은 실제 순위에서 제외)
      const hasRankParam = href.includes('&rank=') || href.includes('?rank=');
      
      const isAd = 
        // rank 파라미터가 없으면 광고일 가능성 높음
        !hasRankParam ||
        // AdMark 클래스 체크 (가장 확실한 광고 표시)
        item.querySelector('[class*="AdMark_"]') !== null ||
        // 기존 체크
        item.querySelector('[data-component-type="s-ads"]') !== null ||
        item.closest('[data-component-type="s-ads"]') !== null ||
        href.includes('&ads=') ||
        href.includes('ad=true');
      
      // 실제 순위 계산 (광고 제외)
      if (!isAd) {
        realRankCounter++;
      }
      
      // 상품명 추출
      const nameElement = item.querySelector(productNameSelector);
      const productName = nameElement ? nameElement.textContent.trim() : '';
      
      // 평점 추출 - 안정적인 부분 클래스명 선택자 사용
      let rating = null;
      const ratingElement = item.querySelector('[class*="ProductRating_productRating__"] [class*="ProductRating_rating__"] [class*="ProductRating_star__"]');
      if (ratingElement) {
        const ratingText = ratingElement.textContent.trim();
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
        }
      }
      
      // 리뷰 수 추출 - 안정적인 부분 클래스명 선택자 사용
      let reviewCount = 0;
      const reviewElement = item.querySelector('[class*="ProductRating_productRating__"] [class*="ProductRating_ratingCount__"]');
      if (reviewElement) {
        const reviewText = reviewElement.textContent;
        // 괄호 안의 숫자 추출: (72376)
        const reviewMatch = reviewText.match(/\(\s*(\d+(?:,\d+)*)\s*\)/);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
        }
      }
      
      // 썸네일 URL 추출 - 안정적인 부분 클래스명 선택자 사용
      let thumbnailUrl = null;
      const imgElement = item.querySelector('[class*="ProductUnit_productImage__"] img');
      if (imgElement) {
        // src 속성에서 직접 추출
        thumbnailUrl = imgElement.src || null;
      }
      
      return {
        rank: rank,
        realRank: isAd ? null : realRankCounter, // 광고는 실제 순위 없음
        isAd: isAd,
        link: href,
        productCode: extractedCode,
        productName: productName,
        rating: rating,
        reviewCount: reviewCount,
        thumbnailUrl: thumbnailUrl,
        // URL 파라미터들 저장
        urlParams: href.split('?')[1] || '',
        // 페이지 내 순위 (광고 포함)
        rankInPage: rank,
        // URL에서 추출한 순위
        urlRank: (() => {
          const urlRankMatch = href.match(/rank=(\d+)/);
          return urlRankMatch ? parseInt(urlRankMatch[1]) : null;
        })()
      };
    }).filter(product => product !== null);
  }, {
    targetCode: productCode,
    productLinkSelector: SELECTORS.PRODUCT_LIST.PRODUCT_LINK,
    productNameSelector: SELECTORS.PRODUCT_LIST.PRODUCT_NAME
  });
  
  // 광고/비광고 제품 수 계산
  const adCount = products.filter(p => p.isAd).length;
  const nonAdCount = products.filter(p => !p.isAd).length;
  
  console.log(`${threadPrefix}    ${idPrefix}상품 ${products.length}개 발견 (광고: ${adCount}개, 일반: ${nonAdCount}개)`);
  
  return products;
}

/**
 * 대상 상품 찾기 (특정 상품 코드만 지원)
 */
function findTargetProduct(products, productCode, keywordId = null, threadPrefix = '') {
  const idPrefix = createIdPrefix(keywordId);
  
  if (!products || products.length === 0) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 추출된 상품이 없습니다.`);
    return null;
  }
  
  if (!productCode) {
    console.log(`${threadPrefix}    ${idPrefix}❌ 상품 코드가 없습니다. 상품 코드는 필수입니다.`);
    return null;
  }
  
  // 특정 상품 코드로 찾기 (광고 제외)
  const found = products.find(p => p.productCode === productCode && !p.isAd);
  if (found) {
    console.log(`${threadPrefix}    ${idPrefix}✅ 대상 상품 발견: ${found.productName} (${found.rank}순위, 실제: ${found.realRank}순위)`);
    return found;
  }
  
  // 광고 상품만 있는 경우 확인
  const adProduct = products.find(p => p.productCode === productCode && p.isAd);
  if (adProduct) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 대상 상품(${productCode})은 광고 상품입니다. 광고는 클릭하지 않습니다.`);
    return null;
  } else {
    console.log(`${threadPrefix}    ${idPrefix}❌ 대상 상품(${productCode})을 찾을 수 없습니다.`);
    return null;
  }
}

/**
 * 상품 클릭 및 페이지 이동
 */
async function clickProduct(page, targetProduct, productCode, pageNum, productsPerPage, keywordId = null, threadPrefix = '') {
  const idPrefix = createIdPrefix(keywordId);
  
  const productRank = ((pageNum - 1) * productsPerPage) + targetProduct.rank;
  
  // URL에서 rank 파라미터 찾기
  let urlRank = 0;
  const urlMatch = targetProduct.urlParams.match(/rank=(\d+)/);
  if (urlMatch) {
    urlRank = parseInt(urlMatch[1]);
  }
  
  console.log(`${threadPrefix}    ${idPrefix}✅ 상품 발견!`);
  console.log(`${threadPrefix}    ${idPrefix}순위: ${productRank}위 (페이지 ${pageNum}, ${targetProduct.rank}번째)`);
  console.log(`${threadPrefix}    ${idPrefix}URL rank: ${urlRank || '없음'}`);
  console.log(`${threadPrefix}    ${idPrefix}상품명: ${targetProduct.productName}`);
  console.log(`${threadPrefix} `);
  
  // 상품 클릭
  console.log(`${threadPrefix} 🖱️ ${idPrefix}상품 클릭 중...`);
  
  // 클릭 전 검색 페이지 URL 저장 (referer로 사용)
  const searchPageUrl = page.url();
  
  try {
    // 상품 링크 클릭 - 광고 제외하고 정확한 상품만 선택
    let clickedSuccessfully = false;
    
    // 더 정확한 선택자 사용: data-id와 광고 제외 조건 결합
    const productSelectors = [
      // 1. data-id로 정확한 li를 찾고, 광고가 아닌 경우만 선택
      `#product-list > li[data-id="${targetProduct.productCode}"]:not(:has([class*="AdMark_"])) a[href*="/vp/products/"]`,
      // 2. 폴백: href에 productCode가 있고 rank 파라미터가 있는 경우 (광고는 rank가 없음)
      `a[href*="${targetProduct.productCode}"][href*="&rank="], a[href*="${targetProduct.productCode}"][href*="?rank="]`,
      // 3. 마지막 폴백: 기존 방식 (하지만 광고 체크 추가)
      `a[href*="${targetProduct.productCode}"]`
    ];
    
    for (const selector of productSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          // 광고 여부 재확인 (3번째 선택자를 위한 추가 체크)
          const isAd = await element.evaluate(el => {
            const li = el.closest('li');
            if (!li) return false;
            // AdMark 클래스 체크
            if (li.querySelector('[class*="AdMark_"]')) return true;
            // data-adsplatform 체크
            if (li.querySelector('[data-adsplatform]')) return true;
            // href에 rank 파라미터가 없으면 광고일 가능성
            const href = el.getAttribute('href') || '';
            if (!href.includes('&rank=') && !href.includes('?rank=')) return true;
            return false;
          });
          
          if (isAd) {
            console.log(`${threadPrefix}    ${idPrefix}⚠️ 광고 상품 감지, 건너뜀 (selector: ${selector})`);
            continue; // 광고면 다음 선택자로
          }
          
          // target="_blank"를 target="_self"로 변경 (새 탭 열기 방지)
          await element.evaluate(el => {
            if (el.tagName === 'A') {
              el.setAttribute('target', '_self');
            }
          });
          
          // 클릭 전 현재 URL 저장
          const beforeUrl = page.url();
          await humanClick(page, element);
          
          // 클릭 후 네비게이션 대기 (URL 변경 확인)
          try {
            await page.waitForFunction(
              (oldUrl) => window.location.href !== oldUrl,
              beforeUrl,
              { timeout: 10000 }
            );
            console.log(`${threadPrefix}    ${idPrefix}✅ 클릭 후 네비게이션 성공`);
            clickedSuccessfully = true;
            break;
          } catch (navError) {
            console.log(`${threadPrefix}    ${idPrefix}⚠️ 클릭 후 네비게이션 시간예치`);
            // 다음 선택자로 시도
            continue;
          }
        }
      } catch (err) {
        // 다음 선택자 시도
        continue;
      }
    }
    
    if (!clickedSuccessfully) {
      // 직접 URL 이동으로 폴백
      const fullUrl = targetProduct.link.startsWith('http') 
        ? targetProduct.link 
        : `https://www.coupang.com${targetProduct.link}`;
      
      console.log(`${threadPrefix}    ${idPrefix}⚠️ 클릭 실패, URL 직접 이동: ${fullUrl}`);
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } else {
      // 클릭 성공 시 잠시 대기만
      await page.waitForTimeout(2000);
    }
    
  } catch (error) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 페이지 로드 타임아웃: ${error.message}`);
    console.log(`${threadPrefix}    ${idPrefix}현재 URL: ${page.url()}`);
    
    // 타임아웃이 발생해도 상품 페이지로 이동했는지 확인
    const currentUrl = page.url();
    const isProductPage = currentUrl.includes('/vp/products/') || currentUrl.includes('/vm/products/');
    
    if (isProductPage) {
      console.log(`${threadPrefix}    ${idPrefix}✅ 타임아웃이지만 상품 페이지 도달함`);
      // 상품 페이지에 도달했으므로 계속 진행
    } else {
      throw error;
    }
  }
  
  // 상품 페이지 도달 확인
  const currentUrl = page.url();
  const isProductPage = currentUrl.includes('/vp/products/') || currentUrl.includes('/vm/products/');
  
  if (!isProductPage) {
    // 차단 페이지 확인
    const blocked = await isPageBlocked(page);
    if (blocked.isBlocked) {
      const error = new Error('쿠팡 접속 차단 감지됨');
      error.referer = searchPageUrl;
      throw error;
    }
    
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 상품 페이지가 아님: ${currentUrl}`);
    
    // chrome-error는 네트워크/프록시 문제
    if (currentUrl.includes('chrome-error://')) {
      throw new Error('네트워크 오류 - 상품 페이지 로드 실패');
    }
    
    throw new Error('상품 페이지 도달 실패');
  }
  
  console.log(`${threadPrefix}    ${idPrefix}✅ 상품 페이지 도달`);
  
  // 상품 정보 추출
  let itemId = null;
  let vendorItemId = null;
  let productInfo = {
    name: targetProduct.productName || '',
    rating: targetProduct.rating || null,
    reviewCount: targetProduct.reviewCount || null,
    thumbnailUrl: targetProduct.thumbnailUrl || null,
    productCode: targetProduct.productCode || '',
    url: targetProduct.link.startsWith('http') 
      ? targetProduct.link 
      : `https://www.coupang.com${targetProduct.link}`
  };
  
  try {
    const urlMatch = currentUrl.match(/\/vp\/products\/(\d+)/);
    if (urlMatch) {
      itemId = urlMatch[1];
    }
    
    const vendorMatch = currentUrl.match(/vendorItemId=(\d+)/);
    if (vendorMatch) {
      vendorItemId = vendorMatch[1];
    }
    
    // 상품 제목 추출 (페이지에서)
    try {
      const titleElement = await page.$(SELECTORS.PRODUCT_DETAIL.TITLE);
      if (titleElement) {
        const pageTitle = await titleElement.textContent();
        if (pageTitle && pageTitle.trim()) {
          const title = pageTitle.trim();
          
          // 점검 페이지 감지
          if (title.includes('점검 중') || 
              title.includes('서비스를 위해') || 
              title.includes('잠시만 기다려') ||
              title.includes('더 나은 서비스')) {
            
            console.log(`${threadPrefix}    ${idPrefix}⚠️ 점검 페이지 감지, 새로고침 시도...`);
            
            // 새로고침 시도
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);
            
            // 다시 제목 확인
            const retryTitleElement = await page.$(SELECTORS.PRODUCT_DETAIL.TITLE);
            if (retryTitleElement) {
              const retryTitle = await retryTitleElement.textContent();
              if (retryTitle && !retryTitle.includes('점검') && !retryTitle.includes('서비스')) {
                productInfo.name = retryTitle.trim();
              } else {
                // 여전히 점검 페이지면 에러 처리
                const error = new Error('쿠팡 점검 페이지 - 상품 정보 로드 실패');
                error.errorType = 'maintenance';
                throw error;
              }
            }
          } else {
            productInfo.name = title;
          }
        }
      }
    } catch (e) {
      // 점검 페이지 에러는 상위로 전파
      if (e.errorType === 'maintenance') {
        throw e;
      }
      // 기타 제목 추출 실패는 무시
    }
  } catch (infoError) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 상품 정보 추출 실패: ${infoError.message}`);
  }
  
  return {
    success: true,
    productRank: productRank,
    urlRank: urlRank,
    realRank: targetProduct.cumulativeRealRank || targetProduct.realRank,  // 누적값 우선 사용
    itemId: itemId,
    vendorItemId: vendorItemId,
    productInfo: productInfo,
    referer: searchPageUrl
  };
}

/**
 * 장바구니 클릭 처리
 */
async function handleCart(page, cartClickEnabled, keywordId = null, threadPrefix = '') {
  const idPrefix = createIdPrefix(keywordId);
  let result = { cartClicked: false };
  
  if (!cartClickEnabled) {
    console.log(`${threadPrefix}    ${idPrefix}장바구니 클릭 비활성화됨`);
    return result;
  }
  
  console.log(`${threadPrefix} 🛒 ${idPrefix}장바구니 추가 시도...`);
  
  try {
    const cartResult = await addToCart(page, keywordId);
    result.cartClicked = cartResult.success;
    
    if (cartResult.success) {
      console.log(`${threadPrefix}    ${idPrefix}✅ 장바구니 추가 성공`);
    } else {
      console.log(`${threadPrefix}    ${idPrefix}❌ 장바구니 추가 실패: ${cartResult.error}`);
    }
  } catch (cartError) {
    console.log(`${threadPrefix}    ${idPrefix}❌ 장바구니 처리 오류: ${cartError.message}`);
  }
  
  return result;
}

module.exports = {
  extractProductList,
  findTargetProduct,
  clickProduct,
  handleCart
};