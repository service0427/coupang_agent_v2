/**
 * 네트워크 로그 통합 모듈
 * - NetworkMonitor와 DB 로깅 연결
 * - 실시간 네트워크 요청 기록
 * - 트래픽 분석 및 집계
 */

const dbServiceV2 = require('./db-service-v2');

class NetworkLogger {
  constructor(executionId, sessionId) {
    this.executionId = executionId;
    this.sessionId = sessionId;
    this.currentActionId = null;
    this.requestQueue = [];
    this.isProcessing = false;
    this.batchSize = 50; // 배치 처리 크기
    this.batchInterval = 5000; // 5초마다 배치 처리
    this.totalTraffic = 0;
    this.cachedTraffic = 0;
    this.blockedCount = 0;
    this.allowedCount = 0;
    this.domainTraffic = new Map();
    this.typeTraffic = new Map();
  }

  /**
   * 현재 액션 ID 설정
   */
  setCurrentActionId(actionId) {
    this.currentActionId = actionId;
  }

  /**
   * 네트워크 요청 로그
   */
  async logRequest(requestData) {
    const {
      requestId,
      url,
      method = 'GET',
      type,
      headers = {},
      timestamp = Date.now()
    } = requestData;
    
    // 큐에 추가
    this.requestQueue.push({
      requestId,
      url,
      method,
      type,
      headers,
      timestamp,
      actionId: this.currentActionId
    });
    
    // 배치 처리 시작
    this.processBatch();
  }

  /**
   * 네트워크 응답 로그
   */
  async logResponse(responseData) {
    const {
      requestId,
      status,
      headers = {},
      size = 0,
      bodySize = 0,
      fromCache = false,
      cacheType = null,
      timings = {},
      wasBlocked = false,
      blockReason = null
    } = responseData;
    
    // 기존 요청 찾기
    const requestIndex = this.requestQueue.findIndex(r => r.requestId === requestId);
    if (requestIndex === -1) return;
    
    const request = this.requestQueue[requestIndex];
    
    // 응답 정보 추가
    request.responseStatus = status;
    request.responseHeaders = headers;
    request.responseSizeBytes = size;
    request.responseBodySize = bodySize;
    request.fromCache = fromCache;
    request.wasBlocked = wasBlocked;
    request.blockReason = blockReason;
    request.timings = timings;
    
    // 도메인 추출
    request.domain = this.extractDomain(request.url);
    request.isThirdParty = this.isThirdPartyDomain(request.domain);
    
    // 컨텐트 타입 추출
    request.contentType = headers['content-type'] || null;
    request.contentEncoding = headers['content-encoding'] || null;
    
    // 통계 업데이트
    this.updateStatistics(request);
  }

  /**
   * 배치 처리
   */
  async processBatch() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    
    // 배치 크기나 시간 간격 체크
    if (this.requestQueue.length < this.batchSize) {
      // 타이머 설정
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.batchTimer = null;
          this.processBatch();
        }, this.batchInterval);
      }
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // 완료된 요청들 필터링
      const completedRequests = this.requestQueue.filter(r => r.responseStatus !== undefined);
      
      // DB에 배치 저장
      for (const request of completedRequests) {
        await this.saveRequestToDB(request);
      }
      
      // 처리된 요청 제거
      this.requestQueue = this.requestQueue.filter(r => r.responseStatus === undefined);
      
    } catch (error) {
      console.error('네트워크 로그 배치 처리 실패:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 요청을 DB에 저장
   */
  async saveRequestToDB(request) {
    try {
      const networkData = {
        actionId: request.actionId,
        requestId: request.requestId,
        requestUrl: request.url,
        requestMethod: request.method,
        requestType: request.type,
        requestHeaders: request.headers,
        responseStatus: request.responseStatus,
        responseHeaders: request.responseHeaders,
        responseSizeBytes: request.responseSizeBytes,
        responseBodySize: request.responseBodySize,
        wasBlocked: request.wasBlocked,
        blockReason: request.blockReason,
        fromCache: request.fromCache,
        domain: request.domain,
        isThirdParty: request.isThirdParty,
        contentType: request.contentType,
        contentEncoding: request.contentEncoding,
        timings: request.timings
      };
      
      await dbServiceV2.logNetworkV2(this.executionId, this.sessionId, networkData);
      
    } catch (error) {
      console.error('네트워크 요청 DB 저장 실패:', error);
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
   * 서드파티 도메인 체크
   */
  isThirdPartyDomain(domain) {
    const firstPartyDomains = [
      'coupang.com',
      'coupangcdn.com',
      'coupangstatic.com',
      'coupangimage.com',
      'coupang.net'
    ];
    
    return !firstPartyDomains.some(fpDomain => 
      domain.endsWith(fpDomain)
    );
  }

  /**
   * 통계 업데이트
   */
  updateStatistics(request) {
    // 전체 트래픽
    if (!request.wasBlocked) {
      this.totalTraffic += request.responseSizeBytes || 0;
      this.allowedCount++;
      
      if (request.fromCache) {
        this.cachedTraffic += request.responseSizeBytes || 0;
      }
    } else {
      this.blockedCount++;
    }
    
    // 도메인별 트래픽
    if (!request.wasBlocked && request.responseSizeBytes > 0) {
      const currentSize = this.domainTraffic.get(request.domain) || 0;
      this.domainTraffic.set(request.domain, currentSize + request.responseSizeBytes);
    }
    
    // 타입별 트래픽
    if (!request.wasBlocked && request.responseSizeBytes > 0) {
      const currentSize = this.typeTraffic.get(request.type) || 0;
      this.typeTraffic.set(request.type, currentSize + request.responseSizeBytes);
    }
  }

  /**
   * 현재 통계 반환
   */
  getStatistics() {
    return {
      totalTrafficBytes: this.totalTraffic,
      cachedTrafficBytes: this.cachedTraffic,
      blockedRequestsCount: this.blockedCount,
      allowedRequestsCount: this.allowedCount,
      trafficByDomain: Object.fromEntries(this.domainTraffic),
      trafficByType: Object.fromEntries(this.typeTraffic)
    };
  }

  /**
   * 모든 대기 중인 요청 처리
   */
  async flush() {
    // 타이머 취소
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // 모든 요청 처리
    this.batchSize = 1; // 즉시 처리를 위해 배치 크기 조정
    await this.processBatch();
  }

  /**
   * NetworkMonitor와 통합
   */
  integrateWithMonitor(networkMonitor) {
    // NetworkMonitor의 데이터를 주기적으로 가져와서 처리
    const syncInterval = setInterval(async () => {
      if (!networkMonitor || !networkMonitor.isMonitoring) {
        clearInterval(syncInterval);
        return;
      }
      
      const data = networkMonitor.getData();
      if (data && data.requests) {
        for (const request of data.requests) {
          // 이미 처리된 요청인지 확인
          const exists = this.requestQueue.some(r => r.requestId === request.requestId);
          if (!exists) {
            // 요청 로그
            await this.logRequest({
              requestId: request.requestId || `${request.url}_${request.timestamp}`,
              url: request.url,
              method: request.method,
              type: request.type,
              headers: request.headers,
              timestamp: request.timestamp
            });
            
            // 응답 로그
            if (request.status) {
              await this.logResponse({
                requestId: request.requestId || `${request.url}_${request.timestamp}`,
                status: request.status,
                headers: request.headers,
                size: request.size,
                fromCache: request.fromCache,
                cacheType: request.cacheType
              });
            }
          }
        }
      }
    }, 2000); // 2초마다 동기화
    
    return syncInterval;
  }
}

module.exports = NetworkLogger;