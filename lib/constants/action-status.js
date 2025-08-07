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
    ActionStatus.SUCCESS
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
    ActionStatus.ERROR_TIMEOUT
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

// 상태가 오류인지 확인
function isErrorStatus(status) {
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

module.exports = {
  ActionStatus,
  ActionType,
  ProcessStep,
  ErrorLevel,
  isSuccessStatus,
  isErrorStatus,
  isProgressStatus,
  isValidTransition
};