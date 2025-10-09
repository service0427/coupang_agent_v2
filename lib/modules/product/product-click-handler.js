/**
 * 쿠팡 상품 클릭 및 처리
 * - 타겟 상품 찾기
 * - 상품 클릭 및 페이지 이동
 * - DOM 재시도 로직
 *
 * Updated: 2025-10-09 - product-finder.js에서 분리
 * Updated: 2025-10-09 - human-behavior 통합 (Akamai 차단 개선)
 */

const { humanClick } = require('../../utils/human-click');
const { createIdPrefix, isPageBlocked } = require('../../utils/common-helpers');
const humanBehavior = require('../../utils/human-behavior');

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
  console.log(`${threadPrefix}    ${idPrefix}   ├─ product_id: ${productCode}`);
  if (vendorItemId !== null && vendorItemId !== undefined) {
    console.log(`${threadPrefix}    ${idPrefix}   ├─ vendor_item_id: ${vendorItemId}`);
  }
  if (itemId !== null && itemId !== undefined) {
    console.log(`${threadPrefix}    ${idPrefix}   ├─ item_id: ${itemId}`);
  }
  console.log(`${threadPrefix}    ${idPrefix}   └─ 검색 대상 상품 수: ${products.length}개`);
  
  let found = null;
  let matchType = '';
  
  // 1순위: product_id AND vendor_item_id AND item_id 모두 일치
  if (productCode && vendorItemId !== null && vendorItemId !== undefined && itemId !== null && itemId !== undefined) {
    found = products.find(p => 
      p.productCode === productCode &&
      p.vendorItemId === String(vendorItemId) &&
      p.itemId === String(itemId)
    );
    if (found) matchType = 'product_id + vendor_item_id + item_id (완전 일치)';
  }
  
  // 2순위: product_id AND vendor_item_id 일치
  if (!found && productCode && vendorItemId !== null && vendorItemId !== undefined) {
    found = products.find(p => 
      p.productCode === productCode &&
      p.vendorItemId === String(vendorItemId)
    );
    if (found) matchType = 'product_id + vendor_item_id';
  }
  
  // 3순위: product_id만 일치
  if (!found && productCode) {
    found = products.find(p => p.productCode === productCode);
    if (found) matchType = 'product_id';
  }
  
  // 4순위: vendor_item_id만 일치
  if (!found && vendorItemId !== null && vendorItemId !== undefined) {
    found = products.find(p => p.vendorItemId === String(vendorItemId));
    if (found) matchType = 'vendor_item_id';
  }
  
  // 5순위: item_id만 일치
  if (!found && itemId !== null && itemId !== undefined) {
    found = products.find(p => p.itemId === String(itemId));
    if (found) matchType = 'item_id';
  }
  
  if (found) {
    console.log(`${threadPrefix}    ${idPrefix}✅ 대상 상품 발견!`);
    console.log(`${threadPrefix}    ${idPrefix}   매칭 타입: ${matchType}`);
    console.log(`${threadPrefix}    ${idPrefix}   상품명: ${found.productName}`);
    console.log(`${threadPrefix}    ${idPrefix}   순위: ${found.rank}위 (실제: ${found.realRank}위)`);
    console.log(`${threadPrefix}    ${idPrefix}   매칭된 상품 정보:`);
    console.log(`${threadPrefix}    ${idPrefix}   ├─ product_id: ${found.productCode || 'null'} ${matchType.includes('product_id') ? '✓' : ''}`);
    console.log(`${threadPrefix}    ${idPrefix}   ├─ vendor_item_id: ${found.vendorItemId || 'null'} ${matchType.includes('vendor_item_id') ? '✓' : ''}`);
    console.log(`${threadPrefix}    ${idPrefix}   └─ item_id: ${found.itemId || 'null'} ${matchType.includes('item_id') ? '✓' : ''}`);
    return found;
  }
  
  // 매칭 실패 - 모든 ID로 찾을 수 없는 경우
  console.log(`${threadPrefix}    ${idPrefix}❌ 상품을 찾을 수 없습니다.`);
  console.log(`${threadPrefix}    ${idPrefix}   시도한 ID들:`);
  console.log(`${threadPrefix}    ${idPrefix}   ├─ product_id: ${productCode}`);
  if (vendorItemId !== null && vendorItemId !== undefined) {
    console.log(`${threadPrefix}    ${idPrefix}   ├─ vendor_item_id: ${vendorItemId}`);
  }
  if (itemId !== null && itemId !== undefined) {
    console.log(`${threadPrefix}    ${idPrefix}   └─ item_id: ${itemId}`);
  }
  
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

            // 페이지 완전 로드 대기 (DOM과 리소스 모두)
            console.log(`${threadPrefix}    ${idPrefix}⏳ 페이지 완전 로드 대기 중...`);
            try {
              await page.waitForLoadState('networkidle', { timeout: 30000 });
              console.log(`${threadPrefix}    ${idPrefix}✅ 페이지 로딩 완료`);
            } catch (loadError) {
              console.log(`${threadPrefix}    ${idPrefix}⚠️ 로드 상태 대기 시간초과, 계속 진행`);
              // 최소 대기라도 하자
              await page.waitForTimeout(2000);
            }

            // 클릭 직전 target 속성 강제 변경 (새창/새탭 방지)
            console.log(`${threadPrefix}    ${idPrefix}🔧 target 속성 강제 변경 중...`);
            const targetChangeResult = await page.evaluate((selector) => {
              // 먼저 전체 페이지의 모든 _blank 제거
              const allLinks = document.querySelectorAll('a[target="_blank"]');
              allLinks.forEach(link => {
                link.removeAttribute('target');
                link.target = '_self';
                // 추가로 rel 속성도 제거 (noopener, noreferrer 등)
                link.removeAttribute('rel');
              });
              
              // 특정 엘리먼트 재확인
              const el = document.querySelector(selector);
              if (el && el.tagName === 'A') {
                const originalTarget = el.getAttribute('target');
                
                // 강력한 변경
                el.removeAttribute('target');
                el.target = '_self';
                el.removeAttribute('rel');
                
                // onclick 이벤트 제거 (새창 열기 함수일 수 있음)
                if (el.onclick) {
                  el.onclick = null;
                }
                
                // 이벤트 리스너도 제거
                const newEl = el.cloneNode(true);
                newEl.target = '_self';
                el.parentNode.replaceChild(newEl, el);
                
                const finalTarget = newEl.getAttribute('target');
                
                return {
                  changed: true,
                  original: originalTarget,
                  final: finalTarget || '_self',
                  success: true
                };
              }
              return { changed: false, success: false };
            }, selector);
            
            if (targetChangeResult.changed) {
              console.log(`${threadPrefix}    ${idPrefix}✅ target 변경 완료: ${targetChangeResult.original || 'none'} → ${targetChangeResult.final}`);
            }

            // 변경된 엘리먼트 다시 찾기
            const newElement = await page.$(selector);
            if (!newElement) {
              console.log(`${threadPrefix}    ${idPrefix}⚠️ target 변경 후 엘리먼트를 찾을 수 없음`);
              continue;
            }

            // 추가 안전장치: 페이지 전체 새창 방지
            await page.evaluate(() => {
              // window.open 오버라이드
              window.open = function(url) {
                window.location.href = url;
                return window;
              };
            });

            // 클릭 전 자연스러운 행동 (호버 + 스크롤)
            await humanBehavior.beforeProductClick(page, newElement);

            // 클릭 전 현재 URL 저장
            const beforeUrl = page.url();
            console.log(`${threadPrefix}    ${idPrefix}👆 상품 클릭 실행 (URL: ${beforeUrl})`);
            await humanClick(page, newElement);
            
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
        console.log(`${threadPrefix}    ${idPrefix}❌ 모든 클릭 시도 실패`);
        console.log(`${threadPrefix}    ${idPrefix}💡 팁: 페이지 구조가 변경되었을 수 있습니다.`);
        
        // 클릭 실패는 에러로 처리
        const clickError = new Error('상품 클릭 실패 - 모든 시도 실패');
        clickError.errorType = 'click_failed';
        throw clickError;
      }
      
      // 클릭 성공 시 잠시 대기
      await page.waitForTimeout(2000);
      
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
  
  // 페이지 완전 로드 대기 (타임아웃에 관대하게)
  try {
    console.log(`${threadPrefix}    ${idPrefix}⏳ 상품 페이지 완전 로드 대기 중...`);
    await page.waitForLoadState('load', { timeout: 30000 });
    console.log(`${threadPrefix}    ${idPrefix}✅ 상품 페이지 로드 완료`);
    
    // 추가로 장바구니 버튼이 나타날 때까지 잠시 대기
    await page.waitForTimeout(2000);
  } catch (loadError) {
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 페이지 로드 타임아웃 - 하지만 계속 진행`);
    // 타임아웃이 발생해도 실패로 처리하지 않고 계속 진행
  }
  
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

module.exports = {
  findTargetProduct,
  retryOnDOMDetachment,
  clickProduct
};
