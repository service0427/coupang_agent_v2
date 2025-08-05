/**
 * 중앙화된 상수 정의
 * 모든 하드코딩된 값들을 한 곳에서 관리
 */

// 타임아웃 값들 (밀리초)
const TIMEOUTS = {
  // 짧은 대기
  SHORT: 1000,
  STANDARD: 3000,
  MEDIUM: 5000,
  
  // 일반 작업
  DEFAULT: 10000,
  NAVIGATION: 15000,
  
  // 긴 작업
  LONG: 30000,
  EXTRA_LONG: 60000,
  
  // 특수 용도
  PAGE_WAIT: 3000,
  CART_WAIT: 3000,
  CLICK_WAIT: 3000,
  SEARCH_INPUT: 10000,
  PRODUCT_LIST: 10000,
  PROXY_TOGGLE: 15000,
  DB_IDLE: 30000
};

// CSS 셀렉터들
const SELECTORS = {
  // 검색 관련
  SEARCH_INPUT: 'input[name="q"]',
  SEARCH_BUTTON: 'button.search-button',
  
  // 상품 목록
  PRODUCT_LIST: '#product-list',
  PRODUCT_ITEM: 'li.search-product',
  PRODUCT_LINK: 'a[href*="/vp/products/"], a.search-product-link',
  PRODUCT_NAME: '.name',
  
  // 상품 상세
  PRODUCT_TITLE: '.prod-buy-header__title, h1',
  CART_BUTTON: 'button.prod-cart-btn',
  
  // 페이지네이션
  PAGINATION: '.pagination',
  NEXT_PAGE: 'a.next-page'
};

// URL 패턴들
const URLS = {
  COUPANG_BASE: 'https://www.coupang.com',
  SEARCH_URL: 'https://www.coupang.com/np/search',
  LOGIN_URL: 'https://login.coupang.com',
  MOBILE_URL: 'https://m.coupang.com',
  
  // URL 파라미터
  RANK_PARAM: 'rank',
  ITEM_ID_PARAM: 'itemId',
  VENDOR_ITEM_ID_PARAM: 'vendorItemId'
};

// 에러 메시지
const ERROR_MESSAGES = {
  // 일반 에러
  TIMEOUT: '작업 시간 초과',
  NOT_FOUND: '요소를 찾을 수 없음',
  
  // 상품 검색
  PRODUCT_NOT_FOUND: '상품을 찾을 수 없음',
  PRODUCT_LIST_EMPTY: '상품 목록이 비어있음',
  NO_RANK_PARAM: 'rank 파라미터가 있는 상품 없음',
  
  // 장바구니
  CART_BUTTON_NOT_FOUND: '장바구니 버튼을 찾을 수 없음',
  CART_BUTTON_DISABLED: '장바구니 버튼 클릭 실패 (비활성화 상태)',
  CART_ADD_FAILED: '장바구니 담기 실패',
  
  // 네트워크
  NETWORK_ERROR: '네트워크 오류',
  PROXY_ERROR: '프록시 연결 실패',
  BLOCKED: '쿠팡 접속 차단',
  
  // 페이지
  PAGE_LOAD_FAILED: '페이지 로드 실패',
  NAVIGATION_FAILED: '페이지 이동 실패'
};

// 로그 접두사 포맷
const LOG_PREFIXES = {
  KEYWORD_ID: (id) => `[ID:${id}] `,
  AGENT: (agent) => `[${agent}] `,
  ERROR: '❌ ',
  SUCCESS: '✅ ',
  WARNING: '⚠️ ',
  INFO: 'ℹ️ ',
  SEARCH: '🔍 ',
  CART: '🛒 ',
  COOKIE: '🍪 ',
  NETWORK: '🌐 ',
  PROXY: '🔐 ',
  TIME: '⏱️ ',
  PAGE: '📄 ',
  TARGET: '🎯 '
};

// 브라우저 설정
const BROWSER_CONFIG = {
  // 뷰포트 크기
  VIEWPORT: {
    DEFAULT_WIDTH: 1200,
    DEFAULT_HEIGHT: 800,
    MIN_WIDTH: 1000,
    MAX_WIDTH: 1400,
    MIN_HEIGHT: 700,
    MAX_HEIGHT: 900
  },
  
  // Chrome 인자
  CHROME_ARGS: {
    COMMON: [
      '--disable-blink-features=AutomationControlled'
    ],
    GPU_DISABLED: [
      '--disable-gpu',
      '--disable-software-rasterizer'
    ],
    CACHE_DISABLED: [
      '--disk-cache-size=0',
      '--media-cache-size=0'
    ]
  }
};

// 네트워크 설정
const NETWORK_CONFIG = {
  // 리소스 차단 패턴
  BLOCK_PATTERNS: {
    MAXIMUM: {
      resourceTypes: ['image', 'media', 'font', 'stylesheet'],
      urlPatterns: ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.css', '*.woff*', '*.ttf', '*.mp4', '*.webm']
    },
    BALANCED: {
      resourceTypes: ['image', 'media', 'font'],
      urlPatterns: ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.woff*', '*.ttf', '*.mp4', '*.webm']
    },
    MINIMAL: {
      resourceTypes: ['media'],
      urlPatterns: ['*.mp4', '*.webm', '*.avi', '*.mov']
    }
  },
  
  // 캐시 헤더
  CACHE_HEADERS: {
    'cache-control': 'max-age=31536000',
    'pragma': 'cache',
    'expires': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
  }
};

// 프록시 설정
const PROXY_CONFIG = {
  MIN_TOGGLE_INTERVAL: 15000,  // 15초
  CONNECTION_TIMEOUT: 10000,    // 10초
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000
};

// 데이터베이스 설정
const DB_CONFIG = {
  CONNECTION_TIMEOUT: 5000,
  IDLE_TIMEOUT: 30000,
  MAX_CLIENTS: 10,
  MIN_CLIENTS: 2
};

module.exports = {
  TIMEOUTS,
  SELECTORS,
  URLS,
  ERROR_MESSAGES,
  LOG_PREFIXES,
  BROWSER_CONFIG,
  NETWORK_CONFIG,
  PROXY_CONFIG,
  DB_CONFIG
};