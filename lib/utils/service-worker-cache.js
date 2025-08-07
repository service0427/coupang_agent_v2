/**
 * Service Worker 기반 고급 캐싱 시스템
 * - 정적 리소스 영구 캐싱
 * - API 응답 조건부 캐싱  
 * - 오프라인 대체 리소스
 */

/**
 * Service Worker 스크립트 생성
 */
function generateServiceWorkerScript() {
  return `
const CACHE_NAME = 'coupang-optimizer-v1';
const STATIC_CACHE = 'coupang-static-v1';

// 캐시할 정적 리소스 패턴
const CACHEABLE_PATTERNS = [
  /\\.css(\\?.*)?$/,
  /\\.js(\\?.*)?$/,
  /\\.woff2?(\\?.*)?$/,
  /\\.png(\\?.*)?$/,
  /\\.jpg(\\?.*)?$/,
  /\\.svg(\\?.*)?$/
];

// 영구 캐시 리소스 (버전 변경까지 유지)
const PERMANENT_CACHE_PATTERNS = [
  /coupangcdn\\.com.*\\.(css|js|woff2?)$/,
  /static.*\\.(css|js|woff2?)$/
];

self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // 쿠팡 도메인만 처리
  if (!url.hostname.includes('coupang.com') && !url.hostname.includes('coupangcdn.com')) {
    return;
  }
  
  // 캐시 가능한 리소스 확인
  const isCacheable = CACHEABLE_PATTERNS.some(pattern => pattern.test(url.pathname));
  const isPermanent = PERMANENT_CACHE_PATTERNS.some(pattern => pattern.test(request.url));
  
  if (isCacheable) {
    event.respondWith(handleCacheableRequest(request, isPermanent));
  }
});

async function handleCacheableRequest(request, isPermanent) {
  const cacheName = isPermanent ? STATIC_CACHE : CACHE_NAME;
  const cache = await caches.open(cacheName);
  
  try {
    // 캐시 우선 전략
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('[SW] Cache hit:', request.url.substring(0, 50) + '...');
      
      // 영구 캐시가 아닌 경우 백그라운드 업데이트
      if (!isPermanent) {
        fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
        }).catch(() => {});
      }
      
      return cachedResponse;
    }
    
    // 네트워크에서 가져와서 캐시
    console.log('[SW] Network fetch:', request.url.substring(0, 50) + '...');
    const response = await fetch(request);
    
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    console.log('[SW] Fetch failed:', error.message);
    
    // 오프라인 대체 리소스
    if (request.destination === 'image') {
      return new Response(
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="transparent"/></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    
    throw error;
  }
}
`;
}

/**
 * Service Worker 등록
 */
async function registerServiceWorker(page) {
  try {
    console.log('🔧 Service Worker 캐싱 시스템 등록 중...');
    
    const swScript = generateServiceWorkerScript();
    
    // Service Worker 등록
    await page.evaluateOnNewDocument((script) => {
      // Service Worker 스크립트를 Blob URL로 생성
      const blob = new Blob([script], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);
      
      // 페이지 로드 후 등록
      window.addEventListener('load', async () => {
        try {
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.register(swUrl);
            console.log('[캐시] Service Worker 등록 완료:', registration.scope);
            
            // 즉시 활성화
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        } catch (error) {
          console.log('[캐시] Service Worker 등록 실패:', error.message);
        }
      });
    }, swScript);
    
    console.log('✅ Service Worker 캐싱 시스템 등록 완료');
    
  } catch (error) {
    console.log('⚠️ Service Worker 등록 실패:', error.message);
  }
}

/**
 * 캐시 통계 조회
 */
async function getCacheStats(page) {
  try {
    const stats = await page.evaluate(async () => {
      if (!('caches' in window)) return null;
      
      const cacheNames = await caches.keys();
      const stats = {
        cacheCount: cacheNames.length,
        totalEntries: 0,
        cacheDetails: []
      };
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        stats.totalEntries += keys.length;
        stats.cacheDetails.push({
          name: cacheName,
          entries: keys.length,
          urls: keys.slice(0, 5).map(req => req.url.substring(0, 60) + '...')
        });
      }
      
      return stats;
    });
    
    return stats;
    
  } catch (error) {
    console.log('캐시 통계 조회 실패:', error.message);
    return null;
  }
}

module.exports = {
  registerServiceWorker,
  getCacheStats
};