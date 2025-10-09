/**
 * 쿠팡 상품 목록 추출
 * - 페이지에서 상품 목록 추출
 * - 검색 결과 없음 감지
 *
 * Updated: 2025-10-09 - product-finder.js에서 분리
 * Updated: 2025-10-09 - human-behavior 통합 (Akamai 차단 개선)
 */

const { createIdPrefix, waitForSelectorWithFallback } = require('../../utils/common-helpers');
const humanBehavior = require('../../utils/human-behavior');

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
        bodyText.includes('선택하신 필터에 맞는 상품이 없습니다') ||
        bodyText.includes('일치하는 상품이 없습니다')) {
      // 디버깅용: 어떤 메시지가 감지되었는지 반환
      const messages = [];
      if (bodyText.includes('다른 검색어를 입력하시거나 철자와 띄어쓰기를 확인해 보세요')) messages.push('철자확인');
      if (bodyText.includes('검색결과가 없습니다')) messages.push('검색결과없음');
      if (bodyText.includes('선택하신 필터에 맞는 상품이 없습니다')) messages.push('필터매칭없음');
      if (bodyText.includes('일치하는 상품이 없습니다')) messages.push('일치상품없음');
      return { found: true, messages: messages, bodyText: bodyText.substring(0, 300) };
    }
    return { found: false };
  });

  if (noResultsCheck.found) {
    console.log(`${threadPrefix}    ${idPrefix}📭 검색 결과 없음 감지 (${pageNum}페이지)`);
    console.log(`${threadPrefix}    ${idPrefix}   감지된 메시지: ${noResultsCheck.messages.join(', ')}`);
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
    console.log(`${threadPrefix}    ${idPrefix}⚠️ 상품 목록 선택자 타임아웃`);

    // 페이지 상태 분석 (우선순위: 1.차단에러, 2.검색결과없음, 3.product-list 존재)
    const pageContent = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const productList = document.querySelector('#product-list');
      const hasProducts = productList && productList.children.length > 0;

      // 검색 결과 없음 메시지 확인
      const noResultsMessages = [];
      if (bodyText.includes('다른 검색어를 입력하시거나 철자와 띄어쓰기를 확인해 보세요')) noResultsMessages.push('철자확인');
      if (bodyText.includes('검색결과가 없습니다')) noResultsMessages.push('검색결과없음');
      if (bodyText.includes('선택하신 필터에 맞는 상품이 없습니다')) noResultsMessages.push('필터매칭없음');
      if (bodyText.includes('일치하는 상품이 없습니다')) noResultsMessages.push('일치상품없음');

      return {
        title: document.title,
        bodyText: bodyText.substring(0, 200),
        hasProductList: !!productList,
        productCount: hasProducts ? productList.children.length : 0,
        noResults: noResultsMessages.length > 0,
        noResultsMessages: noResultsMessages
      };
    });

    console.log(`${threadPrefix}    ${idPrefix}페이지 분석 결과:`);
    console.log(`${threadPrefix}    ${idPrefix}  제목: ${pageContent.title}`);
    console.log(`${threadPrefix}    ${idPrefix}  product-list: ${pageContent.hasProductList ? '존재' : '없음'} (${pageContent.productCount}개)`);

    // 1순위: HTTP2/SOCKS5 에러 감지 (명확한 차단)
    if (pageContent.bodyText.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
        pageContent.bodyText.includes('ERR_SOCKS_CONNECTION_FAILED') ||
        pageContent.bodyText.includes('사이트에 연결할 수 없음')) {
      console.log(`${threadPrefix}    ${idPrefix}❌ 차단 감지: HTTP2/SOCKS5 에러`);
      const error = new Error('쿠팡 접속 차단 감지됨 (HTTP2_PROTOCOL_ERROR)');
      error.errorType = 'blocked';
      throw error;
    }

    // 2순위: 검색 결과 없음 메시지 (정상 처리)
    if (pageContent.noResults) {
      console.log(`${threadPrefix}    ${idPrefix}📭 검색 결과 없음 감지: ${pageContent.noResultsMessages.join(', ')}`);
      const error = new Error('NO_SEARCH_RESULTS');
      error.errorType = 'no_results';
      error.currentPage = pageNum;
      throw error;
    }

    // 3순위: product-list 존재 여부 (타임아웃이어도 상품 있으면 계속)
    if (pageContent.hasProductList && pageContent.productCount > 0) {
      console.log(`${threadPrefix}    ${idPrefix}✅ 타임아웃이지만 상품 목록 존재 - 계속 진행`);
      // 에러를 throw하지 않고 정상 흐름으로 계속 진행
    } else {
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
          await humanBehavior.randomDelay(page, 'AFTER_LOAD');

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
  console.log(`${threadPrefix}    ${idPrefix}상품 ${products.length}개 발견 (광고 제외)`)

  return products;
}

module.exports = {
  extractProductList
};
