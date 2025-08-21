/**
 * 쿠팡 페이지네이션 핸들러
 * - 다음 페이지로 이동
 * - 마지막 페이지 감지
 */

/**
 * 다음 페이지로 이동
 * @param {Page} page - Playwright 페이지 객체
 * @param {number} currentPageNum - 현재 페이지 번호
 * @param {string} threadPrefix - 쓰레드 프리픽스 (선택)
 * @returns {Object} 이동 결과 객체 {success: boolean}
 */
async function moveToNextPage(page, currentPageNum = 1, threadPrefix = '') {
  // 로그 제거 - 호출하는 쪽에서 처리
  
  try {
    // 프록시 리다이렉트 감지 (192.168.x.x)
    const currentUrl = page.url();
    if (currentUrl.includes('192.168.') || currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      console.log(`${threadPrefix}   ⚠️ 프록시 리다이렉트 감지: ${currentUrl}`);
      console.log(`${threadPrefix}   ❌ 네트워크 연결 문제로 페이지 이동 불가`);
      
      // 탭 닫기 시도
      const pages = await page.context().pages();
      if (pages.length > 1) {
        for (const p of pages) {
          const url = p.url();
          if (url.includes('192.168.') || url.includes('localhost') || url.includes('127.0.0.1')) {
            console.log(`${threadPrefix}   🔧 리다이렉트 탭 닫기: ${url}`);
            await p.close().catch(() => {});
          }
        }
      }
      
      return { success: false, error: 'proxy_redirect' };
    }
    
    // 심플하고 안정적인 셀렉터 사용
    const nextButton = await page.$('a[title="다음"]');
    
    if (nextButton) {
      // 버튼 클릭
      await nextButton.click();
      
      // 단순 대기 방식
      await page.waitForTimeout(3000);
      
      // URL 변경 확인
      const newUrl = page.url();
      
      // 클릭 후 프록시 리다이렉트 감지
      if (newUrl.includes('192.168.') || newUrl.includes('localhost') || newUrl.includes('127.0.0.1')) {
        console.log(`${threadPrefix}   ⚠️ 페이지 이동 중 프록시 리다이렉트 발생`);
        return { success: false, error: 'proxy_redirect' };
      }
      
      // URL이 변경되었거나 페이지 번호가 증가했는지 확인
      const pageChanged = currentUrl !== newUrl || newUrl.includes('page=');
      
      if (pageChanged) {
        // 성공 로그도 제거 - 호출하는 쪽에서 페이지 번호 표시
        return { success: true };
      } else {
        console.log(`${threadPrefix}   ⚠️ 페이지가 변경되지 않았습니다. 마지막 페이지일 수 있습니다.`);
        return { success: false };
      }
    } else {
      // a 태그가 없으면 span 확인 (마지막 페이지)
      const disabledNext = await page.$('span[title="다음"]');
      if (disabledNext) {
        console.log(`${threadPrefix}   ℹ️ 마지막 페이지입니다`);
      } else {
        console.log(`${threadPrefix}   ❌ 다음 버튼을 찾을 수 없습니다`);
      }
      return { success: false };
    }
  } catch (error) {
    console.log(`${threadPrefix}   ❌ 페이지 이동 중 오류: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  moveToNextPage
};