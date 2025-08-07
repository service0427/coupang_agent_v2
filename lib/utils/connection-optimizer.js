/**
 * HTTP/2 연결 재사용 및 요청 최적화
 * - 연결 풀링으로 핸드셰이크 오버헤드 제거
 * - 요청 병합 및 배칭
 * - DNS 캐싱 및 프리페치
 */

/**
 * 연결 최적화 설정 적용
 */
async function optimizeConnections(page) {
  try {
    console.log('🌐 HTTP/2 연결 최적화 시작...');
    
    // DNS 프리페치 및 연결 최적화
    await page.evaluateOnNewDocument(() => {
      // DNS 프리페치
      const prefetchDomains = [
        'www.coupang.com',
        'image7.coupangcdn.com',
        'thumbnail7.coupangcdn.com',
        'static.coupangcdn.com',
        'front.coupangcdn.com'
      ];
      
      // 페이지 헤드에 DNS 프리페치 추가
      const head = document.head || document.getElementsByTagName('head')[0];
      
      prefetchDomains.forEach(domain => {
        // DNS 프리페치
        const dnsLink = document.createElement('link');
        dnsLink.rel = 'dns-prefetch';
        dnsLink.href = `//${domain}`;
        head.appendChild(dnsLink);
        
        // 연결 프리커넥트 
        const preconnectLink = document.createElement('link');
        preconnectLink.rel = 'preconnect';
        preconnectLink.href = `https://${domain}`;
        preconnectLink.crossOrigin = '';
        head.appendChild(preconnectLink);
      });
      
      console.log('[연결최적화] DNS 프리페치 및 프리커넥트 설정 완료');
    });
    
    // Keep-Alive 연결 유지 설정
    const client = await page.context().newCDPSession(page);
    
    await client.send('Network.enable');
    
    // HTTP/2 우선순위 설정
    await client.send('Network.setRequestInterception', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }]
    });
    
    client.on('Network.requestPaused', async (params) => {
      const { requestId, request } = params;
      
      try {
        // 중요 리소스 우선순위 상향
        const headers = { ...request.headers };
        
        // 핵심 API 요청 우선순위 최고
        if (request.url.includes('/search/') || 
            request.url.includes('/product/') ||
            request.url.includes('/api/')) {
          headers['Priority'] = 'u=0, i';
        }
        // CSS/JS 리소스 우선순위 중간
        else if (request.url.includes('.css') || request.url.includes('.js')) {
          headers['Priority'] = 'u=1, i';
        }
        // 이미지 우선순위 낮음
        else if (request.url.includes('image') || request.url.includes('thumbnail')) {
          headers['Priority'] = 'u=5, i';
        }
        
        // Keep-Alive 강제 활성화
        headers['Connection'] = 'keep-alive';
        
        await client.send('Network.continueRequestPaused', {
          requestId,
          headers
        });
        
      } catch (error) {
        // 요청 계속 처리
        await client.send('Network.continueRequestPaused', { requestId });
      }
    });
    
    console.log('✅ HTTP/2 연결 최적화 완료');
    
  } catch (error) {
    console.log('⚠️ 연결 최적화 설정 실패:', error.message);
  }
}

/**
 * 요청 배칭 및 병합
 */
async function enableRequestBatching(page) {
  try {
    console.log('📦 요청 배칭 시스템 활성화...');
    
    await page.evaluateOnNewDocument(() => {
      // 원본 fetch 함수 백업
      const originalFetch = window.fetch;
      const requestQueue = [];
      const batchDelay = 50; // 50ms 내 요청들을 배칭
      let batchTimer = null;
      
      // 배칭 가능한 요청 패턴
      const batchablePatterns = [
        /\/api\/search/,
        /\/api\/product/,
        /\/api\/recommendation/
      ];
      
      // 배칭된 fetch 함수
      window.fetch = function(resource, options = {}) {
        const url = typeof resource === 'string' ? resource : resource.url;
        
        // 배칭 가능한 요청인지 확인
        const isBatchable = batchablePatterns.some(pattern => pattern.test(url));
        
        if (!isBatchable || options.method === 'POST') {
          return originalFetch.apply(this, arguments);
        }
        
        // 배칭 큐에 추가
        return new Promise((resolve, reject) => {
          requestQueue.push({
            resource,
            options,
            resolve,
            reject
          });
          
          // 배칭 타이머 설정
          if (batchTimer) clearTimeout(batchTimer);
          
          batchTimer = setTimeout(() => {
            processBatchQueue();
          }, batchDelay);
        });
      };
      
      async function processBatchQueue() {
        if (requestQueue.length === 0) return;
        
        const currentBatch = [...requestQueue];
        requestQueue.length = 0;
        
        console.log(`[배칭] ${currentBatch.length}개 요청 병렬 처리`);
        
        // 모든 요청을 병렬로 실행
        const promises = currentBatch.map(({ resource, options, resolve, reject }) => {
          return originalFetch(resource, options)
            .then(resolve)
            .catch(reject);
        });
        
        await Promise.allSettled(promises);
      }
    });
    
    console.log('✅ 요청 배칭 시스템 활성화 완료');
    
  } catch (error) {
    console.log('⚠️ 요청 배칭 설정 실패:', error.message);
  }
}

/**
 * 연결 통계 수집
 */
async function getConnectionStats(page) {
  try {
    const stats = await page.evaluate(() => {
      // 연결 정보 수집 (가능한 범위에서)
      return {
        userAgent: navigator.userAgent,
        connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        timestamp: Date.now()
      };
    });
    
    return stats;
    
  } catch (error) {
    console.log('연결 통계 수집 실패:', error.message);
    return null;
  }
}

module.exports = {
  optimizeConnections,
  enableRequestBatching,
  getConnectionStats
};