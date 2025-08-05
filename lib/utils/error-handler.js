/**
 * 표준화된 에러 처리 유틸리티
 * 일관된 에러 응답 형식과 처리 로직
 */

const { ERROR_MESSAGES } = require('../constants');
const { getLogger } = require('./logger');

/**
 * 에러 타입 정의
 */
const ERROR_TYPES = {
  // 네트워크 관련
  NETWORK: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  PROXY: 'PROXY_ERROR',
  BLOCKED: 'BLOCKED_ERROR',
  
  // 페이지 관련
  PAGE_LOAD: 'PAGE_LOAD_ERROR',
  NAVIGATION: 'NAVIGATION_ERROR',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  
  // 비즈니스 로직
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  CART_ERROR: 'CART_ERROR',
  SEARCH_ERROR: 'SEARCH_ERROR',
  
  // 시스템
  DATABASE: 'DATABASE_ERROR',
  BROWSER: 'BROWSER_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
};

/**
 * 에러 심각도 레벨
 */
const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * 표준 에러 응답 객체
 */
class StandardError {
  constructor(type, message, details = {}) {
    this.type = type;
    this.message = message;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.severity = this.determineSeverity(type);
  }

  /**
   * 에러 타입에 따른 심각도 결정
   */
  determineSeverity(type) {
    const severityMap = {
      [ERROR_TYPES.BLOCKED]: ERROR_SEVERITY.CRITICAL,
      [ERROR_TYPES.NETWORK]: ERROR_SEVERITY.HIGH,
      [ERROR_TYPES.PROXY]: ERROR_SEVERITY.HIGH,
      [ERROR_TYPES.DATABASE]: ERROR_SEVERITY.HIGH,
      [ERROR_TYPES.BROWSER]: ERROR_SEVERITY.HIGH,
      [ERROR_TYPES.TIMEOUT]: ERROR_SEVERITY.MEDIUM,
      [ERROR_TYPES.PAGE_LOAD]: ERROR_SEVERITY.MEDIUM,
      [ERROR_TYPES.NAVIGATION]: ERROR_SEVERITY.MEDIUM,
      [ERROR_TYPES.PRODUCT_NOT_FOUND]: ERROR_SEVERITY.LOW,
      [ERROR_TYPES.ELEMENT_NOT_FOUND]: ERROR_SEVERITY.LOW,
      [ERROR_TYPES.CART_ERROR]: ERROR_SEVERITY.LOW,
      [ERROR_TYPES.SEARCH_ERROR]: ERROR_SEVERITY.LOW
    };
    
    return severityMap[type] || ERROR_SEVERITY.MEDIUM;
  }

  /**
   * JSON 형식으로 변환
   */
  toJSON() {
    return {
      type: this.type,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      details: this.details
    };
  }

  /**
   * 로그용 문자열 변환
   */
  toString() {
    return `[${this.type}] ${this.message}`;
  }
}

/**
 * 에러 핸들러 클래스
 */
class ErrorHandler {
  constructor(logger = null) {
    this.logger = logger || getLogger();
  }

  /**
   * 에러 타입 추출
   */
  extractErrorType(error) {
    // 에러 메시지 기반 타입 매핑
    const errorPatterns = {
      [ERROR_TYPES.BLOCKED]: /ERR_HTTP2_PROTOCOL_ERROR|쿠팡 접속 차단|차단|blocked/i,
      [ERROR_TYPES.TIMEOUT]: /timeout|시간 초과|Timeout.*exceeded/i,
      [ERROR_TYPES.PROXY]: /proxy|프록시|ERR_PROXY/i,
      [ERROR_TYPES.NETWORK]: /network|네트워크|ERR_NETWORK|ERR_CONNECTION/i,
      [ERROR_TYPES.PAGE_LOAD]: /page\.goto|페이지 로드|navigation/i,
      [ERROR_TYPES.ELEMENT_NOT_FOUND]: /waitForSelector|selector|찾을 수 없/i,
      [ERROR_TYPES.PRODUCT_NOT_FOUND]: /상품을 찾을 수 없|product not found/i,
      [ERROR_TYPES.CART_ERROR]: /장바구니|cart/i,
      [ERROR_TYPES.DATABASE]: /database|db|postgres|pg/i,
      [ERROR_TYPES.BROWSER]: /browser|chrome|chromium|playwright/i
    };

    const errorMessage = error.message || error.toString();
    
    for (const [type, pattern] of Object.entries(errorPatterns)) {
      if (pattern.test(errorMessage)) {
        return type;
      }
    }

    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * 에러 코드 추출 (기존 호환성 유지)
   */
  extractErrorCode(error) {
    const errorMessage = error.message || '';
    
    // Playwright 에러 코드
    const playwrightMatch = errorMessage.match(/Error: (.+?):/);
    if (playwrightMatch) return playwrightMatch[1];
    
    // Chrome 에러 코드
    const chromeMatch = errorMessage.match(/net::(ERR_\w+)/);
    if (chromeMatch) return chromeMatch[1];
    
    // HTTP 상태 코드
    const httpMatch = errorMessage.match(/(\d{3})/);
    if (httpMatch && httpMatch[1].match(/^[4-5]\d{2}$/)) {
      return `HTTP_${httpMatch[1]}`;
    }
    
    return null;
  }

  /**
   * 에러 처리 및 표준화
   */
  handle(error, context = {}) {
    const errorType = this.extractErrorType(error);
    const errorCode = this.extractErrorCode(error);
    
    // 표준 에러 객체 생성
    const standardError = new StandardError(
      errorType,
      error.message || ERROR_MESSAGES.UNKNOWN,
      {
        code: errorCode,
        stack: error.stack,
        ...context
      }
    );

    // 심각도에 따른 로깅
    this.logError(standardError);
    
    return standardError;
  }

  /**
   * 에러 로깅
   */
  logError(standardError) {
    const { severity, message, type, details } = standardError;
    
    switch (severity) {
      case ERROR_SEVERITY.CRITICAL:
        this.logger.error(`[치명적] ${message}`);
        this.logger.error(`타입: ${type}, 코드: ${details.code || 'N/A'}`);
        break;
        
      case ERROR_SEVERITY.HIGH:
        this.logger.error(message);
        this.logger.debug(`타입: ${type}, 코드: ${details.code || 'N/A'}`);
        break;
        
      case ERROR_SEVERITY.MEDIUM:
        this.logger.warn(message);
        break;
        
      case ERROR_SEVERITY.LOW:
        this.logger.debug(`에러: ${message}`);
        break;
    }
  }

  /**
   * 재시도 가능 여부 확인
   */
  isRetryable(error) {
    const nonRetryableTypes = [
      ERROR_TYPES.BLOCKED,
      ERROR_TYPES.PRODUCT_NOT_FOUND,
      ERROR_TYPES.UNKNOWN
    ];
    
    const errorType = error.type || this.extractErrorType(error);
    return !nonRetryableTypes.includes(errorType);
  }

  /**
   * 에러 래핑 (기존 함수 감싸기)
   */
  wrap(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        const standardError = this.handle(error, context);
        throw standardError;
      }
    };
  }

  /**
   * 안전한 실행 (에러 시 기본값 반환)
   */
  async safeExecute(fn, defaultValue = null, context = {}) {
    try {
      return await fn();
    } catch (error) {
      this.handle(error, context);
      return defaultValue;
    }
  }
}

/**
 * 싱글톤 인스턴스
 */
let defaultHandler = null;

/**
 * 기본 에러 핸들러 가져오기
 */
function getErrorHandler(logger) {
  if (!defaultHandler) {
    defaultHandler = new ErrorHandler(logger);
  }
  return defaultHandler;
}

/**
 * 새 에러 핸들러 생성
 */
function createErrorHandler(logger) {
  return new ErrorHandler(logger);
}

module.exports = {
  ErrorHandler,
  StandardError,
  ERROR_TYPES,
  ERROR_SEVERITY,
  getErrorHandler,
  createErrorHandler
};