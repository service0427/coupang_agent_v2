/**
 * 세션 초기화 모듈
 * CDP(Chrome DevTools Protocol)를 사용하여 쿠팡 접속 전 완전 초기화
 */

/**
 * CDP를 통한 세션 초기화
 * @param {Page} page - Playwright 페이지 객체
 * @param {boolean} clearSession - 사용자 세션 데이터 삭제 여부
 */
async function clearSessionWithCDP(page, clearSession = true) {
  if (!clearSession) {
    console.log('🔒 세션 데이터 유지');
    return;
  }

  try {
    const client = await page.context().newCDPSession(page);
    
    console.log('🧹 CDP를 통한 초기화 시작...');
    console.log(`   설정: 세션(${clearSession}), 캐시(false - 공유 캐시 사용)`);
    
    // 사용자 특정 가능한 모든 세션 데이터 삭제
    // 1. 쿠키 삭제
    await client.send('Network.clearBrowserCookies');
    console.log('   ✅ 쿠키 삭제 완료');
    
    // 2. 스토리지 삭제 (LocalStorage, SessionStorage, IndexedDB 등)
    await client.send('Storage.clearDataForOrigin', {
      origin: '*',
      storageTypes: 'all'
    });
    
    // 쿠팡 도메인의 스토리지 명시적 삭제
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
    console.log('   ✅ 스토리지 삭제 완료');
    
    // 3. Service Workers 제거
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
    
    // 4. 권한 초기화
    await client.send('Browser.resetPermissions');
    console.log('   ✅ 권한 초기화 완료');
    
    // 캐시는 공유 캐시 시스템 사용 (심볼릭 링크)
    console.log('   💾 캐시 보존 - 공유 캐시 시스템 사용');
    
    console.log('🧹 초기화 완료\n');
    
  } catch (error) {
    console.error('⚠️ CDP 초기화 중 오류:', error.message);
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