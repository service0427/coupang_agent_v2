/**
 * 쿠팡 페이지네이션 핸들러
 * - 다음 페이지로 이동
 * - 마지막 페이지 감지
 */

/**
 * 다음 페이지로 이동
 * @returns {boolean} 이동 성공 여부
 */
async function moveToNextPage(page) {
  console.log(`   상품을 찾지 못했습니다. 다음 페이지로 이동...`);
  
  // 심플하고 안정적인 셀렉터 사용
  const nextButton = await page.$('a[title="다음"]');
  
  if (nextButton) {
    console.log(`   다음 페이지로 이동 중...`);
    
    // 현재 URL 저장
    const currentUrl = page.url();
    
    // 버튼 클릭
    await nextButton.click();
    await page.waitForTimeout(3000);
    
    // URL 변경 확인
    const newUrl = page.url();
    if (currentUrl === newUrl) {
      console.log(`   ⚠️ 페이지가 변경되지 않았습니다. 마지막 페이지일 수 있습니다.`);
      return false;
    }
    
    return true;
  } else {
    // a 태그가 없으면 span 확인 (마지막 페이지)
    const disabledNext = await page.$('span[title="다음"]');
    if (disabledNext) {
      console.log(`   ℹ️ 마지막 페이지입니다`);
    } else {
      console.log(`   ❌ 다음 버튼을 찾을 수 없습니다`);
    }
    return false;
  }
}

module.exports = {
  moveToNextPage
};