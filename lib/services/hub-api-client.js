/**
 * 허브 API 클라이언트
 * 외부 허브 서버와 API 통신하여 작업 할당/결과 제출
 */

const axios = require('axios');

class HubApiClient {
  constructor(config = {}) {
    this.hubBaseUrl = config.hubBaseUrl || 'http://mkt.techb.kr:3001';
    this.instanceNumber = config.instanceNumber || 1;
    this.timeout = config.timeout || 30000;
    this.retryCount = config.retryCount || 3;
    
    // HTTP 클라이언트 설정
    this.httpClient = axios.create({
      baseURL: this.hubBaseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CoupangAutomation/2.0'
      }
    });

    // 요청/응답 인터셉터
    this.setupInterceptors();
    
    console.log(`🔗 HubApiClient 초기화: ${this.hubBaseUrl} (인스턴스: ${this.instanceNumber})`);
  }

  setupInterceptors() {
    // 요청 인터셉터
    this.httpClient.interceptors.request.use(
      (config) => {
        console.log(`🌐 [API 요청] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ [API 요청 오류]', error.message);
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.httpClient.interceptors.response.use(
      (response) => {
        console.log(`✅ [API 응답] ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        const status = error.response?.status || 'Network';
        const url = error.config?.url || 'Unknown';
        console.error(`❌ [API 오류] ${status} ${url}:`, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * 작업 할당 요청
   */
  async allocateWork() {
    console.log(`📋 작업 할당 요청: 인스턴스 ${this.instanceNumber}`);
    
    // 🔍 DEBUG: 가능한 API 경로들 시도
    const possiblePaths = [
      `/api/allocate-work?instance=${this.instanceNumber}`,
      `/allocate-work?instance=${this.instanceNumber}`,
      `/api/work/allocate?instance=${this.instanceNumber}`,
      `/work?instance=${this.instanceNumber}`,
      `/api/allocation?instance=${this.instanceNumber}`
    ];
    
    let lastError;
    
    for (const apiPath of possiblePaths) {
      try {
        console.log(`🔍 시도 중: ${apiPath}`);
        const response = await this.retryRequest(async () => {
          return await this.httpClient.get(apiPath);
        });
        
        console.log(`✅ 성공한 API 경로: ${apiPath}`);
        const allocation = response.data;
        
        if (!allocation.success) {
          throw new Error(`작업 할당 실패: ${allocation.error || '알 수 없는 오류'}`);
        }

        console.log(`✅ 작업 할당 성공: ${allocation.allocation_key}`);
        console.log(`   키워드: ${allocation.work?.keyword}`);
        console.log(`   폴더: ${allocation.folder}`);
        console.log(`   프록시: ${allocation.proxy?.external_ip}`);

        return {
          allocationKey: allocation.allocation_key,
          folder: allocation.folder,
          work: {
            keyword: allocation.work?.keyword,
            code: allocation.work?.code
          },
          proxy: {
            url: allocation.proxy?.url,
            externalIp: allocation.proxy?.external_ip,
            useCount: allocation.proxy?.use_count
          },
          settings: {
            cartClickEnabled: allocation.settings?.cart_click_enabled === true,
            blockMercury: allocation.settings?.block_mercury === true,
            blockImageCdn: allocation.settings?.block_image_cdn === true,
            blockImg1aCdn: allocation.settings?.block_img1a_cdn === true,
            blockThumbnailCdn: allocation.settings?.block_thumbnail_cdn === true
          },
          expiresAt: new Date(allocation.expires_at),
          instanceNumber: this.instanceNumber
        };
        
      } catch (error) {
        lastError = error;
        console.log(`❌ ${apiPath} 실패: ${error.response?.status || error.message}`);
        
        // HTTP 응답 오류 상세 정보 (503은 일반적이므로 간략하게, 다른 오류는 상세하게)
        if (error.response) {
          const status = error.response.status;
          if (status === 503) {
            console.log(`   📍 503 응답: ${JSON.stringify(error.response.data)}`);
          } else if (status !== 404) {
            console.error(`🔍 [작업 할당 오류 ${status}] 상세 디버깅:`);
            console.error(`   📍 URL: ${apiPath}`);
            console.error(`   📍 Status: ${status} ${error.response.statusText || ''}`);
            console.error(`   📍 서버 응답:`, JSON.stringify(error.response.data, null, 2));
          }
        }
        
        // 404가 아닌 오류면 즉시 종료
        if (error.response?.status && error.response.status !== 404) {
          throw error;
        }
      }
    }
    
    // 모든 경로에서 404인 경우
    console.log(`❌ 모든 API 경로 시도 실패`);
    
    // 작업이 없는 경우 null 반환
    if (lastError?.response?.status === 404 || lastError?.message?.includes('작업이 없습니다')) {
      return null;
    }
    
    throw lastError;
  }

  /**
   * 작업 결과 제출 (개선된 구조)
   */
  async submitResult(resultData) {
    console.log(`📤 결과 제출: ${resultData.allocationKey}`);
    
    try {
      const payload = {
        allocation_key: resultData.allocationKey,
        status: resultData.status, // completed, failed, timeout
        execution: {
          started_at: resultData.execution.startedAt,
          completed_at: resultData.execution.completedAt,
          execution_time_ms: resultData.execution.executionTimeMs,
          instance_number: this.instanceNumber,
          user_folder: resultData.execution.userFolder,
          final_phase: resultData.execution.finalPhase || 'completion',
          failure_phase: resultData.execution.failurePhase || null
        },
        result: {
          status: resultData.result.status, // success, error, blocked, timeout
          status_code: resultData.result.statusCode || 200,
          current_page: resultData.result.currentPage || 1,
          products_found: resultData.result.productsFound || 0
        },
        // 유연한 상품 데이터 JSON 구조
        product_data: resultData.productData || {},
        // 적용된 설정 정보
        applied_settings: {
          cart_click_enabled: resultData.appliedSettings?.cartClickEnabled || false,
          block_mercury: resultData.appliedSettings?.blockMercury || false,
          block_image_cdn: resultData.appliedSettings?.blockImageCdn || false,
          block_img1a_cdn: resultData.appliedSettings?.blockImg1aCdn || false,
          block_thumbnail_cdn: resultData.appliedSettings?.blockThumbnailCdn || false
        },
        // 성능 메트릭
        performance: {
          page_load_time_ms: resultData.performance?.pageLoadTimeMs || 0,
          dom_ready_time_ms: resultData.performance?.domReadyTimeMs || 0,
          first_product_time_ms: resultData.performance?.firstProductTimeMs || 0,
          total_requests: resultData.performance?.totalRequests || 0,
          blocked_requests: resultData.performance?.blockedRequests || 0,
          cache_hit_rate: resultData.performance?.cacheHitRate || 0,
          network_efficiency: resultData.performance?.networkEfficiency || 0,
          total_bytes: resultData.performance?.totalBytes || 0,
          memory_usage_mb: resultData.performance?.memoryUsageMb || 0,
          cpu_usage_percent: resultData.performance?.cpuUsagePercent || 0
        }
      };

      const response = await this.retryRequest(async () => {
        return await this.httpClient.post('/api/submit-result', payload);
      });

      console.log(`✅ 결과 제출 완료: ${response.status}`);
      return response.data;

    } catch (error) {
      console.error(`❌ 결과 제출 실패:`, error.message);
      
      // HTTP 응답 오류인 경우 상세 정보 출력
      if (error.response) {
        console.error(`🔍 [HTTP 오류 ${error.response.status}] 상세 디버깅:`);
        console.error(`   📍 URL: ${error.config?.url || 'Unknown URL'}`);
        console.error(`   📍 Method: ${error.config?.method?.toUpperCase() || 'Unknown Method'}`);
        console.error(`   📍 Status: ${error.response.status} ${error.response.statusText || ''}`);
        console.error(`   📍 Headers:`, JSON.stringify(error.response.headers, null, 2));
        console.error(`   📍 서버 응답 데이터:`, JSON.stringify(error.response.data, null, 2));
        
        // 500 오류인 경우 추가로 요청 페이로드도 출력
        if (error.response.status === 500) {
          console.error(`\n🔍 [500 오류] 제출한 페이로드:`);
          console.error(JSON.stringify(payload, null, 2));
          
          // 페이로드 검증
          console.error(`\n🔍 [500 오류] 페이로드 구조 검증:`);
          console.error(`   - allocation_key: ${payload.allocation_key ? '✅' : '❌'} (${typeof payload.allocation_key})`);
          console.error(`   - status: ${payload.status ? '✅' : '❌'} (${typeof payload.status})`);
          console.error(`   - execution: ${payload.execution ? '✅' : '❌'} (${typeof payload.execution})`);
          console.error(`   - result: ${payload.result ? '✅' : '❌'} (${typeof payload.result})`);
          console.error(`   - product_data: ${payload.product_data !== undefined ? '✅' : '❌'} (${typeof payload.product_data})`);
          console.error(`   - applied_settings: ${payload.applied_settings ? '✅' : '❌'} (${typeof payload.applied_settings})`);
          console.error(`   - performance: ${payload.performance ? '✅' : '❌'} (${typeof payload.performance})`);
        }
        
      } else if (error.request) {
        // 네트워크 오류 (요청은 보냈지만 응답 없음)
        console.error(`🔍 [네트워크 오류] 요청 전송됐지만 응답 없음:`);
        console.error(`   📍 URL: ${error.config?.url || 'Unknown URL'}`);
        console.error(`   📍 Timeout: ${error.config?.timeout || 'Default'}ms`);
        console.error(`   📍 Request Data:`, error.config?.data ? JSON.parse(error.config.data) : 'No data');
        
      } else {
        // 요청 설정 오류
        console.error(`🔍 [요청 설정 오류]:`, error.message);
        console.error(`   📍 Config:`, error.config || 'No config');
      }
      
      throw error;
    }
  }

  /**
   * 허브 서버 상태 확인
   */
  async checkHealth() {
    try {
      const response = await this.httpClient.get('/health');
      console.log(`💚 허브 서버 상태 양호`);
      return response.data;
    } catch (error) {
      console.error(`❤️ 허브 서버 상태 확인 실패:`, error.message);
      throw error;
    }
  }

  /**
   * 재시도 로직
   */
  async retryRequest(requestFunc) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        return await requestFunc();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryCount) {
          break;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`⚠️ API 요청 실패 (${attempt}/${this.retryCount}), ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * 클라이언트 상태 조회
   */
  getStatus() {
    return {
      hubBaseUrl: this.hubBaseUrl,
      instanceNumber: this.instanceNumber,
      timeout: this.timeout,
      retryCount: this.retryCount,
      isHealthy: true
    };
  }
}

module.exports = HubApiClient;