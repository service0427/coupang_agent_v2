/**
 * 쿠팡 차단 감지 모듈
 */

/**
 * 페이지가 차단되었는지 확인
 */
async function isPageBlocked(page) {
  try {
    // 현재 URL 확인
    const url = page.url();
    
    // 차단 관련 URL 패턴
    if (url.includes('blocked') || 
        url.includes('error') || 
        url.includes('denied') ||
        url.includes('403') ||
        url.includes('challenge')) {
      return true;
    }
    
    // 페이지 내용 확인 (타임아웃 짧게 설정)
    const pageContent = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const title = document.title || '';
      return {
        bodyText: bodyText.toLowerCase(),
        title: title.toLowerCase(),
        hasContent: bodyText.length > 0
      };
    });
    
    // 차단 관련 키워드 확인
    const blockedKeywords = [
      'access denied',
      'access to this page',
      'blocked',
      '차단',
      '접근이 거부',
      '접근 거부',
      'forbidden',
      '403',
      'error occurred',
      'something went wrong',
      '오류가 발생',
      'challenge',
      'security check',
      '보안 검사'
    ];
    
    for (const keyword of blockedKeywords) {
      if (pageContent.bodyText.includes(keyword) || pageContent.title.includes(keyword)) {
        return true;
      }
    }
    
    // 빈 페이지인 경우 (차단으로 인한 빈 페이지)
    if (!pageContent.hasContent && !url.includes('about:blank')) {
      // 잠시 대기 후 다시 확인
      await page.waitForTimeout(1000);
      const recheck = await page.evaluate(() => document.body?.innerText?.length || 0);
      if (recheck === 0) {
        return true;
      }
    }
    
    // HTTP2 프로토콜 에러 체크
    const navigationError = await page.evaluate(() => {
      return window.performance.getEntriesByType('navigation')[0]?.serverTiming?.some(
        timing => timing.name.includes('error') || timing.description?.includes('HTTP2')
      );
    });
    
    if (navigationError) {
      return true;
    }
    
    return false;
  } catch (error) {
    // 에러 발생 시 차단으로 간주
    if (error.message.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_NETWORK_CHANGED')) {
      return true;
    }
    return false;
  }
}

/**
 * 차단 시 상세 정보 수집
 */
async function getBlockedInfo(page) {
  try {
    const info = {
      url: page.url(),
      title: await page.title(),
      bodyText: await page.evaluate(() => document.body?.innerText?.substring(0, 500) || ''),
      timestamp: new Date().toISOString()
    };
    
    // 차단 페이지의 주요 텍스트 추출
    const blockMessages = await page.evaluate(() => {
      const messages = [];
      // h1, h2, h3 태그의 텍스트 수집
      const headers = document.querySelectorAll('h1, h2, h3');
      headers.forEach(h => {
        if (h.innerText && h.innerText.trim()) {
          messages.push(h.innerText.trim());
        }
      });
      // 에러 메시지나 경고 텍스트 수집
      const errorElements = document.querySelectorAll('.error, .warning, .alert, [class*="error"], [class*="block"]');
      errorElements.forEach(el => {
        if (el.innerText && el.innerText.trim() && !messages.includes(el.innerText.trim())) {
          messages.push(el.innerText.trim());
        }
      });
      return messages.slice(0, 5); // 최대 5개만
    });
    
    if (blockMessages.length > 0) {
      info.blockMessages = blockMessages;
    }
    
    return info;
  } catch (error) {
    return {
      url: page.url(),
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  isPageBlocked,
  getBlockedInfo
};