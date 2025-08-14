/**
 * 허브 API 클라이언트
 * 외부 허브 서버와 API 통신하여 작업 할당/결과 제출
 */

const axios = require('axios');

class HubApiClient {
  constructor(config = {}) {
    this.hubBaseUrl = config.hubBaseUrl || 'http://mkt.techb.kr:3001';
    this.threadNumber = config.threadNumber || 1;
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
    
    console.log(`🔗 HubApiClient 초기화: ${this.hubBaseUrl} (쓰레드: ${this.threadNumber})`);
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
   * 작업 할당 요청 (새로운 API 구조)
   */
  async allocateWork() {
    console.log(`📋 작업 할당 요청: 쓰레드 ${this.threadNumber}`);
    
    // user_folder 파라미터 추가 (01, 02, 03... 형식)
    const userFolder = String(this.threadNumber).padStart(2, '0');
    
    try {
      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/api/work/allocate?user_folder=${userFolder}`);
      });
      
      const allocation = response.data;
      
      // API 응답 로그
      console.log(`\n📥 [허브 서버 응답] work/allocate:`);
      console.log(`   success: ${allocation.success}`);
      
      if (!allocation.success) {
        // 서버에서 제공하는 구체적인 메시지
        const serverMessage = allocation.message || '알 수 없는 오류';
        console.log(`   message: ${serverMessage}`);
        console.log('');
        
        throw new Error(`작업 할당 실패: ${serverMessage}`);
      }

      // 성공 시 응답 로그
      console.log(`   allocation_key: ${allocation.allocation_key}`);
      console.log(`   keyword: ${allocation.keyword}`);
      console.log(`   product_id: ${allocation.product_id}`);
      console.log(`   proxy_id: ${allocation.proxy_id}`);
      console.log(`   user_folder: ${allocation.user_folder || userFolder}`);
      console.log(`   proxy: ${allocation.proxy}`);
      console.log('');

      console.log(`✅ 작업 할당 성공: ${allocation.allocation_key}`);
      console.log(`   키워드: ${allocation.keyword}`);
      console.log(`   상품 ID: ${allocation.product_id}`);
      console.log(`   프록시 ID: ${allocation.proxy_id || 'N/A'}`);
      console.log(`   유저 폴더: ${allocation.user_folder || userFolder}`);
      
      // 프록시는 이제 문자열로 직접 전달됨 (socks5://ip:port)
      const proxyString = allocation.proxy;
      console.log(`   프록시: ${proxyString || 'none'}`);

      // 프록시 URL 파싱
      let proxyConfig = null;
      if (proxyString) {
        try {
          const proxyUrl = new URL(proxyString);
          proxyConfig = {
            protocol: proxyUrl.protocol.replace(':', ''),
            server: `${proxyUrl.hostname}:${proxyUrl.port}`,
            username: proxyUrl.username || null,
            password: proxyUrl.password || null,
            url: proxyString
          };
        } catch (parseError) {
          console.error('⚠️ 프록시 URL 파싱 실패:', parseError.message);
          console.error('   프록시 데이터:', JSON.stringify(allocation.proxy));
        }
      }

      return {
        allocationKey: allocation.allocation_key,
        work: {
          keyword: allocation.keyword,
          code: allocation.product_id  // product_id를 code로 매핑
        },
        proxy: proxyConfig,
        proxyId: allocation.proxy_id,  // proxy_id 추가
        userFolder: allocation.user_folder || userFolder,  // user_folder 추가
        settings: {
          // 모든 최적화 설정을 true로 하드코딩 (기존 요구사항)
          cartClickEnabled: true,
          blockMercury: true,
          blockImageCdn: true,
          blockImg1aCdn: true,
          blockThumbnailCdn: true
        },
        threadNumber: this.threadNumber
      };
        
    } catch (error) {
      console.error(`❌ 작업 할당 실패:`, error.message);
      
      // HTTP 응답 오류 상세 정보
      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data;
        
        if (status === 503) {
          // 서버 메시지를 그대로 출력
          const serverMessage = responseData?.message || responseData?.error || 'Unknown 503 error';
          console.log(`   📍 503 서비스 이용불가: ${serverMessage}`);
        }
      }
      
      // 작업이 없는 경우 null 반환
      if (error.message.includes('No keywords') || 
          error.message.includes('No active keywords') ||
          error.message.includes('completed today')) {
        return null;
      }
      
      throw error;
    }
  }

  /**
   * 작업 결과 제출 (간소화된 구조)
   */
  async submitResult(resultData) {
    console.log(`📤 결과 제출: ${resultData.allocation_key}`);
    
    try {
      // 간소화된 payload 구조
      const payload = { ...resultData };

      // POST 요청 데이터 로그
      console.log(`\n📤 [POST 데이터] result:`);
      console.log(JSON.stringify(payload, null, 2));
      
      const response = await this.retryRequest(async () => {
        return await this.httpClient.post('/api/work/result', payload);
      });

      // API 응답 로그 (상태 코드별 처리)
      console.log(`\n📥 [허브 서버 응답] result:`);
      console.log(`   status: ${response.status}`);
      console.log(`   success: ${response.data.success}`);
      console.log(`   message: ${response.data.message}`);
      
      // HTTP 200 - 성공
      if (response.status === 200 && response.data.success) {
        console.log(`   ✅ 결과가 정상적으로 저장되었습니다`);
      }
      return response.data;

    } catch (error) {
      console.error(`❌ 결과 제출 실패:`, error.message);
      
      // HTTP 응답 오류인 경우 상세 정보 출력
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        console.error(`🔍 [HTTP 오류 ${status}] 상세 정보:`);
        
        // 상태 코드별 구체적인 메시지
        if (status === 400) {
          console.error(`   ❌ 잘못된 요청: ${data?.message || 'allocation_key is required'}`);
          console.error(`   📍 원인: 필수 파라미터 누락`);
        } else if (status === 404) {
          console.error(`   ❌ 찾을 수 없음: ${data?.message || 'Invalid allocation_key'}`);
          console.error(`   📍 원인: 유효하지 않은 allocation_key`);
        } else if (status === 500) {
          console.error(`   ❌ 서버 오류: ${data?.message || 'Database error'}`);
          console.error(`   📍 원인: 서버 측 데이터베이스 문제`);
        } else {
          console.error(`   ❌ 알 수 없는 오류: ${data?.message || 'Unknown error'}`);
        }
        
        console.error(`   📍 서버 응답:`, JSON.stringify(data, null, 2));
        
        // 500 오류인 경우 제출한 데이터 확인
        if (status === 500) {
          console.error(`\n🔍 [500 오류] 제출한 데이터 확인:`);
          console.error(`   - allocation_key: ${payload.allocation_key || '❌ 없음'}`);
          console.error(`   - success: ${payload.success}`);
          console.error(`   - execution_time_ms: ${payload.execution_time_ms}ms`);
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
      
      // API 응답 로그
      console.log(`\n📥 [허브 서버 응답] health:`);
      console.log(`   status: ${response.data.status || 'ok'}`);
      console.log(`   message: ${response.data.message || 'Server is healthy'}`);
      console.log('');
      
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
        const status = lastError.response?.status;
        const errorData = lastError.response?.data;
        
        // 서버 메시지와 함께 재시도 정보 출력
        if (status === 503 && errorData?.message) {
          console.warn(`⚠️ ${errorData.message} - 재시도 (${attempt}/${this.retryCount}), ${delay}ms 후...`);
        } else {
          console.warn(`⚠️ API 요청 실패 (${attempt}/${this.retryCount}), ${delay}ms 후 재시도...`);
        }
        
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
      threadNumber: this.threadNumber,
      timeout: this.timeout,
      retryCount: this.retryCount,
      isHealthy: true
    };
  }
}

module.exports = HubApiClient;