/**
 * 쿠팡 장바구니 처리
 * - 장바구니 클릭
 * - 장바구니 추가
 *
 * Updated: 2025-10-09 - product-finder.js에서 분리
 * Updated: 2025-12-01 - 장바구니 클릭 전 자연스러운 행동 추가 (human-simulation)
 */

const { createIdPrefix } = require('../../utils/common-helpers');
const humanSimulation = require('../../utils/human-simulation');

/**
 * 장바구니 처리 함수
 */
async function handleCart(page, cartClickEnabled, keywordId = null, threadPrefix = '') {
  const result = {
    cartButtonVisible: false,
    cartClicked: false
  };

  const idPrefix = createIdPrefix(keywordId);

  if (!cartClickEnabled) {
    console.log(`${threadPrefix}    ${idPrefix}장바구니 클릭 비활성화됨`);
    return result;
  }

  console.log(`${threadPrefix} 🛒 ${idPrefix}장바구니 추가 시도...`);

  try {
    const cartResult = await addToCart(page, keywordId);
    result.cartButtonVisible = cartResult.buttonVisible;
    result.cartClicked = cartResult.success;

    // 버튼이 보이면 일단 성공으로 간주
    if (cartResult.buttonVisible) {
      console.log(`${threadPrefix}    ${idPrefix}✅ 장바구니 버튼 확인 (핵심 성공 지표)`);

      if (cartResult.success) {
        console.log(`${threadPrefix}    ${idPrefix}✅ 장바구니 담기도 성공`);
      } else {
        console.log(`${threadPrefix}    ${idPrefix}⚠️ 장바구니 담기는 실패했지만 버튼은 확인됨`);
      }
    } else {
      console.log(`${threadPrefix}    ${idPrefix}❌ 장바구니 버튼을 찾을 수 없음`);
    }
  } catch (cartError) {
    console.log(`${threadPrefix}    ${idPrefix}❌ 장바구니 처리 오류: ${cartError.message}`);
  }

  return result;
}

/**
 * 장바구니 담기 함수
 */

async function addToCart(page, keywordId = null, actionLogger = null) {
  const result = {
    success: false,
    message: '',
    buttonVisible: false  // 버튼 가시성 추가
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
    
    // 장바구니 버튼이 보임 - 이것만으로도 중요한 성공 지표
    result.buttonVisible = true;
    console.log(`   ${idPrefix}✅ 장바구니 버튼 확인됨`)
    
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

    // v2: 장바구니 클릭 전 자연스러운 행동 (상세 페이지 탐색)
    console.log(`   ${idPrefix}🧭 상세 페이지 탐색 중...`);
    try {
      const cartButton = await page.$(cartSelector);
      if (cartButton) {
        await humanSimulation.naturalBeforeCartClick(page, cartButton);
      }
    } catch (simError) {
      console.log(`   ${idPrefix}⚠️ 탐색 중 오류 (계속 진행): ${simError.message}`);
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
  handleCart,
  addToCart
};
