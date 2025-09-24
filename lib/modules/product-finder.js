/**
 * 쿠팡 상품 검색 및 클릭 핸들러 - DB 코드 제거 버전
 * - 상품 목록에서 특정 상품 찾기
 * - 상품 클릭 처리
 * 
 * Updated: 2025-08-23
 * - URL rank 파라미터 기반 광고 구분
 * - 배송 타입 enum 분류 추가
 * - 필드 최적화 (11개 필드)
 */

// cart-handler.js 통합됨
const { errorLogger } = require('./api-service');
const { humanClick } = require('../utils/human-click');
const { createIdPrefix, safeWait, waitForSelectorWithFallback, isPageBlocked } = require('../utils/common-helpers');

/**
 * 페이지에서 상품 목록 추출
 */
async function extractProductList(page, productCode, keywordId = null, threadPrefix = '', pageNum = 1) {
  const idPrefix = createIdPrefix(keywordId);

  // 먼저 검색 결과 없음 메시지 체크
  const noResultsCheck = await page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    // 쿠팡의 검색 결과 없음 메시지 감지
    if (bodyText.includes('다른 검색어를 입력하시거나 철자와 띄어쓰기를 확인해 보세요') ||
        bodyText.includes('검색결과가 없습니다') ||
        bodyText.includes('선택하신 필터에 맞는 상품이 없습니다.') ||
        bodyText.includes('일치하는 상품이 없습니다')) {
      return true;
    }
    return false;
  });

  if (noResultsCheck) {
    console.log(`${threadPrefix}    ${idPrefix}📭 검색 결과 없음 - 쿠팡에서 결과를 찾을 수 없음`);
    const error = new Error('NO_SEARCH_RESULTS');
    error.errorType = 'no_results';
    error.currentPage = pageNum;
    throw error;
  }

  try {
    // 2페이지 이상에서는 선택자 로그 숨김
    await waitForSelectorWithFallback(page, '#product-list', {
      timeout: 30000,  // 30초로 증가
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
      console.log(`${threadPrefix}    ${idPrefix}⚠️ 점검 페이지 감지, 최대 3회 새로고침 시도...`);
      
      // 최대 3회 새로고침 시도
      let retryCount = 0;
      const maxRetries = 3;
      let lastError = null;
      
      while (retryCount < maxRetries) {
        retryCount++;
        console.log(`${threadPrefix}    ${idPrefix}🔄 새로고침 시도 ${retryCount}/${maxRetries}...`);
        
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        // 다시 시도 (silent 옵션 유지)
        try {
          await waitForSelectorWithFallback(page, '#product-list', {
            timeout: 30000,  // 30초로 증가
            silent: pageNum > 1
          }, keywordId);
          // 성공하면 루프 탈출
          console.log(`${threadPrefix}    ${idPrefix}✅ ${retryCount}번째 새로고침 성공`);
          break;
        } catch (retryError) {
          lastError = retryError;
          if (retryCount < maxRetries) {
            console.log(`${threadPrefix}    ${idPrefix}⚠️ ${retryCount}번째 실패, 재시도...`);
            await page.waitForTimeout(2000); // 재시도 전 대기
          }
        }
      }
      
      // 3회 모두 실패한 경우
      if (retryCount >= maxRetries && lastError) {
        console.log(`${threadPrefix}    ${idPrefix}❌ ${maxRetries}회 새로고침 실패`);
        throw new Error('상품 목록 로드 실패 (점검 페이지 지속)');
      }
    } else {
      throw new Error('상품 목록 로드 실패');
    }
  }
  
  // 상품 검색 (더 정확한 선택자 사용, 평점/리뷰수 추출 기능 추가)
  const products = await page.$$eval('#product-list > li[data-id], #product-list > li', (items, data) => {
    const { targetCode, productLinkSelector, productNameSelector } = data;
    let realRankCounter = 0; // 광고 제외 실제 순위 카운터
    
    // ========== 헬퍼 함수들 (crawler.js에서 가져옴) ==========
    const toNumber = (s) => s ? Number((s+'').replace(/[^\d.]/g,'')) : null;
    
    const pickText = (root, sels) => {
      for (const s of sels) {
        const el = root.querySelector(s);
        const t = el?.textContent?.trim();
        if (t) return t;
      }
      return null;
    };
    
    // 단가 정보 찾기 (예: "1세트당 1,770원")
    const findUnitInfo = (li) => {
      const scope = li.querySelector('[class*="Price"], [class*="price"]') || li;
      const nodes = scope.querySelectorAll('span, div, p, strong, em');
      for (const el of nodes) {
        const t = el.textContent?.replace(/\s+/g,' ').trim();
        const m = t && t.match(/\(([^()]*?당)\s*([\d,]+)\s*원\)/);
        if (m) {
          return {
            unitLabel: m[1],
            unitPrice: Number(m[2].replace(/,/g,''))
          };
        }
      }
      return null;
    };
    
    // 할인 타입 감지
    const detectDiscountTypes = (li) => {
      const area = li.querySelector('[class*="Price"], [class*="price"]') || li;
      const txt = area.innerText || '';
      const out = [];
      if (/와우할인/.test(txt)) out.push('와우할인');
      if (/쿠폰할인/.test(txt)) out.push('쿠폰할인');
      return out;
    };
    
    // 포인트 혜택 추출 - 더 유연한 선택자
    const getPointBenefit = (li) => {
      // BenefitBadge_cash-benefit__ 클래스 패턴 매칭
      const cashBenefit = li.querySelector('[class*="cash-benefit"], [class*="BenefitBadge"]');
      if (cashBenefit) {
        const text = cashBenefit.textContent?.trim();
        if (text) return text;
        const img = cashBenefit.querySelector('img');
        if (img) return img.getAttribute('alt');
      }
      return null;
    };
    
    // img src/srcset에서 URL 추출
    const pickUrlFromImg = (img) => {
      const src = img.getAttribute('src') || '';
      if (src) return src;
      const srcset = img.getAttribute('srcset') || '';
      if (!srcset) return '';
      const last = srcset.split(',').pop().trim();
      return last.split(' ')[0];
    };
    
    // ========== 메인 로직 ==========
    return items.map((item, index) => {
      const link = item.querySelector(productLinkSelector);
      if (!link) return null;
      
      const href = link.getAttribute('href') || link.href || '';
      const rank = index + 1;
      
      // URL에서 상품 코드 추출 (공통 패턴 사용)
      let extractedCode = null;
      const match = href.match(/\/vp\/products\/(\d+)/);
      if (match) {
        extractedCode = match[1];
      }
      
      // 광고 여부 확인 - URL rank 파라미터가 핵심
      // 일반 상품은 무조건 &rank= 또는 ?rank= 파라미터를 가짐
      const hasRankParam = href.includes('&rank=') || href.includes('?rank=');
      const isAd = !hasRankParam || !!item.querySelector('[class*="AdMark"]');
      
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
      
      // ========== 추가 상품 정보 추출 (crawler.js에서 가져옴) ==========
      
      // 품절 상품 체크
      const soldoutElement = item.querySelector('[class*="soldoutText"]');
      const isSoldout = !!soldoutElement;
      const soldoutText = soldoutElement?.textContent?.trim() || null;
      
      // 가격 정보 (품절시 0원)
      const priceValue = toNumber(
        pickText(item, ['strong[class*="priceValue"]', '[class*="Price_priceValue"]', 'strong'])
      );
      const salePrice = isSoldout ? 0 : (priceValue || 0);
      
      // 단가 정보 제거 - 필요없음
      
      // 불필요한 필드들 제거
      
      // 배송 타입 분류
      const shipImg = item.querySelector('[class^="ImageBadge_default_"] > img');
      const deliveryImageUrl = shipImg ? shipImg.getAttribute('src') : null;
      
      // 이미지 URL을 enum 값으로 매핑
      // 확인된 패턴:
      // - logo_rocket_large: 로켓배송
      // - rocket-fresh: 로켓프레시  
      // - global_b: 로켓직구
      // - rocket-install/rocket_install: 로켓설치
      // - logoRocketMerchant: 판매자로켓
      const getDeliveryType = (imageUrl) => {
        // 이미지가 없으면 NULL
        if (!imageUrl) return null;
        
        // 로켓배송
        if (imageUrl.includes('logo_rocket_large')) return 'ROCKET_DELIVERY';
        
        // 로켓프레시
        if (imageUrl.includes('rocket-fresh')) return 'ROCKET_FRESH';
        
        // 로켓직구
        if (imageUrl.includes('global_b')) return 'ROCKET_DIRECT';
        
        // 로켓설치
        if (imageUrl.includes('rocket-install') || imageUrl.includes('rocket_install')) return 'ROCKET_INSTALL';
        
        // 판매자로켓
        if (imageUrl.includes('logoRocketMerchant')) return 'ROCKET_SELLER';
        
        // 인식할 수 없는 배송 타입
        return 'GENERAL';
      };
      
      const deliveryType = getDeliveryType(deliveryImageUrl);
      
      // 불필요한 필드 제거
      
      // 광고 상품은 제외
      if (isAd) return null;
      
      // URL에서 순위 추출
      const urlRankMatch = href.match(/rank=(\d+)/);
      const urlRank = urlRankMatch ? parseInt(urlRankMatch[1]) : null;  // 0도 유효한 값
      
      // URL에서 itemId와 vendorItemId 추출
      const itemIdMatch = href.match(/itemId=(\d+)/);
      const vendorItemIdMatch = href.match(/vendorItemId=(\d+)/);
      const itemId = itemIdMatch ? itemIdMatch[1] : null;
      const vendorItemId = vendorItemIdMatch ? vendorItemIdMatch[1] : null;
      
      return {
        rank: rank,
        realRank: realRankCounter,
        urlRank: urlRank,
        productCode: extractedCode,
        productName: productName,
        rating: rating,
        reviewCount: reviewCount,
        thumbnailUrl: thumbnailUrl,
        href: href,
        salePrice: salePrice,
        deliveryType: deliveryType,
        itemId: itemId,  // itemId 추가
        vendorItemId: vendorItemId,  // vendorItemId 추가
        // 내부적으로 사용하는 추가 필드들 (외부 API에는 노출하지 않음)
        urlParams: href.split('?')[1] || '',
        rankInPage: rank
      };
    }).filter(product => product !== null); // 광고 제외된 결과만 반환
  }, {
    targetCode: productCode,
    productLinkSelector: 'a[href*="/vp/products/"], a.search-product-link',
    productNameSelector: '[class*="ProductUnit_productName"]'
  });
  
  // 모든 상품이 비광고 (광고는 이미 필터링됨)
  console.log(`${threadPrefix}    ${idPrefix}상품 ${products.length}개 발견 (광고 제외)`);
  
  // 추출된 모든 상품 코드 표시 (디버깅용 - 전체 표시)
  const extractedCodes = products
    .filter(p => p.productCode) // 코드가 있는 것만 (이미 광고 제외됨)
    .map(p => p.productCode);
  
  if (extractedCodes.length > 0) {
    console.log(`${threadPrefix}    ${idPrefix}📦 추출된 상품코드 (${extractedCodes.length}개)`);
    // console.log(`${threadPrefix}    ${idPrefix}📦 추출된 상품코드 (${extractedCodes.length}개): ${extractedCodes.join(', ')}`);
  } else {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 추출된 상품코드 없음 (URL 패턴 불일치 가능성)`);
    
    // URL 패턴 분석 - 처음 3개 상품의 URL 샘플 표시
    const urlSamples = products.slice(0, 3).map(p => p.link).filter(link => link);
    if (urlSamples.length > 0) {
      console.log(`${threadPrefix}    ${idPrefix}🔗 URL 샘플 (패턴 확인용):`);
      urlSamples.forEach((url, idx) => {
        console.log(`${threadPrefix}    ${idPrefix}   [${idx+1}] ${url}`);
      });
    }
  }
  
  return products;
}

/**
 * 대상 상품 찾기 (특정 상품 코드만 지원)
 */
function findTargetProduct(products, productCode, keywordId = null, threadPrefix = '', itemId = null, vendorItemId = null) {
  const idPrefix = createIdPrefix(keywordId);
  
  if (!products || products.length === 0) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 추출된 상품이 없습니다.`);
    return null;
  }
  
  if (!productCode) {
    console.log(`${threadPrefix}    ${idPrefix}❌ 상품 코드가 없습니다. 상품 코드는 필수입니다.`);
    return null;
  }
  
  // [DEBUG] 매칭 시도 로깅 - 더 명확하게
  console.log(`${threadPrefix}    ${idPrefix}🎯 찾는 대상 상품:`);
  console.log(`${threadPrefix}    ${idPrefix}   ├─ product_id: ${productCode} (필수)`);
  if (itemId !== null) {
    console.log(`${threadPrefix}    ${idPrefix}   ├─ item_id: ${itemId}`);
  }
  if (vendorItemId !== null) {
    console.log(`${threadPrefix}    ${idPrefix}   ├─ vendor_item_id: ${vendorItemId}`);
  }
  console.log(`${threadPrefix}    ${idPrefix}   └─ 검색 대상 상품 수: ${products.length}개`);
  
  // product_id만 매칭하는 첫 번째 상품 찾기 (쿠팡 옵션 롤링 대응)
  const found = products.find(p => p.productCode === productCode);
  
  if (found) {
    console.log(`${threadPrefix}    ${idPrefix}✅ 대상 상품 발견: ${found.productName} (${found.rank}순위, 실제: ${found.realRank}순위)`);
    console.log(`${threadPrefix}    ${idPrefix}   매칭된 상품 정보:`);
    console.log(`${threadPrefix}    ${idPrefix}   ├─ product_id: ${found.productCode} ✓`);
    console.log(`${threadPrefix}    ${idPrefix}   ├─ item_id: ${found.itemId || 'null'} (참고용)`);
    console.log(`${threadPrefix}    ${idPrefix}   └─ vendor_item_id: ${found.vendorItemId || 'null'} (참고용)`);
    return found;
  }
  
  // 매칭 실패 - product_id가 없는 경우
  console.log(`${threadPrefix}    ${idPrefix}❌ product_id(${productCode})와 일치하는 상품이 없습니다.`);
  
  console.log(`${threadPrefix}    ${idPrefix}❌ 최종 결과: 대상 상품을 찾을 수 없습니다.`);
  
  // 유사한 상품 코드 확인 (부분 일치)
  const partialMatches = products.filter(p => {
    if (!p.productCode) return false;
    const code = p.productCode.toString();
    const target = productCode.toString();
    return code.includes(target.substring(0, 6)) || target.includes(code.substring(0, 6));
  });
  
  if (partialMatches.length > 0) {
    console.log(`${threadPrefix}    ${idPrefix}🔍 유사 상품코드 발견:`);
    partialMatches.slice(0, 3).forEach(p => {
      console.log(`${threadPrefix}    ${idPrefix}   - ${p.productCode}: ${p.productName.substring(0, 30)}...`);
    });
  }
  
  return null;
}

/**
 * DOM 엘리먼트 분리 에러에 대한 재시도 로직
 */
async function retryOnDOMDetachment(page, operation, maxRetries = 3, threadPrefix = '', keywordId = null) {
  const idPrefix = createIdPrefix(keywordId);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isDetachmentError = error.message.includes('Element is not attached to the DOM') ||
                                error.message.includes('Node is detached from document');
      
      if (isDetachmentError && attempt < maxRetries) {
        console.log(`${threadPrefix}    ${idPrefix}⚠️ DOM 엘리먼트 분리 감지, 새로고침 후 재시도 (${attempt}/${maxRetries})`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000); // 페이지 로드 대기
        continue;
      }
      
      // 마지막 시도거나 다른 에러인 경우 원본 에러 던지기
      throw error;
    }
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
  // urlRank가 가장 정확한 전체 순위 (쿠팡이 제공하는 공식 순위)
  const displayRank = urlRank || productRank;
  console.log(`${threadPrefix}    ${idPrefix}순위: ${displayRank}위 (페이지 ${pageNum}, ${targetProduct.rank}번째)`);
  console.log(`${threadPrefix}    ${idPrefix}실제 순위: ${targetProduct.cumulativeRealRank || targetProduct.realRank}위 (광고 제외)`);
  if (targetProduct.productName) {
    console.log(`${threadPrefix}    ${idPrefix}상품명: ${targetProduct.productName}`);
  }
  console.log(`${threadPrefix} `);
  
  // 상품 클릭
  console.log(`${threadPrefix} 🖱️ ${idPrefix}상품 클릭 중...`);
  
  // 클릭 전 검색 페이지 URL 저장 (referer로 사용)
  const searchPageUrl = page.url();
  
  try {
    // DOM 엘리먼트 분리 에러 재시도 로직 적용
    const result = await retryOnDOMDetachment(page, async () => {
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
            const targetChanged = await element.evaluate(el => {
              if (el.tagName === 'A') {
                const originalTarget = el.getAttribute('target');
                el.setAttribute('target', '_self');

                // 변경 확인을 위해 재검증
                const newTarget = el.getAttribute('target');
                return {
                  changed: originalTarget !== newTarget,
                  original: originalTarget,
                  current: newTarget
                };
              }
              return { changed: false };
            });

            // 변경사항 로깅
            if (targetChanged.changed) {
              console.log(`${threadPrefix}    ${idPrefix}🔄 target 속성 변경: ${targetChanged.original} → ${targetChanged.current}`);
            }

            // DOM 변경사항이 반영되도록 짧은 대기
            await page.waitForTimeout(100);

            // target 속성 재확인 (부하 상황 대응)
            const targetVerified = await element.evaluate(el => {
              if (el.tagName === 'A') {
                const currentTarget = el.getAttribute('target');
                // 여전히 _blank면 다시 설정
                if (currentTarget === '_blank') {
                  el.setAttribute('target', '_self');
                  el.removeAttribute('target'); // 속성 자체를 제거하는 것도 시도
                  el.target = '_self'; // 직접 프로퍼티 설정도 시도
                }
                return el.getAttribute('target') !== '_blank';
              }
              return true;
            });

            if (!targetVerified) {
              console.log(`${threadPrefix}    ${idPrefix}⚠️ target 속성 변경 실패, 재시도 중...`);
              // 한 번 더 시도
              await element.evaluate(el => {
                if (el.tagName === 'A') {
                  el.target = '_self';
                  el.onclick = null; // onclick 이벤트도 제거
                }
              });
              await page.waitForTimeout(200); // 조금 더 대기
            }

            // 클릭 전 현재 URL 저장
            const beforeUrl = page.url();
            await humanClick(page, element);
            
            // 클릭 후 네비게이션 대기 (URL 변경 확인)
            try {
              await page.waitForFunction(
                (oldUrl) => window.location.href !== oldUrl,
                beforeUrl,
                { timeout: 30000 }  // 30초로 증가
              );
              console.log(`${threadPrefix}    ${idPrefix}✅ 클릭 후 네비게이션 성공`);
              clickedSuccessfully = true;
              break;
            } catch (navError) {
              console.log(`${threadPrefix}    ${idPrefix}⚠️ 클릭 후 네비게이션 시간초과`);
              // 다음 선택자로 시도
              continue;
            }
          }
        } catch (err) {
          // DOM 분리 에러는 상위로 전파하여 재시도 처리
          if (err.message.includes('Element is not attached to the DOM')) {
            throw err;
          }
          // 기타 에러는 다음 선택자 시도
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
      
      return clickedSuccessfully;
    }, 3, threadPrefix, keywordId);
    
  } catch (error) {
    // DOM 분리 에러가 3회 재시도 후에도 실패한 경우
    if (error.message.includes('Element is not attached to the DOM')) {
      console.log(`${threadPrefix}    ${idPrefix}❌ DOM 엘리먼트 분리 에러: 3회 재시도 후에도 실패`);
      // product_not_found가 아닌 다른 에러로 분류
      const domError = new Error('DOM 엘리먼트 접근 실패 - 페이지 상태 불안정');
      domError.errorType = 'dom_instability';
      throw domError;
    }
    
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
    url: targetProduct.href.startsWith('http') 
      ? targetProduct.href 
      : `https://www.coupang.com${targetProduct.href}`
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
      const titleElement = await page.$('.prod-buy-header__title, h1');
      if (titleElement) {
        const pageTitle = await titleElement.textContent();
        if (pageTitle && pageTitle.trim()) {
          const title = pageTitle.trim();
          
          // 점검 페이지 감지
          if (title.includes('점검 중') || 
              title.includes('서비스를 위해') || 
              title.includes('잠시만 기다려') ||
              title.includes('더 나은 서비스')) {
            
            console.log(`${threadPrefix}    ${idPrefix}⚠️ 상품 페이지 점검 감지, 최대 3회 새로고침 시도...`);
            
            // 최대 3회 새로고침 시도
            let retryCount = 0;
            const maxRetries = 3;
            let successTitle = null;
            
            while (retryCount < maxRetries) {
              retryCount++;
              console.log(`${threadPrefix}    ${idPrefix}🔄 상품 페이지 새로고침 ${retryCount}/${maxRetries}...`);
              
              await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForTimeout(2000 + retryCount * 1000); // 점진적 대기 시간 증가
              
              // 다시 제목 확인
              const retryTitleElement = await page.$('.prod-buy-header__title, h1');
              if (retryTitleElement) {
                const retryTitle = await retryTitleElement.textContent();
                if (retryTitle && !retryTitle.includes('점검') && !retryTitle.includes('서비스')) {
                  successTitle = retryTitle.trim();
                  console.log(`${threadPrefix}    ${idPrefix}✅ ${retryCount}번째 새로고침으로 상품 페이지 로드 성공`);
                  break;
                }
              }
              
              if (retryCount < maxRetries) {
                console.log(`${threadPrefix}    ${idPrefix}⚠️ ${retryCount}번째 여전히 점검 페이지`);
              }
            }
            
            if (successTitle) {
              productInfo.name = successTitle;
            } else {
              // 3회 모두 실패한 경우
              console.log(`${threadPrefix}    ${idPrefix}❌ ${maxRetries}회 새로고침 후에도 점검 페이지 지속`);
              const error = new Error('쿠팡 점검 페이지 - 상품 정보 로드 실패');
              error.errorType = 'maintenance';
              throw error;
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
    productRank: urlRank || productRank,  // urlRank가 있으면 우선 사용 (쿠팡 공식 순위)
    urlRank: urlRank,
    realRank: targetProduct.cumulativeRealRank || targetProduct.realRank,  // 누적값 우선 사용 (광고 제외)
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

// =====================================================
// cart-handler.js에서 통합
// =====================================================

async function addToCart(page, keywordId = null, actionLogger = null) {
  const result = {
    success: false,
    message: ''
  };
  
  const idPrefix = createIdPrefix(keywordId);
  let cartActionId = null;

  // 장바구니 액션 시작
  if (actionLogger) {
    cartActionId = await actionLogger.startAction(
      ActionType.CART_CLICK,
      'button.prod-cart-btn',
      {
        detail: { timeout: 20000 },  // 20초로 증가
        processStep: 'add_cart'
      }
    );
  }

  try {
    // 페이지 로드 대기
    await page.waitForTimeout(1000);
    
    // 장바구니 버튼 찾기 상태
    if (actionLogger && cartActionId) {
      await actionLogger.updateActionStatus(cartActionId, ActionStatus.ELEMENT_WAITING, {
        message: '장바구니 버튼 검색 중'
      });
    }
    
    // 장바구니 버튼 찾기 (대기하지 않고 바로 찾기)
    const cartSelector = 'button.prod-cart-btn';
    const hasCartButton = await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      return btn !== null;
    }, cartSelector);
    
    if (!hasCartButton) {
      result.message = '장바구니 버튼을 찾을 수 없음';
      console.log(`   ${idPrefix}⚠️ 장바구니 버튼을 찾을 수 없음`);
      
      // 장바구니 버튼 없음 상태
      if (actionLogger && cartActionId) {
        await actionLogger.updateActionStatus(cartActionId, ActionStatus.ELEMENT_NOT_FOUND, {
          message: '장바구니 버튼을 찾을 수 없음',
          selector: cartSelector
        });
      }
      
      return result;
    }
    
    // 장바구니 버튼 발견
    if (actionLogger && cartActionId) {
      await actionLogger.updateActionStatus(cartActionId, ActionStatus.ELEMENT_FOUND, {
        message: '장바구니 버튼 발견'
      });
    }
    
    // 클릭 가능 상태 확인
    const buttonState = await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      if (!btn) return { exists: false };
      return {
        exists: true,
        disabled: btn.disabled,
        visible: btn.offsetParent !== null,
        text: btn.textContent?.trim() || ''
      };
    }, cartSelector);
    
    if (!buttonState.visible) {
      result.message = '장바구니 버튼이 보이지 않음';
      
      if (actionLogger && cartActionId) {
        await actionLogger.updateActionStatus(cartActionId, ActionStatus.ELEMENT_NOT_VISIBLE, {
          message: '장바구니 버튼이 보이지 않음'
        });
      }
      
      return result;
    }
    
    if (buttonState.disabled) {
      result.message = '장바구니 버튼이 비활성화 상태';
      
      if (actionLogger && cartActionId) {
        await actionLogger.updateActionStatus(cartActionId, ActionStatus.ELEMENT_NOT_CLICKABLE, {
          message: '장바구니 버튼이 비활성화됨'
        });
      }
      
      return result;
    }
    
    // 클릭 가능 상태 확인
    if (actionLogger && cartActionId) {
      await actionLogger.updateActionStatus(cartActionId, ActionStatus.ELEMENT_CLICKABLE, {
        message: '장바구니 버튼 클릭 가능',
        buttonText: buttonState.text
      });
    }
    
    // JavaScript로 직접 클릭
    console.log(`   ${idPrefix}JavaScript로 장바구니 버튼 클릭...`);
    
    // 클릭 시도 상태
    if (actionLogger && cartActionId) {
      await actionLogger.updateActionStatus(cartActionId, ActionStatus.CLICKING, {
        message: '장바구니 버튼 클릭 시도'
      });
    }
    
    const clicked = await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    }, cartSelector);
    
    if (!clicked) {
      result.message = '장바구니 버튼 클릭 실패 (비활성화 상태)';
      console.log(`   ${idPrefix}⚠️ 장바구니 버튼 클릭 실패`);
      
      if (actionLogger && cartActionId) {
        await actionLogger.updateActionStatus(cartActionId, ActionStatus.ERROR_CLICK, {
          message: '장바구니 버튼 클릭 실패'
        });
      }
      
      return result;
    }
    
    // 클릭 성공
    if (actionLogger && cartActionId) {
      await actionLogger.updateActionStatus(cartActionId, ActionStatus.CLICKED, {
        message: '장바구니 버튼 클릭 성공'
      });
    }
    
    // 장바구니 담기 알림 감지 (최대 3초 대기)
    console.log(`   ${idPrefix}⏳ 장바구니 알림 대기...`);
    
    // 처리 대기 상태
    if (actionLogger && cartActionId) {
      await actionLogger.updateActionStatus(cartActionId, ActionStatus.PROCESSING, {
        message: '장바구니 처리 대기 중'
      });
    }
    
    // 장바구니 알림 요소 선택자들
    const notifierSelectors = [
      '.prod-order-notifier', // 메인 알림 컨테이너
      'div:has(> p.prod-order-notifier-content)', // 알림 내용이 있는 div
      'p:has-text("상품이 장바구니에 담겼습니다")', // 알림 텍스트
      'a[href*="cart.coupang.com/cartView"]' // 장바구니 바로가기 링크
    ];
    
    let notifierFound = false;
    const maxWaitTime = 3000;
    const checkInterval = 200;
    const startTime = Date.now();
    
    // 알림 요소 감지 시도
    while (Date.now() - startTime < maxWaitTime && !notifierFound) {
      for (const selector of notifierSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const isVisible = await element.isVisible().catch(() => false);
            if (isVisible) {
              notifierFound = true;
              console.log(`   ${idPrefix}✓ 장바구니 알림 감지됨 (${Date.now() - startTime}ms)`);
              break;
            }
          }
        } catch (e) {
          // 선택자 확인 실패는 무시
        }
      }
      
      if (!notifierFound) {
        await page.waitForTimeout(checkInterval);
      }
    }
    
    // 알림을 찾지 못한 경우 추가 대기
    if (!notifierFound) {
      const remainingTime = maxWaitTime - (Date.now() - startTime);
      if (remainingTime > 0) {
        console.log(`   ${idPrefix}⏳ 알림 미감지, ${remainingTime}ms 추가 대기...`);
        await page.waitForTimeout(remainingTime);
      }
    }
    
    result.success = true;
    result.message = '장바구니 담기 성공';
    console.log(`   ${idPrefix}✅ 장바구니 담기 완료`);
    
    // 장바구니 성공 상태
    if (actionLogger && cartActionId) {
      await actionLogger.completeAction(cartActionId, {
        success: true,
        elementVisible: true,
        elementClickable: true,
        currentUrl: page.url(),
        pageTitle: await page.title()
      });
    }
    
  } catch (error) {
    result.message = error.message;
    console.error(`   ${idPrefix}❌ 장바구니 담기 실패:`, error.message);
    
    // 장바구녀 에러 상태
    if (actionLogger && cartActionId) {
      await actionLogger.completeAction(cartActionId, {
        success: false,
        errorType: ActionStatus.ERROR_UNKNOWN,
        errorMessage: error.message
      });
    }
  }

  return result;
}

module.exports = {
  extractProductList,
  findTargetProduct,
  clickProduct,
  handleCart,
  addToCart
};