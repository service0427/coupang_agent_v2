/**
 * 자동화 탐지 방지 모듈
 */

/**
 * Chrome 자동화 흔적 제거 스크립트
 */
async function hideAutomationTraces(page) {
  await page.addInitScript(() => {
    // navigator.webdriver 제거
    delete Object.getPrototypeOf(navigator).webdriver;
    
    // Chrome 자동화 흔적 제거
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    
    // Chrome 특정 속성 숨기기
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // plugins 배열 수정
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        }
      ]
    });
    
    // 언어 설정
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en']
    });
    
    // 권한 API 수정
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
}

module.exports = {
  hideAutomationTraces
};