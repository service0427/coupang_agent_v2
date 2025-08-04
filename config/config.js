/**
 * Chrome 전용 설정 파일
 */

const config = {
  // Chrome 브라우저 설정
  chrome: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--password-store=basic',
      '--use-mock-keychain',
      '--force-color-profile=srgb'
    ]
  },
  
  // 기본 설정
  defaultTimeout: 30000,
  navigationTimeout: 60000,
  
  // 쿠팡 관련 설정
  coupang: {
    baseUrl: 'https://www.coupang.com',
    searchUrl: 'https://www.coupang.com/np/search',
    selectors: {
      searchInput: 'input[name="q"]',
      productList: '#product-list',
      productItem: 'li.search-product',
      productLink: 'a.search-product-link',
      cartButton: '.prod-buy-btn__cart',
      autocomplete: '.search-dropdown'
    }
  }
};

module.exports = config;