const fs = require('fs');
const { JSDOM } = require('jsdom');

// SAMPLE.md 파일 읽기
const html = fs.readFileSync('./SAMPLE2.md', 'utf8');

// DOM 파싱
const dom = new JSDOM(html);
const document = dom.window.document;

// 헬퍼 함수들
const toNumber = (s) => s ? Number((s+'').replace(/[^\d.]/g,'')) : null;

// 배송 타입 분류 함수 (product-finder.js에서 가져옴)
const getDeliveryType = (imageUrl) => {
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
};

// =====================================================
// 상품 상세 페이지 정보 추출 테스트
// =====================================================

console.log('=== 상품 상세 정보 추출 테스트 ===\n');

// 1. 상품명(title) 추출
const titleElement = document.querySelector('h1.product-title span');
const title = titleElement?.textContent?.trim();
console.log('📄 상품명(title):');
console.log(`   "${title}"`);

// 2. 최종 가격 추출
const priceElement = document.querySelector('.price-amount.final-price-amount');
const priceText = priceElement?.textContent?.trim();
const price = priceText ? priceText.replace(/[^\d]/g, '') : null;
console.log('\n💰 최종 가격:');
console.log(`   원본: "${priceText}"`);
console.log(`   숫자: ${price}원`);

// 3. 배송 뱃지 추출 및 타입 분류
const badgeElement = document.querySelector('.price-badge img');
const deliveryBadgeUrl = badgeElement?.getAttribute('src');
const deliveryType = getDeliveryType(deliveryBadgeUrl);
console.log('\n🚀 배송 뱃지 및 타입:');
console.log(`   이미지 URL: "${deliveryBadgeUrl}"`);
console.log(`   배송 타입: "${deliveryType}"`);

// 4. 카테고리 (breadcrumb) 추출
const breadcrumbElements = Array.from(document.querySelectorAll('ul.breadcrumb li a'));
const categories = breadcrumbElements.map(el => ({
  name: el.textContent?.trim(),
  href: el.getAttribute('href')
})).filter(cat => cat.name); // 빈 텍스트 제거

console.log('\n📂 카테고리 (Breadcrumb):');
console.log(`   총 ${categories.length}개 카테고리 발견`);
categories.forEach((cat, index) => {
  console.log(`   [${index + 1}] ${cat.name} -> ${cat.href}`);
});

// 5. 썸네일 이미지들 추출
const thumbnailImages = Array.from(document.querySelectorAll('ul.twc-static img'))
  .map(img => {
    const src = img.getAttribute('src');
    // //로 시작하는 상대 URL은 https: 프로토콜 추가
    return src?.startsWith('//') ? `https:${src}` : src;
  })
  .filter(src => src); // null/undefined 제거

console.log('\n📸 썸네일 이미지들:');
console.log(`   총 ${thumbnailImages.length}개 이미지 발견`);
thumbnailImages.forEach((url, index) => {
  console.log(`   [${index + 1}] ${url}`);
});

// 6. 품절 상태 및 할인 정보 감지
let isSoldOut = false;
let soldOutText = null;
let soldOutType = 'available'; // 'available', 'temporary_out', 'sold_out'

// 방법 1: JSON-LD에서 SoldOut availability 확인
const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
for (const script of jsonLdScripts) {
  try {
    const data = JSON.parse(script.textContent);
    if (data.offers && data.offers.availability === "https://schema.org/SoldOut") {
      isSoldOut = true;
      break;
    }
  } catch (e) {
    // JSON 파싱 실패 무시
  }
}

// 방법 2: CSS 클래스 확인
if (!isSoldOut) {
  const priceContainer = document.querySelector('.price-container');
  isSoldOut = priceContainer?.classList.contains('sold-out') || false;
}

// 방법 3: 품절 텍스트 확인 및 타입 분류
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

// 방법 4: oos-stylized 클래스 확인 (추가 확인)
if (!isSoldOut) {
  const oosElements = document.querySelectorAll('.oos-stylized');
  isSoldOut = oosElements.length > 0;
  if (isSoldOut) {
    soldOutType = 'sold_out'; // 기본값
  }
}

// 할인 정보 추출
let originalPrice = null;
let discountRate = null;

// 원가 추출 (취소선 가격)
const originalPriceElement = document.querySelector('.price-amount.original-price-amount');
if (originalPriceElement) {
  const originalPriceText = originalPriceElement.textContent?.trim();
  if (originalPriceText) {
    originalPrice = parseInt(originalPriceText.replace(/[^\d]/g, ''));
  }
}

// 할인율 추출
const discountRateElement = document.querySelector('.original-price div[style*="color:#212b36"]');
if (discountRateElement) {
  const discountText = discountRateElement.textContent?.trim();
  if (discountText && discountText.includes('%')) {
    discountRate = parseInt(discountText.replace(/[^\d]/g, ''));
  }
}

console.log('\n🚫 품절 상태:');
console.log(`   품절 여부: ${isSoldOut ? '품절' : '판매중'}`);
console.log(`   품절 타입: ${soldOutType} (available: 판매중, temporary_out: 일시품절, sold_out: 완전품절)`);
console.log(`   품절 텍스트: "${soldOutText || 'N/A'}"`);

console.log('\n💸 할인 정보:');
console.log(`   원가: ${originalPrice ? originalPrice + '원' : 'N/A'}`);
console.log(`   할인율: ${discountRate ? discountRate + '%' : 'N/A'}`);
console.log(`   할인가: ${price ? price + '원' : 'N/A'}`);

// 7. JSON 형태로 결과 정리
const productDetailInfo = {
  title: title || null,
  price: price ? parseInt(price) : null,
  originalPrice: originalPrice,
  discountRate: discountRate,
  deliveryType: deliveryType,
  deliveryBadgeUrl: deliveryBadgeUrl || null,
  categories: categories,
  thumbnailImages: thumbnailImages,
  thumbnailCount: thumbnailImages.length,
  soldOut: isSoldOut,
  soldOutType: soldOutType,
  soldOutText: soldOutText
};

console.log('\n=== JSON 결과 ===');
console.log(JSON.stringify(productDetailInfo, null, 2));

console.log('\n=== 추출 성공 여부 ===');
console.log(`✅ 상품명: ${title ? '성공' : '실패'}`);
console.log(`✅ 가격: ${price ? '성공' : '실패'}`);
console.log(`✅ 할인정보: ${originalPrice && discountRate ? `성공 (${discountRate}% 할인)` : '할인 없음'}`);
console.log(`✅ 배송타입: ${deliveryType ? '성공' : '실패'} (${deliveryType || 'N/A'})`);
console.log(`✅ 카테고리: ${categories.length > 0 ? `성공 (${categories.length}개)` : '실패'}`);
console.log(`✅ 썸네일: ${thumbnailImages.length > 0 ? `성공 (${thumbnailImages.length}개)` : '실패'}`);
console.log(`✅ 품절상태: 성공 (${soldOutType})`);

console.log('\n==============================================');
console.log('기존 상품 목록 추출 테스트 (참고용)');
console.log('==============================================\n');

const pickText = (root, sels) => {
    for (const s of sels) {
        const el = root.querySelector(s);
        const t = el?.textContent?.trim();
        if (t) return t;
    }
    return null;
};

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

const detectDiscountTypes = (li) => {
    const area = li.querySelector('[class*="Price"], [class*="price"]') || li;
    const txt = area.textContent || '';
    const out = [];
    if (/와우할인/.test(txt)) out.push('와우할인');
    if (/쿠폰할인/.test(txt)) out.push('쿠폰할인');
    return out;
};

const getPointBenefit = (li) => {
    const cashBenefit = li.querySelector('[class*="cash-benefit"], [class*="BenefitBadge"]');
    if (cashBenefit) {
        const text = cashBenefit.textContent?.trim();
        if (text) return text;
        const img = cashBenefit.querySelector('img');
        if (img) return img.getAttribute('alt');
    }
    return null;
};

// 상품 추출
const items = document.querySelectorAll('li[class*="ProductUnit"], li[data-id]');
console.log(`총 ${items.length}개 상품 발견\n`);

const products = [];
let realRankCounter = 0;

items.forEach((item, index) => {
    const rank = index + 1;
    
    // 링크 찾기
    const link = item.querySelector('a[href*="/vp/products/"], a');
    if (!link) return;
    
    const href = link.getAttribute('href') || '';
    
    // 상품 코드 추출
    let productCode = item.getAttribute('data-id');
    if (!productCode) {
        const match = href.match(/vendorItemId=(\d+)/);
        if (match) productCode = match[1];
    }
    
    // 광고 여부 확인
    const hasRankParam = href.includes('&rank=') || href.includes('?rank=');
    const isAd = !hasRankParam || !!item.querySelector('[class*="AdMark"]');
    
    if (!isAd) {
        realRankCounter++;
    }
    
    // 상품명 추출
    const nameElement = item.querySelector('[class*="productName"], .name, img');
    const productName = nameElement?.textContent?.trim() || 
                      nameElement?.getAttribute('alt') || '';
    
    // 평점 추출
    let rating = null;
    const ratingElement = item.querySelector('[class*="ProductRating"] [class*="star"]');
    if (ratingElement) {
        const ratingText = ratingElement.textContent.trim();
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
        }
    }
    
    // 리뷰 수 추출
    let reviewCount = 0;
    const reviewElement = item.querySelector('[class*="ratingCount"]');
    if (reviewElement) {
        const reviewText = reviewElement.textContent;
        const reviewMatch = reviewText.match(/\(\s*(\d+(?:,\d+)*)\s*\)/);
        if (reviewMatch) {
            reviewCount = parseInt(reviewMatch[1].replace(/,/g,''));
        }
    }
    
    // 썸네일 URL
    const imgElement = item.querySelector('img');
    const thumbnailUrl = imgElement?.getAttribute('src') || null;
    
    // 품절 체크
    const soldoutElement = item.querySelector('[class*="soldout"]');
    const isSoldout = !!soldoutElement;
    const soldoutText = soldoutElement?.textContent?.trim() || null;
    
    // 가격 정보 (품절시 0원, null이면 0으로 처리)
    const priceValue = toNumber(
        pickText(item, ['strong[class*="priceValue"]', '[class*="Price_priceValue"]', 'strong'])
    );
    const salePrice = isSoldout ? 0 : (priceValue || 0);
    
    // 단가 정보
    const unitInfo = findUnitInfo(item);
    
    // 무료배송/무료반품
    const deliveryBadge = item.querySelector('[class*="TextBadge_delivery"]');
    const shipTxt = item.querySelector('[class*="DeliveryInfo"]')?.textContent || item.textContent || '';
    const freeShip = /무료배송/.test(shipTxt) || !!deliveryBadge;
    const freeReturn = /무료반품/.test(shipTxt);
    
    // 쿠팡픽
    const coupangPick = !!item.querySelector('[class*="coupick"]') || 
                       !!item.querySelector('img[alt="쿠팡추천"]');
    
    // 할인 타입
    const discountTypes = detectDiscountTypes(item);
    
    // 포인트 혜택
    const pointBenefit = getPointBenefit(item);
    
    // 배송 정보
    const deliveryInfo = item.querySelector('[class*="DeliveryInfo"]')?.textContent?.trim() || null;
    
    // 배송 타입 분류
    const shipImg = item.querySelector('[class*="ImageBadge"] img, img[alt*="로켓배송"]');
    const deliveryImageUrl = shipImg?.getAttribute('src') || null;
    
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
        
        // 쿠팡픽은 배송타입이 아니므로 NULL로 분류
        if (imageUrl.includes('coupick')) return null;
        
        // 로켓배송
        if (imageUrl.includes('logo_rocket_large')) return 'ROCKET_DELIVERY';
        
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
    };
    
    const deliveryType = getDeliveryType(deliveryImageUrl);
    
    // URL에서 순위 추출
    const urlRankMatch = href.match(/rank=(\d+)/);
    const urlRank = urlRankMatch ? parseInt(urlRankMatch[1]) : null;
    
    // 광고 상품은 제외
    if (isAd) return;
    
    const product = {
        rank,
        realRank: realRankCounter,
        urlRank,
        productCode,
        productName,
        rating,
        reviewCount,
        thumbnailUrl,
        href,
        salePrice,
        deliveryType
    };
    
    products.push(product);
});

// 결과 출력 (이미 광고 제외됨)
console.log('=== 추출된 상품 정보 (광고 제외, JSON) ===\n');
console.log(JSON.stringify(products, null, 2));

// 통계
const totalItems = items.length;
const nonAdCount = products.length;
const adCount = totalItems - nonAdCount;

// 배송 타입별 통계
const deliveryTypeStats = {};
products.forEach(p => {
    deliveryTypeStats[p.deliveryType] = (deliveryTypeStats[p.deliveryType] || 0) + 1;
});

console.log('\n=== 통계 ===');
console.log(`총 상품: ${totalItems}개`);
console.log(`일반 상품 (광고 제외): ${nonAdCount}개`);
console.log(`광고 상품 (제외됨): ${adCount}개`);

console.log('\n=== 배송 타입 분포 (광고 제외) ===');
Object.entries(deliveryTypeStats).forEach(([type, count]) => {
    const typeDisplay = type === 'null' ? 'NULL (배송뱃지없음)' : type;
    console.log(`${typeDisplay}: ${count}개`);
});

// 배송 이미지 URL 패턴 분석은 더 이상 필요없음 (모든 패턴 확인 완료)