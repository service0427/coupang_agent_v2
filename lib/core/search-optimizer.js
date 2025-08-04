/**
 * 검색 최적화 모듈 (메인페이지 전용)
 * 불필요한 리소스를 차단하여 검색 속도 향상
 */

const OPTIMIZATION_PRESETS = {
  maximum: {
    blockImages: true,
    blockMedia: true,
    blockFonts: true,
    blockAds: true,
    blockTracking: true,
    blockPromotions: true,
    blockBanners: true,
    blockCss: false
  },
  balanced: {
    blockImages: true,
    blockMedia: true,
    blockFonts: true,
    blockAds: true,
    blockTracking: true,
    blockPromotions: true,
    blockBanners: true,
    blockCss: false
  },
  minimal: {
    blockImages: false,
    blockMedia: true,
    blockFonts: false,
    blockAds: true,
    blockTracking: true,
    blockPromotions: false,
    blockBanners: false,
    blockCss: false
  }
};

/**
 * 차단할 도메인 목록
 */
const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.com',
  'doubleclick.net',
  'criteo.com',
  'amazon-adsystem.com',
  'googleadservices.com',
  'googlesyndication.com',
  'adnxs.com',
  'adsrvr.org',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com',
  'segment.com',
  'hotjar.com',
  'mixpanel.com',
  'amplitude.com',
  'newrelic.com',
  'sentry.io',
  'bugsnag.com',
  'branch.io',
  'appsflyer.com',
  'adjust.com',
  'kochava.com'
];

/**
 * 차단할 URL 패턴
 */
const BLOCKED_PATTERNS = [
  /banner/i,
  /promotion/i,
  /popup/i,
  /tracking/i,
  /analytics/i,
  /pixel/i,
  /beacon/i,
  /telemetry/i,
  /metrics/i,
  /collect/i,
  /log-?event/i,
  /click-?track/i,
  /impression/i,
  /conversion/i,
  /retargeting/i,
  /remarketing/i
];

/**
 * 검색 최적화 적용
 * @param {Page} page - Playwright 페이지 객체
 * @param {string|Object} preset - 최적화 프리셋 이름 또는 커스텀 설정
 * @returns {Function} 최적화 해제 함수
 */
async function applySearchOptimization(page, preset = 'balanced') {
  const settings = typeof preset === 'string' 
    ? OPTIMIZATION_PRESETS[preset] || OPTIMIZATION_PRESETS.balanced
    : preset;

  let blockedCount = 0;
  let allowedCount = 0;
  let isActive = true;

  console.log('🚀 검색 최적화 적용 중...');
  console.log(`   설정: ${JSON.stringify(settings, null, 2)}`);

  // 네트워크 요청 인터셉터 설정
  await page.route('**/*', async (route) => {
    if (!isActive) {
      await route.continue();
      return;
    }

    const request = route.request();
    const url = request.url();
    const resourceType = request.resourceType();

    // 필수 리소스는 항상 허용
    if (resourceType === 'document' || 
        resourceType === 'xhr' || 
        resourceType === 'fetch') {
      allowedCount++;
      await route.continue();
      return;
    }

    // 리소스 타입별 차단
    let shouldBlock = false;

    if (settings.blockImages && (resourceType === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|#|$)/i))) {
      shouldBlock = true;
    }

    if (settings.blockMedia && (resourceType === 'media' || url.match(/\.(mp4|webm|mp3|wav|ogg)(\?|#|$)/i))) {
      shouldBlock = true;
    }

    if (settings.blockFonts && (resourceType === 'font' || url.match(/\.(woff|woff2|ttf|otf|eot)(\?|#|$)/i))) {
      shouldBlock = true;
    }

    if (settings.blockCss && resourceType === 'stylesheet') {
      shouldBlock = true;
    }

    // 도메인 차단
    if (settings.blockAds || settings.blockTracking) {
      for (const domain of BLOCKED_DOMAINS) {
        if (url.includes(domain)) {
          shouldBlock = true;
          break;
        }
      }
    }

    // URL 패턴 차단
    if (settings.blockPromotions || settings.blockBanners || settings.blockTracking) {
      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(url)) {
          shouldBlock = true;
          break;
        }
      }
    }

    if (shouldBlock) {
      blockedCount++;
      if (blockedCount <= 10) {
        console.log(`🚫 차단: ${resourceType} - ${url.substring(0, 80)}...`);
      }
      await route.abort();
    } else {
      allowedCount++;
      await route.continue();
    }
  });

  // 최적화 해제 함수 반환
  return () => {
    isActive = false;
    console.log(`📊 최적화 통계: 차단 ${blockedCount}개, 허용 ${allowedCount}개`);
  };
}

module.exports = {
  applySearchOptimization,
  OPTIMIZATION_PRESETS,
  BLOCKED_DOMAINS,
  BLOCKED_PATTERNS
};