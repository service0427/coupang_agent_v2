/**
 * Error Logger Stub for API Mode
 * API 모드에서는 모든 에러 로깅이 허브 서버로 처리됩니다.
 */

console.log('⚠️ [ERROR-LOGGER-STUB] 이 파일은 API 모드 호환성을 위한 스텁입니다. 실제 에러 로깅은 허브 서버에서 처리됩니다.');

/**
 * 에러 코드 추출 함수 (유지)
 */
function extractErrorCode(error) {
  if (!error) return null;
  
  const message = error.message || error.toString();
  
  // 일반적인 에러 코드 패턴
  const patterns = [
    /ERR_[A-Z0-9_]+/,           // ERR_HTTP2_PROTOCOL_ERROR
    /NS_ERROR_[A-Z0-9_]+/,      // NS_ERROR_FAILURE
    /net::[A-Z0-9_]+/,          // net::ERR_FAILED
    /[A-Z]+_ERROR/,             // PROTOCOL_ERROR
    /Error:\s*([A-Z0-9_]+)/,    // Error: TIMEOUT
    /code:\s*['"]?([A-Z0-9_]+)/i, // code: 'ECONNRESET'
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  // 특정 에러 메시지에서 코드 추출
  if (message.includes('Stream error')) return 'STREAM_ERROR';
  if (message.includes('Protocol error')) return 'PROTOCOL_ERROR';
  if (message.includes('Timeout')) return 'TIMEOUT_ERROR';
  if (message.includes('Navigation')) return 'NAVIGATION_ERROR';
  if (message.includes('Execution context was destroyed')) return 'CONTEXT_DESTROYED';
  if (message.includes('Target crashed')) return 'TARGET_CRASHED';
  
  return null;
}

/**
 * 에러 로깅 스텁 서비스
 */
class ErrorLoggerStub {
  /**
   * 에러 로그 저장 (스텁)
   */
  async logError(errorData) {
    // API 모드에서는 허브 서버가 에러 로깅 처리
    return null;
  }
  
  /**
   * 에러 통계 조회 (스텁)
   */
  async getErrorStats(options = {}) {
    // API 모드에서는 허브 서버가 통계 처리
    return { stats: [], totalErrors: 0 };
  }

  // extractErrorCode 함수는 유지
  extractErrorCode(error) {
    return extractErrorCode(error);
  }
}

// 싱글톤 인스턴스
const errorLogger = new ErrorLoggerStub();

module.exports = errorLogger;