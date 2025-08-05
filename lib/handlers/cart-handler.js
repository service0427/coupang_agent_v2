/**
 * 장바구니 처리 핸들러
 */

async function addToCart(page, keywordId = null) {
  const result = {
    success: false,
    message: ''
  };
  
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';

  try {
    // 페이지 로드 대기
    await page.waitForTimeout(1000);
    
    // 장바구니 버튼 찾기 (대기하지 않고 바로 찾기)
    const cartSelector = 'button.prod-cart-btn';
    const hasCartButton = await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      return btn !== null;
    }, cartSelector);
    
    if (!hasCartButton) {
      result.message = '장바구니 버튼을 찾을 수 없음';
      console.log(`   ${idPrefix}⚠️ 장바구니 버튼을 찾을 수 없음`);
      return result;
    }
    
    // JavaScript로 직접 클릭
    console.log(`   ${idPrefix}JavaScript로 장바구니 버튼 클릭...`);
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('button.prod-cart-btn');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    
    if (!clicked) {
      result.message = '장바구니 버튼 클릭 실패 (비활성화 상태)';
      console.log(`   ${idPrefix}⚠️ 장바구니 버튼 클릭 실패`);
      return result;
    }
    
    // 클릭 후 3초 대기
    console.log(`   ${idPrefix}⏳ 장바구니 처리를 위해 3초 대기...`);
    await page.waitForTimeout(3000);
    
    result.success = true;
    result.message = '장바구니 담기 성공';
    console.log(`   ${idPrefix}✅ 장바구니 담기 완료`);
    
  } catch (error) {
    result.message = error.message;
    console.error(`   ${idPrefix}❌ 장바구니 담기 실패:`, error.message);
  }

  return result;
}

module.exports = {
  addToCart
};