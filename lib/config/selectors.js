/**
 * 쿠팡 사이트 CSS 선택자 중앙 관리
 * 사이트 변경 시 이 파일만 수정하면 전체 적용됨
 */

const SELECTORS = {
  // 검색 관련
  SEARCH: {
    INPUT: 'input[name="q"]',
    RESULTS_CONTAINER: '#product-list'
  },

  // 상품 목록 관련
  PRODUCT_LIST: {
    CONTAINER: '#product-list',
    ITEMS: '#product-list > li[data-id], #product-list > li',
    PRODUCT_LINK: 'a[href*="/vp/products/"], a.search-product-link',
    PRODUCT_NAME: '.name'
  },

  // 상품 상세 페이지 관련
  PRODUCT_DETAIL: {
    TITLE: '.prod-buy-header__title, h1',
    CART_BUTTON: 'button.prod-cart-btn'
  },

  // 일반적인 페이지 요소
  COMMON: {
    LOADING_INDICATOR: '.loading, .spinner',
    ERROR_MESSAGE: '.error-message, .alert'
  }
};

/**
 * 동적 선택자 생성 함수들
 */
const DYNAMIC_SELECTORS = {
  /**
   * 특정 상품 코드를 가진 링크 선택자 생성
   * @param {string} productCode - 상품 코드
   * @returns {string} CSS 선택자
   */
  getProductLinkByCode: (productCode) => {
    return `a[href*="/vp/products/${productCode}"]`;
  },

  /**
   * 특정 ID를 가진 요소 선택자 생성
   * @param {string} id - 요소 ID
   * @returns {string} CSS 선택자
   */
  getElementById: (id) => {
    return `#${id}`;
  },

  /**
   * 특정 클래스를 가진 요소 선택자 생성
   * @param {string} className - 클래스 이름
   * @returns {string} CSS 선택자
   */
  getByClass: (className) => {
    return `.${className}`;
  }
};

/**
 * 선택자 검증 함수
 * @param {string} selector - 검증할 선택자
 * @returns {boolean} 유효한 선택자인지 여부
 */
function isValidSelector(selector) {
  try {
    document.querySelector(selector);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 대체 선택자 목록
 * 기본 선택자가 작동하지 않을 때 사용할 대체 선택자들
 */
const FALLBACK_SELECTORS = {
  SEARCH_INPUT: [
    'input[name="q"]',
    'input[placeholder*="검색"]',
    'input.search-input',
    '#searchInput'
  ],
  
  PRODUCT_LINKS: [
    'a[href*="/vp/products/"]',
    'a.search-product-link', 
    'a.product-link',
    '.product-item a'
  ],
  
  CART_BUTTON: [
    'button.prod-cart-btn',
    'button[data-testid="add-to-cart"]',
    'button:contains("장바구니")',
    '.cart-button'
  ]
};

module.exports = {
  SELECTORS,
  DYNAMIC_SELECTORS,
  FALLBACK_SELECTORS,
  isValidSelector
};