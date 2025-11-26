/**
 * 에러 처리 및 메시지 생성
 * - searchMode 기반 에러 메시지 분기
 * - work_type별 에러 응답 생성
 *
 * Updated: 2025-10-09 - api-mode.js에서 분리
 */

/**
 * IP 정보 추출 헬퍼
 */
function extractIpFromResult(automationResult) {
  const actualIp = automationResult?.actualIp;

  if (actualIp && typeof actualIp === 'object' && actualIp.ip) {
    return actualIp.ip;
  }

  if (typeof actualIp === 'string') {
    return actualIp;
  }

  return null;
}

/**
 * searchMode 기반 차단 에러 메시지 생성
 * @param {Object} automationResult - 자동화 실행 결과
 * @param {string} errorMessage - 원본 에러 메시지
 * @param {number} actualPageNumber - 실제 페이지 번호
 * @param {number} expectedMaxPages - 예상 최대 페이지 수
 * @returns {string} 최종 에러 메시지
 */
function buildErrorMessage(automationResult, errorMessage, actualPageNumber, expectedMaxPages) {
  let finalErrorMessage = errorMessage;

  // 차단 메시지 생성
  if (errorMessage && errorMessage.includes('HTTP2_PROTOCOL_ERROR')) {
    finalErrorMessage = `쿠팡 차단 - HTTP2_PROTOCOL_ERROR`;
  } else if (actualPageNumber > 0 && actualPageNumber < expectedMaxPages) {
    finalErrorMessage = `쿠팡 차단 - ${actualPageNumber}페이지에서 중단됨`;
  } else if (!automationResult?.referer) {
    // 검색 모드에 따라 메시지 구분 ⭐ searchMode 로직
    const searchMode = automationResult?.searchMode;
    if (searchMode === 'main') {
      finalErrorMessage = `쿠팡 차단 - 초기 검색 차단`;  // 메인 페이지 검색 모드
    } else {
      finalErrorMessage = `쿠팡 차단 - 초기 접속 차단`;  // URL 직접 모드
    }
  } else {
    finalErrorMessage = finalErrorMessage || '쿠팡 차단 감지';
  }

  return finalErrorMessage;
}

/**
 * work_type별 에러 응답 생성
 * @param {string} workType - 작업 타입 (rank, click, product_info)
 * @param {string} allocationKey - 할당 키
 * @param {number} proxyId - 프록시 ID
 * @param {Object} automationResult - 자동화 실행 결과
 * @param {string} finalErrorMessage - 최종 에러 메시지
 * @param {string} chromeVersion - Chrome 버전
 * @returns {Object} 에러 응답 객체
 */
function buildErrorResponse(workType, allocationKey, proxyId, automationResult, finalErrorMessage, chromeVersion) {
  if (workType === 'product_info') {
    // 상품 정보 추출 작업 실패 응답 - 단순화
    return {
      allocation_key: allocationKey,
      success: false,
      actual_ip: extractIpFromResult(automationResult),
      product_data: {},
      chrome_version: chromeVersion || 'default'
    };
  } else {
    // 기존 키워드 검색 작업 실패 응답
    const response = {
      allocation_key: allocationKey,
      proxy_id: proxyId,
      success: false,
      actual_ip: extractIpFromResult(automationResult),
      error_type: 'blocked',
      error_message: finalErrorMessage,
      chrome_version: chromeVersion || 'default'
    };

    // _abck 쿠키가 있는 경우에만 cookies와 cookie_state 추가
    if (automationResult?.cookies) {
      response.cookies = automationResult.cookies;
      response.cookie_state = automationResult.cookieState || 'initial_blocked';
    }

    return response;
  }
}

/**
 * 프록시 에러 응답 생성
 * @param {string} workType - 작업 타입
 * @param {string} allocationKey - 할당 키
 * @param {number} proxyId - 프록시 ID
 * @param {Object} automationResult - 자동화 실행 결과
 * @param {string} errorMessage - 에러 메시지
 * @param {string} chromeVersion - Chrome 버전
 * @returns {Object} 프록시 에러 응답 객체
 */
function buildProxyErrorResponse(workType, allocationKey, proxyId, automationResult, errorMessage, chromeVersion) {
  if (workType === 'product_info') {
    return {
      allocation_key: allocationKey,
      success: false,
      actual_ip: extractIpFromResult(automationResult),
      product_data: {},
      chrome_version: chromeVersion || 'default'
    };
  } else {
    return {
      allocation_key: allocationKey,
      proxy_id: proxyId,
      success: false,
      actual_ip: extractIpFromResult(automationResult),
      error_type: 'proxy_error',
      error_message: errorMessage || '프록시 연결 실패',
      chrome_version: chromeVersion || 'default'
    };
  }
}

/**
 * 일반 에러 응답 생성 (catch 블록용)
 * @param {string} workType - 작업 타입
 * @param {string} allocationKey - 할당 키
 * @param {number} proxyId - 프록시 ID
 * @param {Error} error - 에러 객체
 * @param {string} chromeVersion - Chrome 버전
 * @returns {Object} 에러 응답 객체
 */
function buildGeneralErrorResponse(workType, allocationKey, proxyId, error, chromeVersion) {
  if (workType === 'product_info') {
    return {
      allocation_key: allocationKey,
      success: false,
      actual_ip: null,
      product_data: {},
      chrome_version: chromeVersion || 'default'
    };
  } else {
    let errorType = 'unknown';
    if (error.message.includes('browser') || error.message.includes('Chrome')) {
      errorType = 'browser_error';
    } else if (error.message.includes('timeout')) {
      errorType = 'timeout';
    }

    return {
      allocation_key: allocationKey,
      proxy_id: proxyId,
      success: false,
      actual_ip: null,
      error_type: errorType,
      error_message: error.message,
      chrome_version: chromeVersion || 'default'
    };
  }
}

module.exports = {
  extractIpFromResult,
  buildErrorMessage,
  buildErrorResponse,
  buildProxyErrorResponse,
  buildGeneralErrorResponse
};
