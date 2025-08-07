/**
 * 프록시 IP 변경 토글 서비스
 * 프록시 포트 번호를 추출하여 토글 API 호출
 */

const axios = require('axios');

class ProxyToggleService {
  constructor() {
    this.toggleBaseUrl = 'http://112.161.54.7:8080/toggle';
    this.lastToggleTime = {};  // 포트별 마지막 토글 시간 저장
    this.minToggleInterval = 15000;  // 15초
  }

  /**
   * 프록시 주소에서 포트 번호 추출
   * @param {string} proxyServer - 프록시 서버 주소 (예: socks5://112.161.54.7:10011)
   * @returns {string|null} 포트 번호 끝 2자리
   */
  extractPortNumber(proxyServer) {
    if (!proxyServer) return null;
    
    // 포트 번호 추출 (마지막 : 이후의 숫자)
    const match = proxyServer.match(/:(\d+)$/);
    if (match && match[1]) {
      // 끝 2자리만 추출
      const fullPort = match[1];
      return fullPort.slice(-2);
    }
    
    return null;
  }

  /**
   * IP 변경 가능 여부 확인
   * @param {string} portNumber - 포트 번호
   * @returns {boolean} 변경 가능 여부
   */
  canToggle(portNumber) {
    const lastTime = this.lastToggleTime[portNumber];
    if (!lastTime) return true;
    
    const elapsed = Date.now() - lastTime;
    return elapsed >= this.minToggleInterval;
  }

  /**
   * IP 변경 토글 실행 (재시도 로직 포함)
   * @param {string} proxyServer - 프록시 서버 주소
   * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 5)
   * @param {number} retryDelay - 재시도 간격 (밀리초, 기본값: 10000)
   * @returns {Object} 토글 결과
   */
  async toggleIp(proxyServer, maxRetries = 5, retryDelay = 10000) {
    // 포트 번호 추출
    const portNumber = this.extractPortNumber(proxyServer);
    if (!portNumber) {
      return {
        success: false,
        error: '포트 번호를 추출할 수 없습니다',
        proxyServer
      };
    }

    // 재실행 간격 체크
    if (!this.canToggle(portNumber)) {
      const remainingTime = Math.ceil((this.minToggleInterval - (Date.now() - this.lastToggleTime[portNumber])) / 1000);
      return {
        success: false,
        error: `IP 변경 후 15초 이내 재실행 불가 (${remainingTime}초 남음)`,
        portNumber,
        remainingTime
      };
    }

    const toggleUrl = `${this.toggleBaseUrl}/${portNumber}`;
    
    // 재시도 로직
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt === 1) {
          console.log(`🔄 IP 변경 요청: ${toggleUrl}`);
        } else {
          console.log(`🔄 IP 변경 재시도 (${attempt}/${maxRetries}): ${toggleUrl}`);
        }
        
        const response = await axios.get(toggleUrl, {
          timeout: 30000,  // 30초 타임아웃
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        // 성공 시 시간 기록
        this.lastToggleTime[portNumber] = Date.now();

        if (attempt > 1) {
          console.log(`   ✅ ${attempt}번째 시도에서 성공`);
        }

        return {
          success: true,
          portNumber,
          toggleUrl,
          response: response.data,
          message: `포트 ${portNumber}번 IP 변경 성공${attempt > 1 ? ` (${attempt}번째 시도)` : ''}`,
          attempts: attempt
        };

      } catch (error) {
        // 에러 처리
        let errorMessage = error.message;
        let isRetryable = true;
        
        if (error.response) {
          // 서버 응답 에러
          errorMessage = `서버 응답: ${error.response.status} - ${error.response.data || error.response.statusText}`;
          // 4xx 에러는 재시도하지 않음
          if (error.response.status >= 400 && error.response.status < 500) {
            isRetryable = false;
          }
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = '토글 서버 연결 실패';
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'timeout of 30000ms exceeded';
        }

        // 마지막 시도이거나 재시도 불가능한 에러인 경우
        if (attempt === maxRetries || !isRetryable) {
          console.log(`   ❌ ${proxyServer} - ${errorMessage}`);
          if (attempt === maxRetries && isRetryable) {
            console.log(`   💀 ${maxRetries}회 재시도 모두 실패 - 프로세스 종료`);
            process.exit(1);
          }
          
          return {
            success: false,
            error: errorMessage,
            proxyServer,
            details: error.response?.data,
            attempts: attempt,
            maxRetriesReached: attempt === maxRetries
          };
        }

        // 재시도 대기
        console.log(`   ❌ ${proxyServer} - ${errorMessage}`);
        console.log(`   ⏳ ${retryDelay/1000}초 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * 여러 프록시의 IP를 순차적으로 변경
   * @param {Array<string>} proxyServers - 프록시 서버 주소 배열
   * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 5)
   * @param {number} retryDelay - 재시도 간격 (밀리초, 기본값: 10000)
   * @returns {Array<Object>} 각 프록시의 토글 결과
   */
  async toggleMultiple(proxyServers, maxRetries = 5, retryDelay = 10000) {
    const results = [];
    
    for (const proxyServer of proxyServers) {
      const result = await this.toggleIp(proxyServer, maxRetries, retryDelay);
      results.push(result);
      
      // 성공한 경우 다음 요청 전 잠시 대기
      if (result.success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * 토글 상태 초기화
   */
  reset() {
    this.lastToggleTime = {};
  }

  /**
   * 특정 포트의 대기 시간 확인
   * @param {string} portNumber - 포트 번호
   * @returns {number} 남은 대기 시간 (초)
   */
  getRemainingWaitTime(portNumber) {
    const lastTime = this.lastToggleTime[portNumber];
    if (!lastTime) return 0;
    
    const elapsed = Date.now() - lastTime;
    const remaining = Math.max(0, this.minToggleInterval - elapsed);
    return Math.ceil(remaining / 1000);
  }
}

module.exports = new ProxyToggleService();