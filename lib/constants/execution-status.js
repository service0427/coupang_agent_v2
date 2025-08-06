/**
 * 실행 상태 상수 정의
 * - 전체 실행 프로세스의 상태 추적
 * - 상품 검색부터 장바구니까지의 단계별 상태
 */

// 실행 상태
const ExecutionStatus = {
  // 초기화
  INIT: 'INIT',                                 // 실행 초기화
  PREPARING: 'PREPARING',                       // 준비 중
  BROWSER_LAUNCHING: 'BROWSER_LAUNCHING',       // 브라우저 시작 중
  BROWSER_READY: 'BROWSER_READY',               // 브라우저 준비됨
  
  // 페이지 접근
  NAVIGATING_HOME: 'NAVIGATING_HOME',           // 홈페이지 이동 중
  HOME_LOADED: 'HOME_LOADED',                   // 홈페이지 로드됨
  SEARCH_READY: 'SEARCH_READY',                 // 검색 준비됨
  
  // 상품 검색
  SEARCHING: 'SEARCHING',                       // 검색 중
  SEARCH_SUBMITTED: 'SEARCH_SUBMITTED',         // 검색 제출됨
  RESULTS_LOADING: 'RESULTS_LOADING',           // 결과 로딩 중
  RESULTS_LOADED: 'RESULTS_LOADED',             // 결과 로드됨
  
  // 상품 찾기
  PRODUCT_SEARCHING: 'PRODUCT_SEARCHING',       // 상품 찾는 중
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',       // 상품 못 찾음
  PRODUCT_FOUND: 'PRODUCT_FOUND',               // 상품 찾음
  
  // 상품 클릭
  PRODUCT_CLICKING: 'PRODUCT_CLICKING',         // 상품 클릭 중
  PRODUCT_CLICKED: 'PRODUCT_CLICKED',           // 상품 클릭됨
  PRODUCT_PAGE_LOADING: 'PRODUCT_PAGE_LOADING', // 상품 페이지 로딩 중
  PRODUCT_PAGE_LOADED: 'PRODUCT_PAGE_LOADED',   // 상품 페이지 로드됨
  
  // 장바구니
  CART_CHECKING: 'CART_CHECKING',               // 장바구니 버튼 확인 중
  CART_READY: 'CART_READY',                     // 장바구니 준비됨
  CART_CLICKING: 'CART_CLICKING',               // 장바구니 클릭 중
  CART_CLICKED: 'CART_CLICKED',                 // 장바구니 클릭됨
  
  // 완료 상태
  SUCCESS: 'SUCCESS',                           // 성공
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',           // 부분 성공
  
  // 오류 상태
  ERROR_BROWSER: 'ERROR_BROWSER',               // 브라우저 오류
  ERROR_NAVIGATION: 'ERROR_NAVIGATION',         // 네비게이션 오류
  ERROR_SEARCH: 'ERROR_SEARCH',                 // 검색 오류
  ERROR_PRODUCT_NOT_FOUND: 'ERROR_PRODUCT_NOT_FOUND', // 상품 없음
  ERROR_CLICK_FAILED: 'ERROR_CLICK_FAILED',     // 클릭 실패
  ERROR_PAGE_LOAD: 'ERROR_PAGE_LOAD',           // 페이지 로드 실패
  ERROR_CART: 'ERROR_CART',                     // 장바구니 오류
  ERROR_TIMEOUT: 'ERROR_TIMEOUT',               // 타임아웃
  ERROR_BLOCKED: 'ERROR_BLOCKED',               // 차단됨
  ERROR_NETWORK: 'ERROR_NETWORK',               // 네트워크 오류
  ERROR_UNKNOWN: 'ERROR_UNKNOWN'                // 알 수 없는 오류
};

// 성공 레벨 (어디까지 성공했는지)
const SuccessLevel = {
  NONE: 'NONE',                                 // 성공 없음
  PAGE_REACHED: 'PAGE_REACHED',                 // 페이지 도달
  SEARCH_COMPLETED: 'SEARCH_COMPLETED',         // 검색 완료
  PRODUCT_FOUND: 'PRODUCT_FOUND',               // 상품 발견
  PRODUCT_CLICKED: 'PRODUCT_CLICKED',           // 상품 클릭
  PAGE_NAVIGATED: 'PAGE_NAVIGATED',             // 페이지 이동
  PAGE_LOADED: 'PAGE_LOADED',                   // 페이지 로드
  CART_READY: 'CART_READY',                     // 장바구니 준비
  CART_CLICKED: 'CART_CLICKED'                 // 장바구니 클릭
};

// 검색 모드
const SearchMode = {
  GOTO: 'goto',                                 // URL 직접 이동
  SEARCH: 'search',                             // 검색창 사용
  AUTO: 'auto'                                  // 자동 전환
};

// 검색 모드 전환 이유
const SearchModeReason = {
  DEFAULT: 'default',                           // 기본 설정
  BLOCKED_CONSECUTIVE: 'blocked_consecutive',   // 연속 차단
  SEARCH_QUOTA: 'search_quota',                 // 검색 할당량
  USER_REQUEST: 'user_request',                 // 사용자 요청
  ERROR_RECOVERY: 'error_recovery'              // 오류 복구
};

// 최종 상태
const FinalStatus = {
  SUCCESS: 'success',                           // 완전 성공
  PARTIAL_SUCCESS: 'partial_success',           // 부분 성공
  PRODUCT_NOT_FOUND: 'product_not_found',       // 상품 없음
  CLICK_FAILED: 'click_failed',                 // 클릭 실패
  PAGE_LOAD_INCOMPLETE: 'page_load_incomplete', // 페이지 로드 미완료
  BLOCKED: 'blocked',                           // 차단됨
  TIMEOUT: 'timeout',                           // 타임아웃
  ERROR: 'error'                                // 오류
};

// 상태 전환 맵
const ExecutionStateTransitions = {
  [ExecutionStatus.INIT]: [
    ExecutionStatus.PREPARING,
    ExecutionStatus.ERROR_UNKNOWN
  ],
  [ExecutionStatus.PREPARING]: [
    ExecutionStatus.BROWSER_LAUNCHING,
    ExecutionStatus.ERROR_BROWSER
  ],
  [ExecutionStatus.BROWSER_READY]: [
    ExecutionStatus.NAVIGATING_HOME,
    ExecutionStatus.ERROR_NAVIGATION
  ],
  [ExecutionStatus.HOME_LOADED]: [
    ExecutionStatus.SEARCH_READY,
    ExecutionStatus.SEARCHING,
    ExecutionStatus.ERROR_SEARCH
  ],
  [ExecutionStatus.RESULTS_LOADED]: [
    ExecutionStatus.PRODUCT_SEARCHING,
    ExecutionStatus.ERROR_SEARCH
  ],
  [ExecutionStatus.PRODUCT_FOUND]: [
    ExecutionStatus.PRODUCT_CLICKING,
    ExecutionStatus.ERROR_CLICK_FAILED
  ],
  [ExecutionStatus.PRODUCT_CLICKED]: [
    ExecutionStatus.PRODUCT_PAGE_LOADING,
    ExecutionStatus.ERROR_PAGE_LOAD
  ],
  [ExecutionStatus.PRODUCT_PAGE_LOADED]: [
    ExecutionStatus.CART_CHECKING,
    ExecutionStatus.SUCCESS,
    ExecutionStatus.PARTIAL_SUCCESS
  ],
  [ExecutionStatus.CART_READY]: [
    ExecutionStatus.CART_CLICKING,
    ExecutionStatus.SUCCESS
  ],
  [ExecutionStatus.CART_CLICKED]: [
    ExecutionStatus.SUCCESS
  ]
};

// 상태가 종료 상태인지 확인
function isTerminalStatus(status) {
  return [
    ExecutionStatus.SUCCESS,
    ExecutionStatus.PARTIAL_SUCCESS,
    ExecutionStatus.PRODUCT_NOT_FOUND,
    ...Object.values(ExecutionStatus).filter(s => s.startsWith('ERROR_'))
  ].includes(status);
}

// 상태가 성공 상태인지 확인
function isSuccessfulStatus(status) {
  return [
    ExecutionStatus.SUCCESS,
    ExecutionStatus.PARTIAL_SUCCESS
  ].includes(status);
}

// 상태가 오류 상태인지 확인
function isErrorStatus(status) {
  return status.startsWith('ERROR_');
}

// 성공 레벨 계산
function calculateSuccessLevel(executionStatus) {
  const levelMap = {
    [ExecutionStatus.HOME_LOADED]: SuccessLevel.PAGE_REACHED,
    [ExecutionStatus.RESULTS_LOADED]: SuccessLevel.SEARCH_COMPLETED,
    [ExecutionStatus.PRODUCT_FOUND]: SuccessLevel.PRODUCT_FOUND,
    [ExecutionStatus.PRODUCT_CLICKED]: SuccessLevel.PRODUCT_CLICKED,
    [ExecutionStatus.PRODUCT_PAGE_LOADING]: SuccessLevel.PAGE_NAVIGATED,
    [ExecutionStatus.PRODUCT_PAGE_LOADED]: SuccessLevel.PAGE_LOADED,
    [ExecutionStatus.CART_READY]: SuccessLevel.CART_READY,
    [ExecutionStatus.CART_CLICKED]: SuccessLevel.CART_CLICKED,
    [ExecutionStatus.SUCCESS]: SuccessLevel.CART_CLICKED
  };
  
  return levelMap[executionStatus] || SuccessLevel.NONE;
}

// 오류 단계 결정
function determineErrorStep(errorStatus) {
  const errorStepMap = {
    [ExecutionStatus.ERROR_BROWSER]: 'initialization',
    [ExecutionStatus.ERROR_NAVIGATION]: 'navigation',
    [ExecutionStatus.ERROR_SEARCH]: 'search',
    [ExecutionStatus.ERROR_PRODUCT_NOT_FOUND]: 'find',
    [ExecutionStatus.ERROR_CLICK_FAILED]: 'click',
    [ExecutionStatus.ERROR_PAGE_LOAD]: 'load',
    [ExecutionStatus.ERROR_CART]: 'cart',
    [ExecutionStatus.ERROR_TIMEOUT]: 'timeout',
    [ExecutionStatus.ERROR_BLOCKED]: 'blocked',
    [ExecutionStatus.ERROR_NETWORK]: 'network'
  };
  
  return errorStepMap[errorStatus] || 'unknown';
}

module.exports = {
  ExecutionStatus,
  SuccessLevel,
  SearchMode,
  SearchModeReason,
  FinalStatus,
  ExecutionStateTransitions,
  isTerminalStatus,
  isSuccessfulStatus,
  isErrorStatus,
  calculateSuccessLevel,
  determineErrorStep
};