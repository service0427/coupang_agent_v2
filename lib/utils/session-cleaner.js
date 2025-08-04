/**
 * 세션 초기화 모듈
 * CDP(Chrome DevTools Protocol)를 사용하여 쿠팡 접속 전 완전 초기화
 */

/**
 * CDP를 통한 완전한 세션 초기화
 */
async function clearSessionWithCDP(page) {
  try {
    const client = await page.context().newCDPSession(page);
    
    console.log('🧹 CDP를 통한 세션 초기화 시작...');
    
    // 1. 모든 쿠키 삭제
    await client.send('Network.clearBrowserCookies');
    console.log('   ✅ 쿠키 삭제 완료');
    
    // 2. 브라우저 캐시 삭제
    await client.send('Network.clearBrowserCache');
    console.log('   ✅ 캐시 삭제 완료');
    
    // 3. 모든 스토리지 삭제 (LocalStorage, SessionStorage, IndexedDB 등)
    await client.send('Storage.clearDataForOrigin', {
      origin: '*',
      storageTypes: 'all'
    });
    
    // 4. 쿠팡 도메인의 스토리지 명시적 삭제
    const coupangOrigins = [
      'https://www.coupang.com',
      'https://coupang.com',
      'https://login.coupang.com',
      'https://m.coupang.com'
    ];
    
    for (const origin of coupangOrigins) {
      try {
        await client.send('Storage.clearDataForOrigin', {
          origin: origin,
          storageTypes: 'all'
        });
      } catch (e) {
        // 도메인이 아직 방문되지 않았을 수 있음
      }
    }
    console.log('   ✅ 쿠팡 도메인 스토리지 삭제 완료');
    
    // 5. Service Workers 제거
    try {
      const { registrations } = await client.send('ServiceWorker.getRegistrations');
      for (const registration of registrations || []) {
        await client.send('ServiceWorker.unregister', {
          scopeURL: registration.scopeURL
        });
      }
      console.log('   ✅ Service Workers 제거 완료');
    } catch (e) {
      // Service Worker가 없을 수 있음
    }
    
    // 6. 권한 초기화
    await client.send('Browser.resetPermissions');
    console.log('   ✅ 권한 초기화 완료');
    
    console.log('🧹 CDP 세션 초기화 완료\n');
    
  } catch (error) {
    console.error('⚠️ CDP 세션 초기화 중 오류:', error.message);
  }
}

/**
 * 기존 방식의 쿠키와 스토리지 초기화 (폴백용)
 */
async function clearCookiesAndStorage(context, page) {
  try {
    // 모든 쿠키 삭제
    await context.clearCookies();
    console.log('🧹 쿠키 초기화 완료');
    
    // about:blank 페이지에서 스토리지 초기화
    await page.goto('about:blank');
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.error('Storage clear error:', e);
      }
    });
    
    console.log('🧹 스토리지 초기화 완료');
  } catch (error) {
    console.error('⚠️ 쿠키/스토리지 초기화 중 오류:', error.message);
  }
}

module.exports = {
  clearSessionWithCDP,
  clearCookiesAndStorage
};