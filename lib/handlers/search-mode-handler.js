/**
 * 쿠팡 검색 모드 핸들러
 * - 검색창 입력 모드
 * - URL 직접 이동 모드
 */

const errorLogger = require('../services/error-logger');
const { setupResourceBlocker } = require('../utils/resource-blocker');

/**
 * 검색창 입력 모드로 검색 실행
 */
async function executeSearchMode(page, searchQuery, optimizationLevel, options = {}) {
  const idPrefix = options.keywordId ? `[ID:${options.keywordId}] ` : '';
  console.log(`${idPrefix}🌐 쿠팡 메인 페이지 접속 중... (검색창 입력 모드)`);
  
  // 메인페이지 최적화 설정
  await setupResourceBlocker(page, optimizationLevel);
  
  try {
    await page.goto('https://www.coupang.com', { 
      waitUntil: 'load',
      timeout: 60000 
    });
    
    console.log(`${idPrefix}⏳ 페이지 로딩 안정화를 위해 3초 대기...`);
    await page.waitForTimeout(3000);
    
    // 검색창 찾기 및 입력
    console.log(`${idPrefix}🔍 검색창을 찾는 중...`);
    
    const searchInput = await page.waitForSelector('input[name="q"]', { timeout: 10000 });
    console.log(`${idPrefix}✅ 검색창 발견`);
    
    // 검색창 클릭 및 기존 텍스트 완전 삭제
    await searchInput.click({ clickCount: 3 }); // 트리플 클릭으로 전체 선택
    await page.waitForTimeout(300);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    
    // 추가로 clear 메서드 사용
    await searchInput.fill('');
    await page.waitForTimeout(200);
    
    // 한번 더 클릭하여 포커스 확실히
    await searchInput.click();
    await page.waitForTimeout(300);
    
    // 검색어 타이핑
    console.log(`${idPrefix}⌨️ 검색어 입력 중: "${searchQuery}"`);
    for (const char of searchQuery) {
      await page.keyboard.type(char);
      await page.waitForTimeout(10 + Math.random() * 50);
    }
    
    await page.waitForTimeout(1000);
    
    // Enter 키로 검색
    console.log(`${idPrefix}⌨️ Enter 키로 검색`);
    
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }),
        page.keyboard.press('Enter')
      ]);
      
      console.log(`${idPrefix}⏳ 검색 결과 페이지 로딩 안정화를 위해 5초 대기...`);
      await page.waitForTimeout(5000);
      
      // URL이 검색 결과 페이지로 변경되었는지 확인
      const currentUrl = page.url();
      if (!currentUrl.includes('/np/search')) {
        console.log(`${idPrefix}⚠️ URL이 검색 결과 페이지로 변경되지 않음`);
        console.log(`${idPrefix}   현재 URL: ${currentUrl}`);
        console.log(`${idPrefix}   검색이 실행되지 않았을 가능성이 있습니다`);
        return { success: false, errorMessage: '검색 페이지 이동 실패' };
      } else {
        console.log(`${idPrefix}✅ 검색 결과 페이지로 이동 완료`);
      }
      
      return { success: true };
      
    } catch (navError) {
      console.log(`${idPrefix}⚠️ 네비게이션 실패:`, navError.message);
      
      // Chrome 에러 코드가 있는 경우 로깅
      if (navError.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
          navError.message.includes('ERR_HTTP2_PROTOCCOL_ERROR') ||
          navError.message.includes('ERR_CONNECTION_REFUSED') || 
          navError.message.includes('ERR_NETWORK_CHANGED')) {
        // 에러 코드별 명확한 메시지
        let specificError = '네트워크 오류';
        if (navError.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || navError.message.includes('ERR_HTTP2_PROTOCCOL_ERROR')) {
          specificError = '쿠팡 접속 차단 (HTTP/2 프로토콜 오류)';
        } else if (navError.message.includes('ERR_CONNECTION_REFUSED')) {
          specificError = '연결 거부됨';
        } else if (navError.message.includes('ERR_NETWORK_CHANGED')) {
          specificError = '네트워크 변경 감지';
        }
        
        console.log(`${idPrefix}❌ ${specificError}`);
        
        await errorLogger.logError({
          browser: 'chrome',
          errorMessage: navError.message,
          pageUrl: page.url(),
          proxyUsed: options.proxyConfig?.server,
          actualIp: options.actualIp,
          keywordId: options.keywordId,
          agent: options.agent
        });
        
        // 차단 관련 에러는 바로 원본 에러 메시지 반환
        if (navError.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || navError.message.includes('ERR_HTTP2_PROTOCCOL_ERROR')) {
          return { success: false, errorMessage: navError.message };
        }
      }
      
      // 검색 결과 확인 시도
      await page.waitForTimeout(5000);
      const currentUrl = page.url();
      if (!currentUrl.includes('/np/search')) {
        console.log(`${idPrefix}❌ 검색 페이지로 이동 실패`);
        return { success: false, errorMessage: '검색 페이지 이동 실패' };
      }
      
      return { success: true };
    }
    
  } catch (error) {
    console.log(`${idPrefix}❌ 검색창 입력 중 오류:`, error.message);
    
    // 에러 로깅
    await errorLogger.logError({
      browser: 'chrome',
      errorMessage: error.message,
      errorCode: error.code,
      pageUrl: page.url(),
      proxyUsed: options.proxyConfig?.server,
      actualIp: options.actualIp,
      keywordId: options.keywordId,
      agent: options.agent
    });
    
    // 대체 방법: URL 직접 이동
    console.log(`${idPrefix}🔄 대체 방법으로 URL 직접 이동 시도...`);
    const encodedQuery = encodeURIComponent(searchQuery);
    await page.goto(`https://www.coupang.com/np/search?q=${encodedQuery}`, {
      waitUntil: 'load',
      timeout: 60000
    });
    
    return { success: true, fallback: true };
  }
}

/**
 * URL 직접 이동 모드로 검색 실행
 */
async function executeDirectMode(page, searchQuery, options = {}) {
  const idPrefix = options.keywordId ? `[ID:${options.keywordId}] ` : '';
  console.log(`${idPrefix}🌐 쿠팡 검색 페이지 접속 중... (URL 직접 이동 모드)`);
  const encodedQuery = encodeURIComponent(searchQuery);
  
  // listSize 옵션 랜덤 선택 (확률: 50%)
  const listSizes = [null, 36, 48, 60, 72];
  const randomListSize = listSizes[Math.floor(Math.random() * listSizes.length)];
  
  // page 파라미터 랜덤 추가 (listSize가 있을 때만, 확률: 30%)
  const addPageParam = randomListSize && Math.random() < 0.3;
  
  // URL 구성
  let searchUrl = `https://www.coupang.com/np/search?q=${encodedQuery}&channel=auto`;
  
  if (randomListSize) {
    searchUrl += `&listSize=${randomListSize}`;
    console.log(`${idPrefix}   📊 리스트 크기: ${randomListSize}개`);
  }
  
  if (addPageParam) {
    searchUrl += '&page=1';
    console.log(`${idPrefix}   📄 페이지: 1`);
  }
  
  console.log(`${idPrefix}   🔗 접속 URL: ${searchUrl}`);
  
  await page.goto(searchUrl, {
    waitUntil: 'load',
    timeout: 60000
  });
  
  console.log(`${idPrefix}⏳ 페이지 로딩 안정화를 위해 3초 대기...`);
  await page.waitForTimeout(3000);
  
  return { success: true };
}

module.exports = {
  executeSearchMode,
  executeDirectMode
};