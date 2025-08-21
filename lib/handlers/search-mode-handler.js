/**
 * 쿠팡 검색 모드 핸들러 - DB 코드 제거 버전
 * - 검색창 입력 모드
 * - URL 직접 이동 모드
 */

const errorLogger = require('../services/error-logger');
const { SELECTORS } = require('../config/selectors');


/**
 * URL 직접 이동 모드로 검색 실행
 */
async function executeDirectMode(page, searchQuery, options = {}) {
  const idPrefix = options.keywordId ? `[ID:${options.keywordId}] ` : '';
  const threadPrefix = options.threadPrefix || '';
  console.log(`${threadPrefix} ${idPrefix}🌐 검색 결과 페이지 직접 접속 중... (URL 직접 모드)`);
  
  // 검색 URL 생성 (쿠팡 검색 URL 형식)
  const encodedQuery = encodeURIComponent(searchQuery);
  const searchUrl = `https://www.coupang.com/np/search?q=${encodedQuery}&channel=auto&listSize=72`;
  
  try {
    console.log(`${threadPrefix} ${idPrefix}📍 URL: ${searchUrl}`);
    
    // 차단 감지를 위한 빠른 타임아웃 설정 (프록시 토글 고려)
    const gotoPromise = page.goto(searchUrl, {
      waitUntil: 'load',
      timeout: 40000 
    });
    
    
    // ERR_HTTP2_PROTOCOL_ERROR 차단 에러 조기 감지 (3초 타임아웃)
    const earlyErrorDetection = new Promise((resolve, reject) => {
      let isResolved = false;
      
      // HTTP2_PROTOCOL_ERROR 즉시 감지
      page.on('requestfailed', (request) => {
        if (isResolved) return;
        const failure = request.failure();
        if (failure && failure.errorText.includes('HTTP2_PROTOCOL_ERROR')) {
          console.log(`${threadPrefix} ${idPrefix}🚫 차단 감지! 즉시 에러 처리`);
          isResolved = true;
          reject(new Error('쿠팡 접속 차단 감지됨'));
        }
      });
      
      // 3초 내에 HTTP2_PROTOCOL_ERROR 패턴 감지시 즉시 실패
      const quickFailTimer = setTimeout(() => {
        if (!isResolved) {
          // 3초 후에도 로딩 중이면 차단 가능성 체크
          const currentUrl = page.url();
          if (currentUrl === 'about:blank' || currentUrl.includes('chrome-error://')) {
            console.log(`${threadPrefix} ${idPrefix}🚫 3초 내 로딩 실패 - 차단 추정`);
            isResolved = true;
            reject(new Error('쿠팡 접속 차단 감지됨'));
          }
        }
      }, 3000);
      
      // 정상 로딩 완료시 resolve
      gotoPromise.then((result) => {
        if (!isResolved) {
          clearTimeout(quickFailTimer);
          isResolved = true;
          resolve(result);
        }
      }).catch((error) => {
        if (!isResolved) {
          clearTimeout(quickFailTimer);
          isResolved = true;
          reject(error);
        }
      });
    });
    
    // gotoPromise가 먼저 완료되거나 에러가 먼저 발생하면 즉시 반환
    await Promise.race([
      gotoPromise,
      earlyErrorDetection
    ]);
    
    console.log(`${threadPrefix} ${idPrefix}✅ 검색 결과 페이지 도달`);
    
    return {
      success: true,
      message: 'URL 직접 모드 실행 성공'
    };
    
  } catch (error) {
    // 프록시 연결 실패 시 즉시 종료
    if (error.message.includes('ERR_PROXY_CONNECTION_FAILED') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_NETWORK_CHANGED')) {
      console.log(`${threadPrefix} ${idPrefix}🚨 프록시 연결 실패 - 즉시 종료`);
      console.log(`${threadPrefix} ${idPrefix}   에러: ${error.message}`);
      
      // 프록시 실패 에러를 throw하여 상위에서 브라우저 정리 후 종료
      throw new Error('PROXY_FAILED: ' + error.message);
    }
    
    // HTTP2_PROTOCOL_ERROR 즉시 처리
    if (error.message.includes('HTTP2_PROTOCOL_ERROR')) {
      console.log(`${threadPrefix} ${idPrefix}🚫 차단으로 인한 즉시 실패`);
      throw new Error('쿠팡 접속 차단 감지됨');
    }
    
    console.log(`${threadPrefix} ${idPrefix}❌ URL 직접 모드 실행 실패: ${error.message}`);
    
    // 에러 로깅
    await errorLogger.logError({
      errorMessage: `URL 직접 모드 실행 실패: ${error.message}`,
      pageUrl: page.url(),
      keywordId: options.keywordId,
      agent: options.agent
    });
    
    return {
      success: false,
      errorMessage: error.message
    };
  }
}

module.exports = {
  executeDirectMode
};