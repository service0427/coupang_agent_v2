/**
 * 쿠팡 상품 상세 정보 추출 핸들러
 * work_type="product_info" 전용 모듈
 * 
 * URL 형식: https://www.coupang.com/vp/products/{product_id}?itemId={item_id}&vendorItemId={vendor_item_id}
 */

const { errorLogger } = require('./api-service');
const { checkIP } = require('../utils/browser-helpers');
const { applyStaticOptimization } = require('../core/optimizer');

/**
 * 배송 타입 분류 함수 (product-finder.js와 동일)
 */
function getDeliveryType(imageUrl) {
  // 이미지가 없으면 NULL
  if (!imageUrl) return null;
  
  // 쿠팡픽은 배송타입이 아니므로 NULL로 분류
  if (imageUrl.includes('coupick')) return null;
  
  // 로켓배송
  if (imageUrl.includes('logo_rocket_large') || imageUrl.includes('rocket_logo')) return 'ROCKET_DELIVERY';
  
  // 로켓프레시
  if (imageUrl.includes('rocket-fresh')) return 'ROCKET_FRESH';
  
  // 로켓직구
  if (imageUrl.includes('global_b')) return 'ROCKET_DIRECT';
  
  // 로켓설치
  if (imageUrl.includes('rocket-install') || imageUrl.includes('rocket_install')) return 'ROCKET_INSTALL';
  
  // 판매자로켓
  if (imageUrl.includes('logoRocketMerchant') || imageUrl.includes('rocket-seller')) return 'ROCKET_SELLER';
  
  // 인식할 수 없는 배송 타입
  return 'GENERAL';
}

/**
 * 상품 상세 정보 추출 함수
 * @param {Page} page - Playwright 페이지 객체
 * @param {Object} productData - 상품 정보 {product_id, item_id, vendor_item_id}
 * @param {string} threadPrefix - 로그 출력용 쓰레드 접두사
 * @returns {Object} 추출된 상품 상세 정보
 */
async function extractProductDetail(page, productData, threadPrefix = '') {
  const { product_id, item_id, vendor_item_id } = productData;
  
  try {
    // URL 생성
    let productUrl = `https://www.coupang.com/vp/products/${product_id}`;
    const urlParams = new URLSearchParams();
    
    if (item_id) urlParams.append('itemId', item_id);
    if (vendor_item_id) urlParams.append('vendorItemId', vendor_item_id);
    
    if (urlParams.toString()) {
      productUrl += `?${urlParams.toString()}`;
    }
    
    console.log(`${threadPrefix}🔗 상품 페이지 접근: ${productUrl}`);
    
    // 페이지 접근
    await page.goto(productUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // 페이지 로딩 대기 (상품 정보가 로드될 때까지)
    await page.waitForTimeout(5000);
    
    console.log(`${threadPrefix}📄 상품 정보 추출 중...`);
    
    // 상품 상세 정보 추출
    const productInfo = await page.evaluate(() => {
      // 0. 상품을 찾을 수 없는 페이지 감지
      const notFoundElement = document.querySelector('.prod-not-find-unknown');
      if (notFoundElement) {
        const notFoundText = notFoundElement.textContent?.trim() || '';
        if (notFoundText.includes('상품을 찾을 수 없습니다') || 
            notFoundText.includes('주소가 잘못 입력 되었거나') ||
            notFoundText.includes('판매 종료 또는 중지')) {
          return {
            title: "상품을 찾을 수 없습니다",
            productNotFound: true,
            price: null,
            originalPrice: null,
            discountRate: null,
            deliveryBadgeUrl: null,
            categories: [],
            thumbnailImages: [],
            soldOut: true,
            soldOutType: 'not_found',
            soldOutText: '판매 종료 또는 중지된 상품'
          };
        }
      }
      
      // 1. 상품명 추출
      const titleElement = document.querySelector('h1.product-title span');
      const title = titleElement?.textContent?.trim() || null;
      
      // 2. 가격 정보 추출
      const priceElement = document.querySelector('.price-amount.final-price-amount');
      const priceText = priceElement?.textContent?.trim();
      const price = priceText ? parseInt(priceText.replace(/[^\d]/g, '')) : null;
      
      // 3. 할인 정보 추출
      let originalPrice = null;
      let discountRate = null;
      
      const originalPriceElement = document.querySelector('.price-amount.original-price-amount');
      if (originalPriceElement) {
        const originalPriceText = originalPriceElement.textContent?.trim();
        if (originalPriceText) {
          originalPrice = parseInt(originalPriceText.replace(/[^\d]/g, ''));
        }
      }
      
      const discountRateElement = document.querySelector('.original-price div[style*="color:#212b36"]');
      if (discountRateElement) {
        const discountText = discountRateElement.textContent?.trim();
        if (discountText && discountText.includes('%')) {
          discountRate = parseInt(discountText.replace(/[^\d]/g, ''));
        }
      }
      
      // 4. 배송 뱃지 추출
      const badgeElement = document.querySelector('.price-badge img');
      const deliveryBadgeUrl = badgeElement?.getAttribute('src') || null;
      
      // 5. 카테고리 추출
      const breadcrumbElements = Array.from(document.querySelectorAll('ul.breadcrumb li a'));
      const categories = breadcrumbElements.map(el => ({
        name: el.textContent?.trim(),
        href: el.getAttribute('href')
      })).filter(cat => cat.name);
      
      // 6. 썸네일 이미지들 추출 - 모든 ul 태그 내부의 img 검색
      const thumbnailImages = Array.from(document.querySelectorAll('ul img'))
        .filter(img => {
          const src = img.getAttribute('src') || '';
          // 썸네일 CDN 패턴만 필터링
          return src.includes('thumbnail') && src.includes('.coupangcdn.com');
        })
        .map(img => {
          const src = img.getAttribute('src');
          return src?.startsWith('//') ? `https:${src}` : src;
        })
        .filter(src => src);
      
      // 7. 품절 상태 감지
      let isSoldOut = false;
      let soldOutText = null;
      let soldOutType = 'available';
      
      // JSON-LD에서 SoldOut 확인
      const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.offers && data.offers.availability === "https://schema.org/SoldOut") {
            isSoldOut = true;
            break;
          }
        } catch (e) {
          // 무시
        }
      }
      
      // CSS 클래스 확인
      if (!isSoldOut) {
        const priceContainer = document.querySelector('.price-container');
        isSoldOut = priceContainer?.classList.contains('sold-out') || false;
      }
      
      // 품절 텍스트 확인 및 타입 분류
      const outOfStockLabel = document.querySelector('.out-of-stock-label');
      if (outOfStockLabel) {
        soldOutText = outOfStockLabel.textContent?.trim();
        if (soldOutText) {
          if (soldOutText.includes('일시품절')) {
            isSoldOut = true;
            soldOutType = 'temporary_out';
          } else if (soldOutText.includes('품절')) {
            isSoldOut = true;
            soldOutType = 'sold_out';
          }
        }
      }
      
      // oos-stylized 클래스 확인 (추가 확인)
      if (!isSoldOut) {
        const oosElements = document.querySelectorAll('.oos-stylized');
        if (oosElements.length > 0) {
          isSoldOut = true;
          soldOutType = 'sold_out';
        }
      }
      
      return {
        title,
        price,
        originalPrice,
        discountRate,
        deliveryBadgeUrl,
        categories,
        thumbnailImages,
        soldOut: isSoldOut,
        soldOutType,
        soldOutText
      };
    });
    
    // 배송 타입 분류
    const deliveryType = getDeliveryType(productInfo.deliveryBadgeUrl);
    
    // 결과 구성
    const result = {
      title: productInfo.title,
      price: productInfo.price,
      originalPrice: productInfo.originalPrice,
      discountRate: productInfo.discountRate,
      deliveryType: deliveryType,
      deliveryBadgeUrl: productInfo.deliveryBadgeUrl,
      categories: productInfo.categories,
      thumbnailImages: productInfo.thumbnailImages,
      thumbnailCount: productInfo.thumbnailImages.length,
      soldOut: productInfo.soldOut,
      soldOutType: productInfo.soldOutType,
      soldOutText: productInfo.soldOutText,
      productNotFound: productInfo.productNotFound || false
    };
    
    // 상품을 찾을 수 없는 페이지인 경우 - 정상 처리하되 특별한 상태로 표시
    if (result.productNotFound) {
      console.log(`${threadPrefix}⚠️ 상품을 찾을 수 없음 - 판매 종료 또는 중지된 상품`);
      return {
        success: true,
        productData: result
      };
    }
    
    // 필수 데이터 유효성 검증 - title이 없으면 페이지 로드 실패로 간주
    if (!result.title) {
      console.log(`${threadPrefix}⚠️ 상품 정보 없음 - 페이지 로드 실패 가능성`);
      console.log(`${threadPrefix}   수집된 데이터: title=${result.title}, price=${result.price}, categories=${result.categories.length}개`);
      
      return {
        success: false,
        productData: {}
      };
    }
    
    console.log(`${threadPrefix}✅ 상품 정보 추출 완료: ${result.title}`);
    console.log(`${threadPrefix}   가격: ${result.price}원, 품절: ${result.soldOutType}, 썸네일: ${result.thumbnailCount}개`);
    
    return {
      success: true,
      productData: result
    };
    
  } catch (error) {
    console.error(`${threadPrefix}❌ 상품 정보 추출 실패: ${error.message}`);
    
    return {
      success: false,
      productData: {}
    };
  }
}

/**
 * 상품 상세 정보 자동화 메인 함수
 * @param {Page} page - Playwright 페이지 객체
 * @param {Object} keywordData - 키워드 데이터 (product_id, item_id, vendor_item_id 포함)
 * @param {Object} options - 추가 옵션
 * @returns {Object} 자동화 실행 결과
 */
async function executeProductDetailExtraction(page, keywordData, options = {}) {
  const startTime = Date.now();
  const threadPrefix = options.threadNumber ? `[${String(options.threadNumber).padStart(2, '0')}] ` : '';
  
  // 최적화 해제 함수
  let releaseOptimization = null;
  
  try {
    // IP 확인
    const actualIpResult = await checkIP(page);
    
    // IP 확인 실패 시 즉시 중단
    if (!actualIpResult || !actualIpResult.success) {
      const errorMsg = actualIpResult?.error || '프록시 연결 실패';
      console.error(`${threadPrefix}❌ 프록시 오류로 작업 중단: ${errorMsg}`);
      
      // 프록시 오류로 즉시 실패 반환
      return {
        success: false,
        productData: {},
        actualIp: actualIpResult,
        executionTime: Date.now() - startTime
      };
    }
    
    const actualIp = actualIpResult.ip;
    console.log(`${threadPrefix}🌐 현재 IP: ${actualIp}`);
    
    // 정적 최적화 적용 (이미지 차단 등)
    console.log(`${threadPrefix}🚀 이미지 최적화 적용 중...`);
    releaseOptimization = await applyStaticOptimization(page, null, keywordData, options);
    
    // 상품 정보 구성
    const productData = {
      product_id: keywordData.product_id,
      item_id: keywordData.item_id,
      vendor_item_id: keywordData.vendor_item_id
    };
    
    // 상품 상세 정보 추출
    const extractionResult = await extractProductDetail(page, productData, threadPrefix);
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // 단순한 응답 구조
    return {
      success: extractionResult.success,
      productData: extractionResult.productData || {},
      actualIp: actualIpResult,  // 객체 형태로 유지 (api-mode.js의 extractIpFromResult가 처리)
      executionTime: executionTime
    };
    
  } catch (error) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    console.error(`${threadPrefix}❌ 상품 상세 정보 추출 실행 실패: ${error.message}`);
    
    // 실패 시 단순한 응답
    return {
      success: false,
      productData: {},
      actualIp: await checkIP(page).catch(() => null),  // 에러 시에도 객체 형태 유지
      executionTime: executionTime
    };
  } finally {
    // 최적화 해제
    if (releaseOptimization) {
      try {
        const optimizationStats = await releaseOptimization();
        console.log(`${threadPrefix}📊 최적화 통계: 차단 ${optimizationStats.blockedCount}개, 허용 ${optimizationStats.allowedCount}개`);
      } catch (e) {
        console.error(`${threadPrefix}⚠️ 최적화 해제 실패: ${e.message}`);
      }
    }
  }
}

module.exports = {
  executeProductDetailExtraction,
  extractProductDetail,
  getDeliveryType
};