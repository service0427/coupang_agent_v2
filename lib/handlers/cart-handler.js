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
    // 장바구니 버튼 대기
    const cartSelector = 'button.prod-cart-btn';
    
    await page.waitForSelector(cartSelector, { timeout: 3000 });
    
    // JavaScript로 직접 클릭
    console.log(`   ${idPrefix}JavaScript로 장바구니 버튼 클릭...`);
    await page.evaluate(() => {
      const btn = document.querySelector('button.prod-cart-btn');
      if (btn) btn.click();
    });
    
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