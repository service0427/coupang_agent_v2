/**
 * 통합 상수 파일
 * action-status.js와 execution-status.js를 그대로 합친 파일
 */

// ============================================================
// ACTION STATUS (from action-status.js)
// ============================================================

/**
 * 액션 상태 상수 정의
 * - 각 액션의 생명주기를 추적
 * - 문제점 분석을 위한 세분화된 상태
 */

// 액션 상태
const ActionStatus = {
  // 초기화 단계
  INIT: 'INIT',                           // 액션 초기화
  PENDING: 'PENDING',                     // 액션 대기 중
  STARTED: 'STARTED',                     // 액션 시작됨
  
  // 페이지 로딩 단계
  NAVIGATING: 'NAVIGATING',               // 페이지 이동 중
  DOM_INTERACTIVE: 'DOM_INTERACTIVE',     // DOM 상호작용 가능
  DOM_READY: 'DOM_READY',                 // DOM 로드 완료
  LOADED: 'LOADED',                       // 페이지 완전 로드
  NETWORK_IDLE: 'NETWORK_IDLE',           // 네트워크 유휴 상태
  
  // 요소 상태
  ELEMENT_WAITING: 'ELEMENT_WAITING',     // 요소 대기 중
  ELEMENT_FOUND: 'ELEMENT_FOUND',         // 요소 발견됨
  ELEMENT_VISIBLE: 'ELEMENT_VISIBLE',     // 요소 표시됨
  ELEMENT_CLICKABLE: 'ELEMENT_CLICKABLE', // 요소 클릭 가능
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND', // 요소 찾지 못함
  ELEMENT_NOT_VISIBLE: 'ELEMENT_NOT_VISIBLE', // 요소 보이지 않음
  ELEMENT_NOT_CLICKABLE: 'ELEMENT_NOT_CLICKABLE', // 요소 클릭 불가
  
  // 상호작용 단계
  CLICKING: 'CLICKING',                   // 클릭 시도 중
  CLICKED: 'CLICKED',                     // 클릭 완료
  RETRY_CLICKING: 'RETRY_CLICKING',       // 재시도 클릭 중
  TYPING: 'TYPING',                       // 입력 중
  TYPED: 'TYPED',                         // 입력 완료
  INPUT_TYPING: 'INPUT_TYPING',           // 입력 시작
  INPUT_COMPLETED: 'INPUT_COMPLETED',     // 입력 완료
  SCROLLING: 'SCROLLING',                 // 스크롤 중
  SCROLLED: 'SCROLLED',                   // 스크롤 완료
  
  // 처리 단계
  PROCESSING: 'PROCESSING',               // 처리 중
  DATA_EXTRACTING: 'DATA_EXTRACTING',     // 데이터 추출 중
  SEARCH_EXECUTING: 'SEARCH_EXECUTING',   // 검색 실행 중
  
  // 성공 상태
  SUCCESS: 'SUCCESS',                     // 액션 성공
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',     // 부분 성공
  PAGE_REACHED: 'PAGE_REACHED',           // 페이지 도달
  
  // 오류 상태
  ERROR_TIMEOUT: 'ERROR_TIMEOUT',         // 타임아웃 오류
  ERROR_NAVIGATION: 'ERROR_NAVIGATION',   // 페이지 이동 오류
  ERROR_ELEMENT: 'ERROR_ELEMENT',         // 요소 관련 오류
  ERROR_CLICK: 'ERROR_CLICK',             // 클릭 실패
  ERROR_CONTENT: 'ERROR_CONTENT',         // 콘텐츠 오류
  ERROR_NETWORK: 'ERROR_NETWORK',         // 네트워크 오류
  ERROR_BLOCKED: 'ERROR_BLOCKED',         // 차단됨
  ERROR_CRITICAL: 'ERROR_CRITICAL',       // 치명적 오류
  ERROR_UNKNOWN: 'ERROR_UNKNOWN'          // 알 수 없는 오류
};

// 액션 타입
const ActionType = {
  // 네비게이션
  NAVIGATE: 'NAVIGATE',                   // 페이지 이동
  RELOAD: 'RELOAD',                       // 페이지 새로고침
  BACK: 'BACK',                          // 뒤로 가기
  FORWARD: 'FORWARD',                    // 앞으로 가기
  
  // 대기
  WAIT_NAVIGATION: 'WAIT_NAVIGATION',     // 네비게이션 대기
  WAIT_SELECTOR: 'WAIT_SELECTOR',         // 선택자 대기
  WAIT_TIMEOUT: 'WAIT_TIMEOUT',           // 시간 대기
  WAIT_NETWORK: 'WAIT_NETWORK',           // 네트워크 대기
  WAIT_FUNCTION: 'WAIT_FUNCTION',         // 함수 조건 대기
  
  // 상호작용
  CLICK: 'CLICK',                         // 클릭
  DOUBLE_CLICK: 'DOUBLE_CLICK',           // 더블 클릭
  RIGHT_CLICK: 'RIGHT_CLICK',             // 우클릭
  HOVER: 'HOVER',                         // 호버
  INPUT: 'INPUT',                         // 입력
  CLEAR: 'CLEAR',                         // 입력 지우기
  SELECT: 'SELECT',                       // 선택
  FOCUS: 'FOCUS',                         // 포커스
  BLUR: 'BLUR',                          // 포커스 해제
  
  // 스크롤
  SCROLL: 'SCROLL',                       // 스크롤
  SCROLL_TO_ELEMENT: 'SCROLL_TO_ELEMENT', // 요소로 스크롤
  SCROLL_TO_TOP: 'SCROLL_TO_TOP',         // 맨 위로 스크롤
  SCROLL_TO_BOTTOM: 'SCROLL_TO_BOTTOM',   // 맨 아래로 스크롤
  
  // 평가
  EVALUATE: 'EVALUATE',                   // 스크립트 실행
  EXTRACT: 'EXTRACT',                     // 데이터 추출
  CHECK: 'CHECK',                         // 조건 확인
  
  // 스크린샷
  SCREENSHOT: 'SCREENSHOT',               // 스크린샷
  
  // 쿠팡 특화
  SEARCH_INPUT: 'SEARCH_INPUT',           // 검색어 입력
  SEARCH_SUBMIT: 'SEARCH_SUBMIT',         // 검색 실행
  PRODUCT_SEARCH: 'PRODUCT_SEARCH',       // 상품 검색
  PRODUCT_CLICK: 'PRODUCT_CLICK',         // 상품 클릭
  CART_CLICK: 'CART_CLICK',              // 장바구니 클릭
  PAGE_NEXT: 'PAGE_NEXT'                 // 다음 페이지
};

// 프로세스 단계
const ProcessStep = {
  // 초기화
  INITIALIZATION: 'INITIALIZATION',       // 초기화
  SETUP: 'SETUP',                        // 설정
  
  // 메인 프로세스
  NAVIGATION: 'NAVIGATION',               // 페이지 이동
  SEARCH: 'SEARCH',                      // 검색
  FIND_PRODUCT: 'FIND_PRODUCT',          // 상품 찾기
  CLICK_PRODUCT: 'CLICK_PRODUCT',        // 상품 클릭
  PAGE_LOAD: 'PAGE_LOAD',                // 페이지 로드
  ADD_CART: 'ADD_CART',                  // 장바구니 추가
  
  // 보조 프로세스
  WAIT: 'WAIT',                          // 대기
  RETRY: 'RETRY',                        // 재시도
  ERROR_HANDLING: 'ERROR_HANDLING',       // 오류 처리
  CLEANUP: 'CLEANUP'                     // 정리
};

// 오류 레벨
const ErrorLevel = {
  DEBUG: 'DEBUG',                        // 디버그
  INFO: 'INFO',                          // 정보
  WARNING: 'WARNING',                    // 경고
  ERROR: 'ERROR',                        // 오류
  CRITICAL: 'CRITICAL',                  // 치명적
  FATAL: 'FATAL'                         // 심각
};

// 상태 전환 유효성 검사
const ValidStatusTransitions = {
  [ActionStatus.INIT]: [
    ActionStatus.PENDING,
    ActionStatus.ERROR_CRITICAL
  ],
  [ActionStatus.PENDING]: [
    ActionStatus.STARTED,
    ActionStatus.ERROR_TIMEOUT,
    ActionStatus.ERROR_CRITICAL
  ],
  [ActionStatus.STARTED]: [
    ActionStatus.NAVIGATING,
    ActionStatus.ELEMENT_WAITING,
    ActionStatus.CLICKING,
    ActionStatus.TYPING,
    ActionStatus.SCROLLING,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_TIMEOUT,
    ActionStatus.ERROR_CRITICAL
  ],
  [ActionStatus.NAVIGATING]: [
    ActionStatus.DOM_INTERACTIVE,
    ActionStatus.DOM_READY,      // 직접 DOM_READY 전환 허용
    ActionStatus.LOADED,         // 직접 LOADED 전환 허용
    ActionStatus.SUCCESS,        // 직접 SUCCESS 전환 허용
    ActionStatus.PAGE_REACHED,   // 페이지 도달 확인
    ActionStatus.ERROR_NAVIGATION,
    ActionStatus.ERROR_TIMEOUT,
    ActionStatus.ERROR_BLOCKED
  ],
  [ActionStatus.DOM_INTERACTIVE]: [
    ActionStatus.DOM_READY,
    ActionStatus.ERROR_CONTENT,
    ActionStatus.ERROR_TIMEOUT
  ],
  [ActionStatus.DOM_READY]: [
    ActionStatus.LOADED,
    ActionStatus.SUCCESS,
    ActionStatus.PARTIAL_SUCCESS,
    ActionStatus.ERROR_TIMEOUT
  ],
  [ActionStatus.LOADED]: [
    ActionStatus.NETWORK_IDLE,
    ActionStatus.SUCCESS,
    ActionStatus.PAGE_REACHED,
    // 상품 페이지에서 다시 검색하는 경우
    ActionStatus.ELEMENT_WAITING,
    ActionStatus.ELEMENT_FOUND,
    ActionStatus.INPUT_TYPING,
    ActionStatus.INPUT_COMPLETED,
    ActionStatus.SEARCH_EXECUTING
  ],
  [ActionStatus.ELEMENT_WAITING]: [
    ActionStatus.ELEMENT_FOUND,
    ActionStatus.ELEMENT_NOT_FOUND,
    ActionStatus.ERROR_TIMEOUT
  ],
  [ActionStatus.ELEMENT_FOUND]: [
    ActionStatus.ELEMENT_VISIBLE,
    ActionStatus.ELEMENT_CLICKABLE,
    ActionStatus.CLICKING,
    ActionStatus.CLICKED,
    ActionStatus.NAVIGATING,
    ActionStatus.DOM_READY,
    ActionStatus.LOADED,
    ActionStatus.DATA_EXTRACTING,
    ActionStatus.SUCCESS,
    ActionStatus.PARTIAL_SUCCESS,
    ActionStatus.ERROR_ELEMENT,
    ActionStatus.ERROR_TIMEOUT,
    // 검색창에서 입력 작업
    ActionStatus.INPUT_TYPING,
    ActionStatus.INPUT_COMPLETED,
    ActionStatus.SEARCH_EXECUTING
  ],
  [ActionStatus.ELEMENT_VISIBLE]: [
    ActionStatus.ELEMENT_CLICKABLE,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_ELEMENT
  ],
  
  [ActionStatus.ELEMENT_CLICKABLE]: [
    ActionStatus.CLICKING,
    ActionStatus.CLICKED,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_CLICK,
    ActionStatus.ERROR_ELEMENT
  ],
  [ActionStatus.CLICKING]: [
    ActionStatus.CLICKED,
    ActionStatus.ERROR_CLICK,
    ActionStatus.ERROR_TIMEOUT
  ],
  [ActionStatus.CLICKED]: [
    ActionStatus.SUCCESS,
    ActionStatus.NAVIGATING,
    ActionStatus.PARTIAL_SUCCESS,
    ActionStatus.DOM_READY,
    ActionStatus.LOADED,
    ActionStatus.PROCESSING
  ],
  
  // 새로 추가된 상태들의 전환
  [ActionStatus.INPUT_TYPING]: [
    ActionStatus.INPUT_COMPLETED,
    ActionStatus.TYPED,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_TIMEOUT
  ],
  
  [ActionStatus.INPUT_COMPLETED]: [
    ActionStatus.SEARCH_EXECUTING,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_TIMEOUT
  ],
  
  [ActionStatus.SEARCH_EXECUTING]: [
    ActionStatus.NAVIGATING,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_NAVIGATION,
    ActionStatus.ERROR_TIMEOUT
  ],
  
  [ActionStatus.PAGE_REACHED]: [
    ActionStatus.SUCCESS,
    ActionStatus.ELEMENT_WAITING,
    ActionStatus.PROCESSING,
    ActionStatus.DOM_READY,
    ActionStatus.LOADED,
    ActionStatus.ERROR_TIMEOUT
  ],
  
  [ActionStatus.PROCESSING]: [
    ActionStatus.SUCCESS,
    ActionStatus.PARTIAL_SUCCESS,
    ActionStatus.ERROR_TIMEOUT,
    ActionStatus.ERROR_CRITICAL
  ],
  
  [ActionStatus.DATA_EXTRACTING]: [
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_CONTENT,
    ActionStatus.ERROR_TIMEOUT
  ],
  
  [ActionStatus.RETRY_CLICKING]: [
    ActionStatus.CLICKED,
    ActionStatus.SUCCESS,
    ActionStatus.ERROR_CLICK,
    ActionStatus.ERROR_CRITICAL
  ]
};

// 상태가 성공인지 확인
function isSuccessStatus(status) {
  return status === ActionStatus.SUCCESS || 
         status === ActionStatus.PARTIAL_SUCCESS;
}

// 상태가 오류인지 확인 (ActionStatus용)
function isActionErrorStatus(status) {
  return status.startsWith('ERROR_');
}

// 상태가 진행 중인지 확인
function isProgressStatus(status) {
  return ![
    ActionStatus.INIT,
    ActionStatus.SUCCESS,
    ActionStatus.PARTIAL_SUCCESS,
    ...Object.values(ActionStatus).filter(s => s.startsWith('ERROR_'))
  ].includes(status);
}

// 유효한 상태 전환인지 확인
function isValidTransition(fromStatus, toStatus) {
  const validTransitions = ValidStatusTransitions[fromStatus];
  return validTransitions && validTransitions.includes(toStatus);
}

// ============================================================
// EXECUTION STATUS (from execution-status.js)
// ============================================================

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
  ERROR_PROXY: 'ERROR_PROXY',                   // 프록시 오류 (192.168.x.100 감지)
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
    [ExecutionStatus.ERROR_NETWORK]: 'network',
    [ExecutionStatus.ERROR_PROXY]: 'proxy_check'
  };
  
  return errorStepMap[errorStatus] || 'unknown';
}

/**
 * 허브 API 상태 코드 매핑 시스템
 * 기존 ExecutionStatus를 HTTP 상태 코드로 변환
 */

// 실행 상태 -> HTTP 상태 코드 매핑
const STATUS_CODE_MAPPINGS = {
  // 성공 상태 (200번대)
  [ExecutionStatus.SUCCESS]: 200,
  [ExecutionStatus.PARTIAL_SUCCESS]: 201,
  
  // 클라이언트 오류 (400번대)
  [ExecutionStatus.ERROR_SEARCH]: 404,                    // 검색 결과 없음
  [ExecutionStatus.ERROR_PRODUCT_NOT_FOUND]: 405,         // 상품 없음
  [ExecutionStatus.ERROR_CLICK_FAILED]: 406,              // 클릭 실패
  [ExecutionStatus.ERROR_TIMEOUT]: 408,                   // 타임아웃
  [ExecutionStatus.ERROR_BLOCKED]: 403,                   // 차단
  
  // 서버/네트워크 오류 (500번대)
  [ExecutionStatus.ERROR_BROWSER]: 500,                   // 브라우저 오류
  [ExecutionStatus.ERROR_NAVIGATION]: 502,                // 네비게이션 실패
  [ExecutionStatus.ERROR_PAGE_LOAD]: 502,                 // 페이지 로드 실패
  [ExecutionStatus.ERROR_CART]: 500,                      // 장바구니 오류
  [ExecutionStatus.ERROR_NETWORK]: 502,                   // 네트워크 오류
  [ExecutionStatus.ERROR_PROXY]: 407,                     // 프록시 오류 (192.168.x.100)
  [ExecutionStatus.ERROR_UNKNOWN]: 500                    // 알 수 없는 오류
};

// HTTP 상태 코드 정보
const HTTP_STATUS_INFO = {
  200: { status: 'success', message: '모든 단계 정상 완료' },
  201: { status: 'partial_success', message: '부분 성공 (일부 정보 누락)' },
  202: { status: 'success_with_warning', message: '경고가 있지만 성공' },
  
  400: { status: 'error', message: '잘못된 키워드 또는 설정' },
  403: { status: 'blocked', message: '쿠팡 접속 차단 (IP/Bot 감지)' },
  404: { status: 'error', message: '검색 결과 없음' },
  405: { status: 'error', message: '타겟 상품을 찾을 수 없음' },
  406: { status: 'error', message: '상품 클릭 실패' },
  407: { status: 'proxy_error', message: '프록시 오류 (로컬 네트워크 IP 감지)' },
  408: { status: 'timeout', message: '단계별 타임아웃' },
  429: { status: 'rate_limited', message: '요청 제한 (너무 많은 요청)' },
  
  500: { status: 'error', message: '내부 시스템 오류' },
  502: { status: 'network_error', message: '네트워크 연결 실패' },
  503: { status: 'service_unavailable', message: '쿠팡 서비스 일시 불가' },
  504: { status: 'gateway_timeout', message: '프록시/게이트웨이 타임아웃' }
};

// ExecutionStatus를 HTTP 상태 코드로 변환
function getHttpStatusCode(executionStatus, errorMessage = null) {
  // 에러 메시지가 있고 ERROR_UNKNOWN인 경우 메시지 기반 추론 우선
  if (executionStatus === ExecutionStatus.ERROR_UNKNOWN && errorMessage && typeof errorMessage === 'string') {
    const lowerError = errorMessage.toLowerCase();
    
    // 프록시 오류 관련 - 로컬 네트워크 IP 감지
    if (lowerError.includes('프록시 오류') || lowerError.includes('proxy error') ||
        lowerError.includes('로컬 네트워크') || lowerError.includes('local network') ||
        lowerError.includes('192.168') || lowerError.includes('proxy_failure')) {
      return 407;
    }
    
    // 차단 관련 - HTTP2 프로토콜 오류 포함
    if (lowerError.includes('http2_protocol_error') || lowerError.includes('http2_protoccol_error') ||
        lowerError.includes('http2') || lowerError.includes('blocked') || 
        lowerError.includes('차단') || lowerError.includes('forbidden') ||
        lowerError.includes('denied') || lowerError.includes('access denied')) {
      return 403;
    }
    
    // 타임아웃 관련
    if (lowerError.includes('timeout') || lowerError.includes('time')) {
      return 408;
    }
    
    // 네트워크 관련
    if (lowerError.includes('network_changed') || lowerError.includes('internet_disconnected') ||
        lowerError.includes('connection_refused') || lowerError.includes('network') || 
        lowerError.includes('connection') || lowerError.includes('err_internet') || 
        lowerError.includes('err_network')) {
      return 502;
    }
    
    // 검색/상품 관련
    if (lowerError.includes('no product') || lowerError.includes('상품') ||
        lowerError.includes('not found')) {
      return 405;
    }
  }
  
  // 기본 매핑 확인
  let statusCode = STATUS_CODE_MAPPINGS[executionStatus];
  
  if (statusCode) {
    return statusCode;
  }
  
  
  // 기본값
  return 500;
}

// HTTP 상태 코드 정보 조회
function getHttpStatusInfo(statusCode) {
  return HTTP_STATUS_INFO[statusCode] || {
    status: 'error',
    message: '알 수 없는 오류'
  };
}

// 성공 여부 확인
function isHttpSuccess(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}

// 차단 여부 확인
function isHttpBlocked(statusCode) {
  return statusCode === 403 || statusCode === 429;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Action Status
  ActionStatus,
  ActionType,
  ProcessStep,
  ErrorLevel,
  isSuccessStatus,
  isActionErrorStatus,
  isProgressStatus,
  isValidTransition,
  
  // Execution Status
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
  determineErrorStep,
  
  // HTTP Status Code System
  STATUS_CODE_MAPPINGS,
  HTTP_STATUS_INFO,
  getHttpStatusCode,
  getHttpStatusInfo,
  isHttpSuccess,
  isHttpBlocked
};