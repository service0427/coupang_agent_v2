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
    this.allowedRequests = []; // 허용된 요청 기록용
    this.isFileLoggingEnabled = false; // 파일 로깅 활성화 여부
  }

  /**
   * 네트워크 모니터링 시작
   */
  async start(page, options = {}) {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.startTime = Date.now();
    this.isFileLoggingEnabled = options.enableFileLogging || false;
    console.log('📡 네트워크 트래픽 모니터링 시작...');
    
    if (this.isFileLoggingEnabled) {
      console.log('   📝 허용된 요청 파일 로깅 활성화');
    }

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
        
        // 캐시 감지 로직 개선
        const fromMemoryCache = response.fromMemoryCache || false;
        const fromDiskCache = response.fromDiskCache || false;
        const fromServiceWorker = response.fromServiceWorker || false;
        const fromPrefetchCache = response.fromPrefetchCache || false;
        
        // 추가 캐시 감지 방법 (헤더 기반)
        const responseHeaders = response.headers || {};
        const cacheControl = responseHeaders['cache-control'] || '';
        const expires = responseHeaders['expires'] || '';
        const lastModified = responseHeaders['last-modified'] || '';
        const etag = responseHeaders['etag'] || '';
        
        // 304 Not Modified는 확실한 캐시 히트
        const is304NotModified = response.status === 304;
        
        // 캐시 히트 판단
        const fromCache = fromMemoryCache || fromDiskCache || fromServiceWorker || fromPrefetchCache || is304NotModified;
        
        let cacheType = null;
        if (fromMemoryCache) cacheType = 'memory';
        else if (fromDiskCache) cacheType = 'disk';
        else if (fromServiceWorker) cacheType = 'service-worker';
        else if (fromPrefetchCache) cacheType = 'prefetch';
        else if (is304NotModified) cacheType = '304-not-modified';
        
        // 요청 정보 초기화
        if (!this.requestMap.has(requestId)) {
          this.requestMap.set(requestId, {
            requestId,
            url: response.url,
            status: response.status,
            type: type.toLowerCase(),
            fromCache,
            fromMemoryCache,
            fromDiskCache,
            fromServiceWorker,
            cacheType,
            timestamp: Date.now(),
            headers: responseHeaders
          });
          
          // 캐시 히트 로그 출력 (콘솔에는 계속 표시)
          if (fromCache) {
            const cacheTypeDisplay = fromMemoryCache ? 'Memory' : 
                                   fromDiskCache ? 'Disk' : 
                                   fromServiceWorker ? 'ServiceWorker' : 
                                   fromPrefetchCache ? 'Prefetch' : '304';
            console.log(`   💾 ${cacheTypeDisplay} Cache 히트: ${response.url.substring(0, 80)}...`);
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

      // 캐시에서 로드된 요청 감지 (더 정확한 디스크 캐시 감지)
      this.cdpSession.on('Network.requestServedFromCache', (params) => {
        const { requestId } = params;
        const request = this.requestMap.get(requestId);
        if (request) {
          // 이미 캐시로 감지되지 않았다면 디스크 캐시로 설정
          if (!request.fromCache) {
            request.fromCache = true;
            request.fromDiskCache = true;
            request.cacheType = 'disk';
            console.log(`   💾 Disk Cache 히트 감지: ${request.url.substring(0, 80)}...`);
          }
        } else {
          // requestMap에 없는 경우 새로 생성
          this.requestMap.set(requestId, {
            requestId,
            url: 'unknown',
            status: 200,
            type: 'unknown',
            fromCache: true,
            fromDiskCache: true,
            cacheType: 'disk',
            timestamp: Date.now()
          });
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
          // 폴백 모드에서도 캐시 감지 시도
          const headers = response.headers();
          const is304NotModified = response.status() === 304;
          const fromCache = is304NotModified || response.fromCache || false;
          let cacheType = null;
          
          if (is304NotModified) {
            cacheType = '304-not-modified';
          } else if (response.fromCache) {
            cacheType = 'browser-cache';
          }
          
          const requestInfo = {
            url,
            domain: this.extractDomain(url),
            type: request.resourceType(),
            method: request.method(),
            timestamp: Date.now(),
            status: response.status(),
            statusText: response.statusText(),
            fromCache,
            cacheType,
            headers
          };
          
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
        
        // 폴백 모드에서도 캐시 감지
        const headers = response.headers();
        const is304NotModified = response.status() === 304;
        const fromCache = is304NotModified || response.fromCache || false;
        let cacheType = null;
        
        if (is304NotModified) {
          cacheType = '304-not-modified';
        } else if (response.fromCache) {
          cacheType = 'browser-cache';
        }
        
        const requestInfo = {
          url,
          domain: this.extractDomain(url),
          type: request.resourceType(),
          method: request.method(),
          timestamp: Date.now(),
          status: response.status(),
          statusText: response.statusText(),
          fromCache,
          cacheType,
          headers
        };
        
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

    // 프로토콜 기본값 설정
    if (!requestInfo.protocol || requestInfo.protocol === 'undefined') {
      requestInfo.protocol = 'HTTP/1.1';
    }

    // 데이터 저장
    this.requests.push(requestInfo);
    this.updateStatistics(requestInfo);
    
    // 파일 로깅이 활성화된 경우 허용된 요청 기록
    if (this.isFileLoggingEnabled) {
      this.logAllowedRequest(requestInfo);
    }
    
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
    if (!headers || typeof headers !== 'object') {
      return 'HTTP/1.1'; // 기본값
    }
    
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
    const { domain, type, size = 0 } = requestInfo;
    const protocol = requestInfo.protocol || 'HTTP/1.1'; // undefined 방지

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
   * 허용된 요청 로그 기록
   */
  logAllowedRequest(requestInfo) {
    const logEntry = {
      timestamp: this.toKoreanISOString(new Date(requestInfo.timestamp)), // 한국시간으로 변환
      domain: requestInfo.domain,
      type: requestInfo.type,
      method: requestInfo.method || 'GET',
      status: requestInfo.status,
      size: requestInfo.size || 0,
      fromCache: requestInfo.fromCache || false,
      cacheType: requestInfo.cacheType || 'none',
      protocol: requestInfo.protocol || 'HTTP/1.1',
      url: requestInfo.url
    };
    
    this.allowedRequests.push(logEntry);
  }

  /**
   * 한국시간(KST) 변환 함수
   */
  toKoreanTime(date) {
    // UTC 시간에서 9시간 추가 (한국은 UTC+9)
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return kstDate;
  }

  /**
   * 한국시간 문자열 생성 (파일명용)
   */
  toKoreanTimeString(date) {
    const kstDate = this.toKoreanTime(date);
    return kstDate.toISOString().replace(/[:.]/g, '-').replace('Z', '-KST');
  }

  /**
   * 한국시간 ISO 문자열 생성 (로그용)
   */
  toKoreanISOString(date) {
    const kstDate = this.toKoreanTime(date);
    return kstDate.toISOString().replace('Z', '+09:00 (KST)');
  }

  /**
   * 한국시간 HH:MM:SS 형태 생성
   */
  toKoreanTimeOnly(date) {
    const kstDate = this.toKoreanTime(date);
    return kstDate.toISOString().split('T')[1].split('.')[0];
  }

  /**
   * 허용된 요청들을 파일로 저장
   */
  async saveAllowedRequestsToFile(keywordId, agent) {
    if (!this.isFileLoggingEnabled || this.allowedRequests.length === 0) {
      return null;
    }

    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      // 파일명 생성 (한국시간 기준)
      const now = new Date();
      const timestamp = this.toKoreanTimeString(now);
      const filename = `allowed-requests-${agent}-${keywordId}-${timestamp}.txt`;
      const filepath = path.join(process.cwd(), 'logs', filename);
      
      // logs 디렉토리 생성
      const logsDir = path.join(process.cwd(), 'logs');
      try {
        await fs.mkdir(logsDir, { recursive: true });
      } catch (e) {
        // 디렉토리가 이미 존재하면 무시
      }
      
      // 헤더 정보 생성 (한국시간 기준)
      const header = [
        `# 허용된 네트워크 요청 로그`,
        `# 에이전트: ${agent}`,
        `# 키워드 ID: ${keywordId}`,
        `# 생성 시간: ${this.toKoreanISOString(now)}`,
        `# 총 요청 수: ${this.allowedRequests.length}`,
        `# 캐시 히트: ${this.allowedRequests.filter(r => r.fromCache).length}`,
        `# 총 트래픽: ${(this.allowedRequests.reduce((sum, r) => sum + (r.size || 0), 0) / 1024 / 1024).toFixed(2)}MB`,
        ``,
        `# 형식: [시간] [도메인] [타입] [상태] [크기] [캐시] [프로토콜] [URL]`,
        ``,
      ].join('\n');
      
      // 요청 로그 생성 (리스트 형태) - 한국시간 기준
      const logLines = this.allowedRequests.map(req => {
        // timestamp가 이미 한국시간 ISO 문자열이므로 직접 파싱
        let time;
        try {
          if (typeof req.timestamp === 'string') {
            // 이미 한국시간 ISO 형태: "2025-08-07T20:42:34.414+09:00 (KST)"
            time = req.timestamp.split('T')[1].split('+')[0].split('.')[0]; // HH:MM:SS 추출
          } else {
            time = this.toKoreanTimeOnly(new Date(req.timestamp));
          }
        } catch (error) {
          time = '00:00:00'; // 기본값
        }
        
        const size = req.size > 0 ? `${(req.size/1024).toFixed(1)}KB` : '0KB';
        
        // 캐시 표시 개선
        let cache = '🌐network';
        if (req.fromCache && req.cacheType) {
          switch(req.cacheType) {
            case 'memory':
              cache = '💾memory';
              break;
            case 'disk':
              cache = '💾disk';
              break;
            case 'service-worker':
              cache = '💾sw';
              break;
            case 'prefetch':
              cache = '💾prefetch';
              break;
            case '304-not-modified':
              cache = '💾304';
              break;
            case 'browser-cache':
              cache = '💾cache';
              break;
            default:
              cache = '💾cached';
          }
        }
        
        return `[${time}] ${req.domain.padEnd(25)} ${req.type.padEnd(10)} ${req.status.toString().padEnd(3)} ${size.padEnd(8)} ${cache.padEnd(12)} ${req.protocol.padEnd(8)} ${req.url}`;
      });
      
      const content = header + logLines.join('\n');
      
      // 파일 저장
      await fs.writeFile(filepath, content, 'utf8');
      
      return {
        filepath,
        filename,
        requestCount: this.allowedRequests.length,
        cacheHits: this.allowedRequests.filter(r => r.fromCache).length,
        totalSize: this.allowedRequests.reduce((sum, r) => sum + (r.size || 0), 0)
      };
      
    } catch (error) {
      console.error('⚠️ 허용된 요청 로그 저장 실패:', error.message);
      return null;
    }
  }

  /**
   * 초기화
   */
  reset() {
    this.requests = [];
    this.allowedRequests = [];
    this.domains.clear();
    this.resourceTypes.clear();
    this.protocols.clear();
    this.startTime = Date.now();
  }
}

module.exports = NetworkMonitor;