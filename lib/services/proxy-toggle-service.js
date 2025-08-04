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
   * IP 변경 토글 실행
   * @param {string} proxyServer - 프록시 서버 주소
   * @returns {Object} 토글 결과
   */
  async toggleIp(proxyServer) {
    try {
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

      // 토글 API 호출
      const toggleUrl = `${this.toggleBaseUrl}/${portNumber}`;
      console.log(`🔄 IP 변경 요청: ${toggleUrl}`);
      
      const response = await axios.get(toggleUrl, {
        timeout: 10000,  // 10초 타임아웃
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // 성공 시 시간 기록
      this.lastToggleTime[portNumber] = Date.now();

      return {
        success: true,
        portNumber,
        toggleUrl,
        response: response.data,
        message: `포트 ${portNumber}번 IP 변경 성공`
      };

    } catch (error) {
      // 에러 처리
      let errorMessage = error.message;
      
      if (error.response) {
        // 서버 응답 에러
        errorMessage = `서버 응답: ${error.response.status} - ${error.response.data || error.response.statusText}`;
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = '토글 서버 연결 실패';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = '토글 서버 응답 시간 초과';
      }

      return {
        success: false,
        error: errorMessage,
        proxyServer,
        details: error.response?.data
      };
    }
  }

  /**
   * 여러 프록시의 IP를 순차적으로 변경
   * @param {Array<string>} proxyServers - 프록시 서버 주소 배열
   * @returns {Array<Object>} 각 프록시의 토글 결과
   */
  async toggleMultiple(proxyServers) {
    const results = [];
    
    for (const proxyServer of proxyServers) {
      const result = await this.toggleIp(proxyServer);
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