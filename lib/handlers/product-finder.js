/**
 * 쿠팡 상품 검색 및 클릭 핸들러 V2
 * - 상품 목록에서 특정 상품 찾기
 * - 랜덤 상품 선택
 * - 상품 클릭 처리
 * - V2 상태 기반 로깅 시스템 적용
 */

const { addToCart } = require('./cart-handler');
const errorLogger = require('../services/error-logger');
const { humanClick } = require('../utils/human-click');
const { SELECTORS, DYNAMIC_SELECTORS } = require('../config/selectors');
const { createIdPrefix, safeWait, waitForSelectorWithFallback, isPageBlocked } = require('../utils/common-helpers');
const { ActionStatus, ActionType } = require('../constants/action-status');
const { ExecutionStatus } = require('../constants/execution-status');

/**
 * 페이지에서 상품 목록 추출
 */
async function extractProductList(page, productCode, keywordId = null, actionLogger = null) {
  const idPrefix = createIdPrefix(keywordId);
  let actionId = null;
  
  // 액션 로깅 시작
  if (actionLogger) {
    actionId = await actionLogger.startAction(
      ActionType.PRODUCT_SEARCH, 
      SELECTORS.PRODUCT_LIST.CONTAINER,
      {
        detail: { productCode, timeout: 10000 },
        processStep: 'find_product'
      }
    );
  }
  
  try {
    // 상품 목록 요소 대기
    if (actionLogger && actionId) {
      await actionLogger.updateActionStatus(actionId, ActionStatus.ELEMENT_WAITING, {
        message: '상품 목록 컨테이너 대기 중'
      });
    }
    
    await waitForSelectorWithFallback(page, SELECTORS.PRODUCT_LIST.CONTAINER, { timeout: 10000 }, keywordId);
    
    // 요소 발견됨
    if (actionLogger && actionId) {
      await actionLogger.updateActionStatus(actionId, ActionStatus.ELEMENT_FOUND, {
        message: '상품 목록 컨테이너 발견'
      });
    }
    
  } catch (error) {
    console.log(`   ${idPrefix}⚠️ 상품 목록을 찾을 수 없습니다.`);
    
    // 페이지 상태 분석
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body?.innerText?.substring(0, 200) || ''
      };
    });
    
    console.log(`   ${idPrefix}페이지 제목: ${pageContent.title}`);
    console.log(`   ${idPrefix}페이지 내용: ${pageContent.bodyText}`);
    
    // 액션 실패 로깅
    if (actionLogger && actionId) {
      await actionLogger.updateActionStatus(actionId, ActionStatus.ERROR_ELEMENT, {
        message: '상품 목록 컨테이너를 찾을 수 없음',
        pageTitle: pageContent.title,
        pageContent: pageContent.bodyText
      });
    }
    
    throw new Error('상품 목록 로드 실패');
  }
  
  // 상품 데이터 추출 시작
  if (actionLogger && actionId) {
    await actionLogger.updateActionStatus(actionId, ActionStatus.DATA_EXTRACTING, {
      message: '상품 데이터 추출 중'
    });
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
  
  // 추출 완료
  if (actionLogger && actionId) {
    await actionLogger.updateActionStatus(actionId, ActionStatus.SUCCESS, {
      message: `상품 ${products.length}개 추출 완료`,
      productCount: products.length
    });
  }
  
  return products;
}

/**
 * 타겟 상품 찾기 또는 랜덤 선택
 */
function findTargetProduct(products, productCode, keywordId = null, actionLogger = null) {
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
async function clickProduct(page, targetProduct, productCode, pageNum, productsPerPage, keywordId = null, actionLogger = null, executionLogger = null) {
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
  
  // 상품 클릭 액션 시작
  let clickActionId = null;
  if (actionLogger) {
    const targetCode = productCode || targetProduct.code;
    clickActionId = await actionLogger.startAction(
      ActionType.PRODUCT_CLICK,
      `product_${targetCode}`,
      {
        detail: {
          productCode: targetCode,
          rank: productRank,
          urlRank,
          productName: targetProduct.productName
        },
        processStep: 'click_product'
      }
    );
  }
  
  console.log(`🖱️ 상품 클릭 중...`);
  
  // 상품 클릭 (더 정확한 선택자 사용)
  let productSelector;
  if (productCode) {
    productSelector = DYNAMIC_SELECTORS.getProductLinkByCode(productCode);
  } else {
    productSelector = DYNAMIC_SELECTORS.getProductLinkByCode(targetProduct.code);
  }
  
  console.log(`   사용할 선택자: ${productSelector}`);
  
  // 요소 찾기 상태 업데이트
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_WAITING, {
      message: '상품 링크 요소 검색 중',
      selector: productSelector
    });
  }
  
  // 상품 링크 찾기
  const productLink = await page.$(productSelector);
  if (!productLink) {
    console.log(`❌ 상품 링크를 찾을 수 없습니다: ${productSelector}`);
    
    if (actionLogger && clickActionId) {
      await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_NOT_FOUND, {
        message: '상품 링크 요소를 찾을 수 없음',
        selector: productSelector
      });
    }
    
    throw new Error('상품 링크 누락');
  }
  
  // 요소 발견
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_FOUND, {
      message: '상품 링크 요소 발견'
    });
  }
  
  // target="_self"로 설정하여 새 탭 방지
  await productLink.evaluate(el => el.setAttribute('target', '_self'));
  
  // 클릭 준비 완료
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.ELEMENT_CLICKABLE, {
      message: '클릭 준비 완료'
    });
  }
  
  // Promise.all로 네비게이션 대기와 사람처럼 클릭 동시 수행
  console.log(`   [클릭 시도] 상품 페이지로 이동 중...`);
  
  // 클릭 시도 상태
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.CLICKING, {
      message: '상품 클릭 시도 중'
    });
  }
  
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }),
      humanClick(page, productLink, keywordId)
    ]);
    
    // 클릭 완료
    if (actionLogger && clickActionId) {
      await actionLogger.updateActionStatus(clickActionId, ActionStatus.CLICKED, {
        message: '클릭 완료'
      });
    }
    
    console.log(`   [네비게이션 성공] domcontentloaded 이벤트 수신`);
  } catch (navError) {
    // humanClick 에러인지 네비게이션 에러인지 구분
    if (navError.message.includes('boundingBox') || navError.message.includes('보이지 않습니다')) {
      console.log(`   ${idPrefix}⚠️ 클릭 실패: ${navError.message}`);
      
      // 클릭 실패 상태 업데이트
      if (actionLogger && clickActionId) {
        await actionLogger.updateActionStatus(clickActionId, ActionStatus.ERROR_ELEMENT, {
          message: `클릭 실패: ${navError.message}`
        });
      }
      
      // 대체 클릭 방법 시도
      try {
        console.log(`   ${idPrefix}🔄 대체 클릭 방법 시도 (기본 click)...`);
        
        if (actionLogger && clickActionId) {
          await actionLogger.updateActionStatus(clickActionId, ActionStatus.RETRY_CLICKING, {
            message: '대체 클릭 방법 시도 중'
          });
        }
        
        await productLink.click({ delay: 100 });
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
        
        if (actionLogger && clickActionId) {
          await actionLogger.updateActionStatus(clickActionId, ActionStatus.CLICKED, {
            message: '대체 클릭 성공'
          });
        }
        
        console.log(`   ${idPrefix}✅ 대체 클릭 성공`);
      } catch (fallbackError) {
        console.log(`   ${idPrefix}❌ 대체 클릭도 실패: ${fallbackError.message}`);
        
        if (actionLogger && clickActionId) {
          await actionLogger.updateActionStatus(clickActionId, ActionStatus.ERROR_CRITICAL, {
            message: `대체 클릭도 실패: ${fallbackError.message}`
          });
        }
        
        throw navError;
      }
    } else {
      // 네비게이션 타임아웃이지만 실제로 페이지가 이동했는지 확인
      const currentUrl = page.url();
      if (currentUrl.includes('/vp/products/')) {
        console.log(`   [네비게이션 경고] 타임아웃이지만 상품 페이지로 이동됨`);
        console.log(`   현재 URL: ${currentUrl}`);
        
        // 부분 성공으로 상태 업데이트
        if (actionLogger && clickActionId) {
          await actionLogger.updateActionStatus(clickActionId, ActionStatus.PARTIAL_SUCCESS, {
            message: '네비게이션 타임아웃이지만 페이지 이동 완료',
            currentUrl
          });
        }
        
        // 계속 진행
      } else {
        console.log(`   [네비게이션 실패] 상품 페이지로 이동하지 못함`);
        console.log(`   현재 URL: ${currentUrl}`);
        
        if (actionLogger && clickActionId) {
          await actionLogger.updateActionStatus(clickActionId, ActionStatus.ERROR_NAVIGATION, {
            message: '페이지 이동 실패',
            currentUrl
          });
        }
        
        throw navError;
      }
    }
  }
  
  console.log(`   ${idPrefix}⏳ 상품 페이지 로딩 안정화 대기 중...`);
  
  // 네비게이션 검증 상태
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.NAVIGATING, {
      message: '페이지 이동 검증 중'
    });
  }
  
  // URL 확인만으로 충분
  const currentUrl = page.url();
  if (!currentUrl.includes('/vp/products/')) {
    console.log(`   ${idPrefix}❌ 상품 페이지로 이동 실패`);
    console.log(`   ${idPrefix}현재 URL: ${currentUrl}`);
    
    if (actionLogger && clickActionId) {
      await actionLogger.updateActionStatus(clickActionId, ActionStatus.ERROR_NAVIGATION, {
        message: '상품 페이지 URL 확인 실패',
        currentUrl
      });
    }
    
    throw new Error('상품 페이지 이동 실패');
  }
  
  // URL 검증 성공
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.PAGE_REACHED, {
      message: '상품 페이지 도달 확인',
      currentUrl
    });
  }
  
  // 페이지 로딩 상태 추적
  if (actionLogger && clickActionId) {
    await actionLogger.updateActionStatus(clickActionId, ActionStatus.DOM_READY, {
      message: 'DOM 로드 대기 중'
    });
  }
  
  // waitForLoadState 대신 더 안정적인 대기 방식 사용
  try {
    // 상품 페이지의 핵심 요소가 로드될 때까지 대기
    await page.waitForSelector(SELECTORS.PRODUCT_DETAIL.TITLE, { timeout: 10000 });
    console.log(`   ${idPrefix}[페이지 로드] 상품 제목 요소 확인됨`);
    
    // 페이지 완전 로드 상태
    if (actionLogger && clickActionId) {
      await actionLogger.updateActionStatus(clickActionId, ActionStatus.LOADED, {
        message: '상품 페이지 완전 로드 완료'
      });
    }
    
  } catch (e) {
    // 차단 재확인
    const isBlockedAfterWait = await isPageBlocked(page);
    if (isBlockedAfterWait) {
      console.log(`   ${idPrefix}🚫 쿠팡 접속 차단 감지!`);
      console.log(`   ${idPrefix}⏳ 3초 후 종료됩니다...`);
      
      // 차단 상태 업데이트
      if (actionLogger && clickActionId) {
        await actionLogger.updateActionStatus(clickActionId, ActionStatus.ERROR_BLOCKED, {
          message: '쿠팡 접속 차단 감지'
        });
      }
      
      await page.waitForTimeout(3000);
      throw new Error('쿠팡 접속 차단 (ERR_HTTP2_PROTOCOL_ERROR)');
    }
    
    console.log(`   ${idPrefix}[페이지 로드 경고] 상품 제목을 찾을 수 없지만 계속 진행`);
    
    // 부분 로드 상태
    if (actionLogger && clickActionId) {
      await actionLogger.updateActionStatus(clickActionId, ActionStatus.PARTIAL_SUCCESS, {
        message: '상품 제목 요소 없음, 부분 로드'
        
      });
    }
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
  
  // 클릭 액션 성공 완료
  if (actionLogger && clickActionId) {
    await actionLogger.completeAction(clickActionId, {
      success: true,
      currentUrl: finalUrl,
      pageTitle: await page.title(),
      elementVisible: true,
      elementClickable: true,
      itemId,
      vendorItemId
    });
  }
  
  // 실행 로거 상태 업데이트
  if (executionLogger) {
    await executionLogger.updateExecutionStatus(ExecutionStatus.PRODUCT_CLICKED, {
      message: '상품 클릭 완료, 상품 페이지 도달'
    });
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
async function handleCart(page, cartClickEnabled, keywordId = null, actionLogger = null, executionLogger = null) {
  const idPrefix = createIdPrefix(keywordId);
  const result = {
    cartClicked: false
  };
  
  if (cartClickEnabled) {
    // 장바구니 액션 시작
    let cartActionId = null;
    if (actionLogger) {
      cartActionId = await actionLogger.startAction(
        ActionType.CART_CLICK,
        'add_to_cart',
        {
          detail: { timeout: 10000 },
          processStep: 'add_cart'
        }
      );
    }
    
    console.log(`\n${idPrefix}🛒 장바구니 담기 시도 중...`);
    
    const cartResult = await addToCart(page, keywordId);
    result.cartClicked = cartResult.success;
    
    if (cartResult.success) {
      console.log(`   ${idPrefix}✅ 장바구니 담기 성공`);
      
      // 장바구니 성공 상태
      if (actionLogger && cartActionId) {
        await actionLogger.completeAction(cartActionId, {
          success: true,
          message: '장바구니 담기 성공'
        });
      }
      
      // 실행 완료 상태
      if (executionLogger) {
        await executionLogger.updateExecutionStatus(ExecutionStatus.SUCCESS, {
          message: '장바구니 담기 성공'
        });
      }
      
    } else {
      console.log(`   ${idPrefix}⚠️ 장바구니 담기 실패: ${cartResult.message}`);
      
      // 장바구니 실패 상태
      if (actionLogger && cartActionId) {
        await actionLogger.completeAction(cartActionId, {
          success: false,
          errorMessage: cartResult.message
        });
      }
      
      // 부분 성공 상태 (상품 페이지까지는 성공)
      if (executionLogger) {
        await executionLogger.updateExecutionStatus(ExecutionStatus.PARTIAL_SUCCESS, {
          message: '장바구니 담기 실패, 상품 페이지 도달까지는 성공'
        });
      }
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