/**
 * 네트워크 트래픽 모니터링 모듈
 * - 모든 네트워크 요청을 가로채서 분석
 * - 도메인, 타입, 프로토콜, 파일 크기 수집
 */

class NetworkMonitor {
  constructor() {
    this.requests = [];
    this.requestMap = new Map(); // requestId로 요청 추적
    this.domains = new Map();
    this.resourceTypes = new Map();
    this.protocols = new Map();
    this.cacheStats = {
      total: 0,
      fromCache: 0,
      fromMemoryCache: 0,
      fromDiskCache: 0,
      fromServiceWorker: 0,
      fromNetwork: 0,
      byType: new Map()
    };
    this.startTime = Date.now();
    this.isMonitoring = false;
    this.cdpSession = null;
  }

  /**
   * 네트워크 모니터링 시작
   */
  async start(page) {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startTime = Date.now();
    console.log('📡 네트워크 트래픽 모니터링 시작...');

    // CDP 세션 생성
    try {
      this.cdpSession = await page.context().newCDPSession(page);
      console.log('   ✅ CDP 세션 생성 성공');
      
      // Network 도메인 활성화
      await this.cdpSession.send('Network.enable');
      console.log('   ✅ Network 도메인 활성화');
      
      // 캐시 정보를 포함한 상세 응답 정보 수집
      this.cdpSession.on('Network.responseReceived', (params) => {
        const { requestId, response, type } = params;
        
        // 요청 정보 초기화
        if (!this.requestMap.has(requestId)) {
          this.requestMap.set(requestId, {
            requestId,
            url: response.url,
            status: response.status,
            type: type.toLowerCase(),
            fromCache: response.fromDiskCache || response.fromServiceWorker || response.fromPrefetchCache || response.fromMemoryCache || false,
            fromMemoryCache: response.fromMemoryCache || false,
            fromDiskCache: response.fromDiskCache || false,
            fromServiceWorker: response.fromServiceWorker || false,
            cacheType: response.fromMemoryCache ? 'memory' :
                      response.fromDiskCache ? 'disk' : 
                      response.fromServiceWorker ? 'service-worker' : 
                      response.fromPrefetchCache ? 'prefetch' : null,
            timestamp: Date.now()
          });
          
          if (response.fromDiskCache || response.fromServiceWorker || response.fromPrefetchCache || response.fromMemoryCache) {
            const cacheType = response.fromMemoryCache ? 'Memory' : 
                             response.fromDiskCache ? 'Disk' : 
                             response.fromServiceWorker ? 'ServiceWorker' : 'Prefetch';
            console.log(`   💾 ${cacheType} Cache 히트: ${response.url.substring(0, 80)}...`);
          }
        }
      });

      // 캐시 정보가 포함된 추가 응답 정보
      this.cdpSession.on('Network.responseReceivedExtraInfo', (params) => {
        const { requestId, headers } = params;
        const request = this.requestMap.get(requestId);
        if (request) {
          request.headers = headers;
        }
      });

      // 캐시에서 로드된 요청 감지
      this.cdpSession.on('Network.requestServedFromCache', (params) => {
        const { requestId } = params;
        const request = this.requestMap.get(requestId);
        if (request) {
          request.fromCache = true;
          request.cacheType = 'disk';
          console.log(`   💾 캐시 히트 감지: ${request.url}`);
        }
      });

      // 로딩 완료 이벤트로 최종 크기 수집
      this.cdpSession.on('Network.loadingFinished', (params) => {
        const { requestId, encodedDataLength } = params;
        const request = this.requestMap.get(requestId);
        if (request) {
          request.size = encodedDataLength;
          // 완료된 요청을 메인 배열에 추가
          this.processCompletedRequest(request);
        }
      });

    } catch (error) {
      console.log('⚠️ CDP 세션 생성 실패, 기본 모드로 전환:', error.message);
      // CDP 실패 시 기존 방식으로 폴백
      this.useFallbackMode(page);
      return;
    }

    // 기존 response 이벤트도 유지 (CDP가 놓친 요청 처리용)
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const url = request.url();
        
        // CDP에서 처리되지 않은 요청만 처리
        const isProcessedByCDP = Array.from(this.requestMap.values())
          .some(req => req.url === url);
          
        if (!isProcessedByCDP) {
          const requestInfo = {
            url,
            domain: this.extractDomain(url),
            type: request.resourceType(),
            method: request.method(),
            timestamp: Date.now(),
            status: response.status(),
            statusText: response.statusText(),
            fromCache: false,
            cacheType: null
          };

          const headers = response.headers();
          requestInfo.headers = headers;
          
          const contentLength = headers['content-length'];
          if (contentLength) {
            requestInfo.size = parseInt(contentLength);
          } else {
            requestInfo.size = 0;
          }

          requestInfo.protocol = this.extractProtocol(headers);
          this.processCompletedRequest(requestInfo);
        }
      } catch (error) {
        // 오류 무시
      }
    });
  }

  /**
   * 폴백 모드 (CDP 사용 불가 시)
   */
  useFallbackMode(page) {
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const url = request.url();
        
        const requestInfo = {
          url,
          domain: this.extractDomain(url),
          type: request.resourceType(),
          method: request.method(),
          timestamp: Date.now(),
          status: response.status(),
          statusText: response.statusText(),
          fromCache: false,
          cacheType: null
        };

        const headers = response.headers();
        requestInfo.headers = headers;
        
        const contentLength = headers['content-length'];
        if (contentLength) {
          requestInfo.size = parseInt(contentLength);
        } else {
          requestInfo.size = 0;
        }

        requestInfo.protocol = this.extractProtocol(headers);
        this.processCompletedRequest(requestInfo);
        
      } catch (error) {
        // 오류 무시
      }
    });
  }

  /**
   * 완료된 요청 처리
   */
  processCompletedRequest(requestInfo) {
    // 도메인 추출
    if (!requestInfo.domain) {
      requestInfo.domain = this.extractDomain(requestInfo.url);
    }

    // 데이터 저장
    this.requests.push(requestInfo);
    this.updateStatistics(requestInfo);
    
    // 캐시 통계 업데이트
    this.cacheStats.total++;
    if (requestInfo.fromCache) {
      this.cacheStats.fromCache++;
      
      // 캐시 타입별 세부 통계
      if (requestInfo.fromMemoryCache) {
        this.cacheStats.fromMemoryCache++;
      } else if (requestInfo.fromDiskCache) {
        this.cacheStats.fromDiskCache++;
      } else if (requestInfo.fromServiceWorker) {
        this.cacheStats.fromServiceWorker++;
      }
    } else {
      this.cacheStats.fromNetwork++;
    }
    
    // 타입별 캐시 통계
    if (!this.cacheStats.byType.has(requestInfo.type)) {
      this.cacheStats.byType.set(requestInfo.type, { total: 0, cached: 0 });
    }
    const typeStats = this.cacheStats.byType.get(requestInfo.type);
    typeStats.total++;
    if (requestInfo.fromCache) {
      typeStats.cached++;
    }
  }

  /**
   * 도메인 추출
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * 프로토콜 정보 추출
   */
  extractProtocol(headers) {
    // HTTP/2 확인
    if (headers[':status']) {
      return 'HTTP/2';
    }
    
    // Alt-Svc 헤더로 HTTP/3 확인
    const altSvc = headers['alt-svc'];
    if (altSvc && altSvc.includes('h3')) {
      return 'HTTP/3';
    }
    
    return 'HTTP/1.1';
  }

  /**
   * 통계 업데이트
   */
  updateStatistics(requestInfo) {
    const { domain, type, protocol, size = 0 } = requestInfo;

    // 도메인별 통계
    if (!this.domains.has(domain)) {
      this.domains.set(domain, { count: 0, size: 0, types: new Map() });
    }
    const domainStats = this.domains.get(domain);
    domainStats.count++;
    domainStats.size += size;
    
    // 도메인별 리소스 타입 통계
    if (!domainStats.types.has(type)) {
      domainStats.types.set(type, { count: 0, size: 0 });
    }
    const typeStats = domainStats.types.get(type);
    typeStats.count++;
    typeStats.size += size;

    // 전체 리소스 타입별 통계
    if (!this.resourceTypes.has(type)) {
      this.resourceTypes.set(type, { count: 0, size: 0 });
    }
    const resourceStats = this.resourceTypes.get(type);
    resourceStats.count++;
    resourceStats.size += size;

    // 프로토콜별 통계
    if (!this.protocols.has(protocol)) {
      this.protocols.set(protocol, { count: 0, size: 0 });
    }
    const protocolStats = this.protocols.get(protocol);
    protocolStats.count++;
    protocolStats.size += size;
  }

  /**
   * 모니터링 중지
   */
  async stop() {
    this.isMonitoring = false;
    if (this.cdpSession) {
      try {
        // CDP 세션이 여전히 유효한지 확인
        await this.cdpSession.send('Network.disable').catch(() => {});
        await this.cdpSession.detach().catch(() => {});
      } catch (e) {
        // CDP 세션이 이미 닫혔을 수 있음 - 무시
      }
      this.cdpSession = null;
    }
    console.log('📡 네트워크 트래픽 모니터링 중지');
  }

  /**
   * 수집된 데이터 반환
   */
  getData() {
    const duration = (Date.now() - this.startTime) / 1000;
    
    return {
      duration,
      totalRequests: this.requests.length,
      totalSize: this.requests.reduce((sum, req) => sum + (req.size || 0), 0),
      domains: this.domains,
      resourceTypes: this.resourceTypes,
      protocols: this.protocols,
      requests: this.requests,
      cacheStats: {
        total: this.cacheStats.total,
        fromCache: this.cacheStats.fromCache,
        fromMemoryCache: this.cacheStats.fromMemoryCache,
        fromDiskCache: this.cacheStats.fromDiskCache,
        fromServiceWorker: this.cacheStats.fromServiceWorker,
        fromNetwork: this.cacheStats.fromNetwork,
        cacheHitRate: this.cacheStats.total > 0 
          ? (this.cacheStats.fromCache / this.cacheStats.total * 100).toFixed(2) 
          : 0,
        byType: Array.from(this.cacheStats.byType.entries()).map(([type, stats]) => ({
          type,
          total: stats.total,
          cached: stats.cached,
          hitRate: stats.total > 0 ? (stats.cached / stats.total * 100).toFixed(2) : 0
        }))
      }
    };
  }

  /**
   * 분석용 데이터 반환 (getData와 동일)
   */
  getAnalysisData() {
    return this.getData();
  }

  /**
   * 초기화
   */
  reset() {
    this.requests = [];
    this.domains.clear();
    this.resourceTypes.clear();
    this.protocols.clear();
    this.startTime = Date.now();
  }
}

module.exports = NetworkMonitor;