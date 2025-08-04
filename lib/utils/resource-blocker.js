/**
 * 리소스 차단 유틸리티
 * - 메인페이지 최적화를 위한 불필요한 리소스 차단
 * - 검색 페이지 이동 시 자동 해제
 */

/**
 * 메인페이지 최적화 라우트 핸들러 설정
 */
async function setupResourceBlocker(page, optimizationLevel) {
  if (!optimizationLevel) {
    return null;
  }

  console.log(`🚀 메인페이지 최적화 활성화`);
  
  const stats = {
    optimizationActive: true,
    blockedCount: 0,
    allowedCount: 0
  };
  
  // 최적화 핸들러 설정
  await page.route('**/*', async (route) => {
    const request = route.request();
    const pageUrl = page.url();
    const url = request.url();
    const resourceType = request.resourceType();
    
    // 현재 페이지가 메인페이지인지 확인
    const isMainPage = !pageUrl.includes('/np/search');
    
    // 검색 결과 페이지로 이동했는지 확인
    if (!isMainPage && stats.optimizationActive) {
      console.log(`🔄 검색 결과 페이지로 이동 - 최적화 해제`);
      console.log(`📊 메인페이지 최적화 통계: 차단 ${stats.blockedCount}개, 허용 ${stats.allowedCount}개`);
      stats.optimizationActive = false;
    }
    
    // 메인페이지에서만 그리고 최적화가 활성화된 경우에만 차단
    if (isMainPage && stats.optimizationActive) {
      const shouldAllow = isEssentialResource(resourceType, url);
      
      if (shouldAllow) {
        stats.allowedCount++;
        await route.continue();
      } else {
        stats.blockedCount++;
        if (stats.blockedCount <= 5) {
          console.log(`🚫 차단: ${resourceType} - ${url.substring(0, 80)}...`);
        }
        await route.abort();
      }
    } else {
      // 메인페이지가 아니거나 최적화가 비활성화된 경우 모든 리소스 허용
      await route.continue();
    }
  });
  
  return stats;
}

/**
 * 필수 리소스인지 확인
 */
function isEssentialResource(resourceType, url) {
  // 필수 리소스 타입
  const essentialTypes = ['document', 'script', 'stylesheet', 'xhr', 'fetch'];
  if (essentialTypes.includes(resourceType)) {
    return true;
  }
  
  // 차단할 리소스 타입
  const blockTypes = ['image', 'media', 'font', 'websocket', 'manifest'];
  if (blockTypes.includes(resourceType)) {
    return false;
  }
  
  // URL 패턴으로 차단
  const blockPatterns = [
    'banner',
    'promotion',
    'google-analytics',
    'googletagmanager',
    'facebook',
    'criteo',
    'doubleclick',
    'amazon-adsystem'
  ];
  
  for (const pattern of blockPatterns) {
    if (url.includes(pattern)) {
      return false;
    }
  }
  
  // cloudfront 이미지 차단
  if (url.includes('cloudfront') && resourceType === 'image') {
    return false;
  }
  
  // 이미지 파일 차단
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|#|$)/i)) {
    return false;
  }
  
  return true;
}

module.exports = {
  setupResourceBlocker
};