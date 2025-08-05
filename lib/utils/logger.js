/**
 * 중앙화된 로깅 유틸리티
 * 일관된 로그 포맷과 레벨 관리
 */

const { LOG_PREFIXES } = require('../constants');

class Logger {
  constructor(options = {}) {
    this.keywordId = options.keywordId || null;
    this.agent = options.agent || null;
    this.enableDebug = options.debug || false;
    this.silent = options.silent || false;
  }

  /**
   * 컨텍스트 설정
   */
  setContext(context = {}) {
    if (context.keywordId !== undefined) this.keywordId = context.keywordId;
    if (context.agent !== undefined) this.agent = context.agent;
    if (context.debug !== undefined) this.enableDebug = context.debug;
    if (context.silent !== undefined) this.silent = context.silent;
  }

  /**
   * 접두사 생성
   */
  getPrefix() {
    let prefix = '';
    if (this.keywordId) {
      prefix += LOG_PREFIXES.KEYWORD_ID(this.keywordId);
    }
    if (this.agent) {
      prefix += LOG_PREFIXES.AGENT(this.agent);
    }
    return prefix;
  }

  /**
   * 로그 출력
   */
  log(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(prefix + message, ...args);
  }

  /**
   * 정보 로그
   */
  info(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.INFO + prefix + message, ...args);
  }

  /**
   * 성공 로그
   */
  success(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.SUCCESS + prefix + message, ...args);
  }

  /**
   * 경고 로그
   */
  warn(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.WARNING + prefix + message, ...args);
  }

  /**
   * 에러 로그
   */
  error(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.error(LOG_PREFIXES.ERROR + prefix + message, ...args);
  }

  /**
   * 디버그 로그 (디버그 모드에서만)
   */
  debug(message, ...args) {
    if (!this.enableDebug || this.silent) return;
    const prefix = this.getPrefix();
    console.log('[DEBUG] ' + prefix + message, ...args);
  }

  /**
   * 검색 관련 로그
   */
  search(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.SEARCH + prefix + message, ...args);
  }

  /**
   * 장바구니 관련 로그
   */
  cart(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.CART + prefix + message, ...args);
  }

  /**
   * 쿠키 관련 로그
   */
  cookie(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.COOKIE + prefix + message, ...args);
  }

  /**
   * 네트워크 관련 로그
   */
  network(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.NETWORK + prefix + message, ...args);
  }

  /**
   * 프록시 관련 로그
   */
  proxy(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.PROXY + prefix + message, ...args);
  }

  /**
   * 시간 관련 로그
   */
  time(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.TIME + prefix + message, ...args);
  }

  /**
   * 페이지 관련 로그
   */
  page(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.PAGE + prefix + message, ...args);
  }

  /**
   * 타겟 관련 로그
   */
  target(message, ...args) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.log(LOG_PREFIXES.TARGET + prefix + message, ...args);
  }

  /**
   * 구분선 출력
   */
  separator() {
    if (this.silent) return;
    console.log('');
  }

  /**
   * 테이블 출력
   */
  table(data) {
    if (this.silent) return;
    console.table(data);
  }

  /**
   * 그룹 시작
   */
  group(label) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.group(prefix + label);
  }

  /**
   * 그룹 종료
   */
  groupEnd() {
    if (this.silent) return;
    console.groupEnd();
  }

  /**
   * 시간 측정 시작
   */
  timeStart(label) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.time(prefix + label);
  }

  /**
   * 시간 측정 종료
   */
  timeEnd(label) {
    if (this.silent) return;
    const prefix = this.getPrefix();
    console.timeEnd(prefix + label);
  }
}

/**
 * 싱글톤 인스턴스
 */
let defaultLogger = null;

/**
 * 기본 로거 가져오기
 */
function getLogger(options) {
  if (!defaultLogger) {
    defaultLogger = new Logger(options);
  } else if (options) {
    defaultLogger.setContext(options);
  }
  return defaultLogger;
}

/**
 * 새 로거 인스턴스 생성
 */
function createLogger(options) {
  return new Logger(options);
}

module.exports = {
  Logger,
  getLogger,
  createLogger
};