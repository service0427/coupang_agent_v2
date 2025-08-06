/**
 * 동시 차단 감지 서비스
 * - 여러 에이전트가 동시에 차단될 경우 감지
 * - 차단 발생 시 딜레이를 60초로 증가
 */

const dbServiceV2 = require('./db-service-v2');

class ConcurrentBlockDetector {
  constructor() {
    this.recentBlocks = new Map(); // agent -> 최근 차단 시간
    this.baseDelay = 5000; // 기본 딜레이 5초
    this.extendedDelay = 60000; // 확장 딜레이 60초
    this.blockWindow = 120000; // 2분 윈도우
    this.minAgentsForConcurrentBlock = 2; // 동시 차단 판정을 위한 최소 에이전트 수
  }

  /**
   * 차단 발생 기록 및 동시 차단 여부 체크
   */
  async recordBlock(agent, errorMessage, keywordData = null) {
    const now = Date.now();
    
    // 차단 관련 에러인지 확인
    if (!this.isBlockError(errorMessage)) {
      return { isConcurrentBlock: false, recommendedDelay: this.baseDelay };
    }

    // 현재 에이전트의 차단 기록
    this.recentBlocks.set(agent, now);

    console.log(`🚫 [${agent}] 차단 감지: ${errorMessage}`);

    try {
      // 키워드 데이터가 있으면 차단 횟수 업데이트
      if (keywordData && keywordData.id) {
        await this.updateBlockCount(keywordData.id);
      }

      // V2 에러 로그 기록
      await dbServiceV2.logErrorV2(null, null, null, {
        errorLevel: 'warning',
        errorCode: this.extractErrorCode(errorMessage),
        errorMessage,
        agent,
        keyword: keywordData?.keyword,
        product_code: keywordData?.product_code,
        tracking_key: keywordData ? this.generateTrackingKey(keywordData) : null
      });

    } catch (error) {
      console.error('차단 기록 중 오류:', error);
    }

    // 동시 차단 여부 확인
    const concurrentBlockInfo = this.checkConcurrentBlocks(now);
    
    if (concurrentBlockInfo.isConcurrentBlock) {
      console.log(`⚠️  동시 차단 감지! ${concurrentBlockInfo.blockedAgents}개 에이전트가 최근 ${this.blockWindow/1000}초 내에 차단됨`);
      console.log(`   영향받은 에이전트: ${concurrentBlockInfo.affectedAgents.join(', ')}`);
      console.log(`   🐌 딜레이를 ${this.extendedDelay/1000}초로 증가합니다.`);
      
      return {
        isConcurrentBlock: true,
        recommendedDelay: this.extendedDelay,
        blockedAgents: concurrentBlockInfo.blockedAgents,
        affectedAgents: concurrentBlockInfo.affectedAgents
      };
    }

    return { isConcurrentBlock: false, recommendedDelay: this.baseDelay };
  }

  /**
   * 차단 관련 에러인지 확인
   */
  isBlockError(errorMessage) {
    if (!errorMessage) return false;
    
    const blockIndicators = [
      'ERR_HTTP2_PROTOCOL_ERROR',
      'ERR_HTTP2_PROTOCCOL_ERROR', // 오타 버전도 포함
      'net::ERR_HTTP2_PROTOCOL_ERROR',
      'net::ERR_HTTP2_PROTOCCOL_ERROR',
      '쿠팡 접속 차단',
      'HTTP/2 프로토콜 오류',
      'access denied',
      'blocked',
      '차단',
      'forbidden',
      'ERR_CONNECTION_REFUSED',
      'ERR_NETWORK_CHANGED'
    ];
    
    return blockIndicators.some(indicator => 
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * 에러 코드 추출
   */
  extractErrorCode(errorMessage) {
    if (errorMessage.includes('ERR_HTTP2_PROTOCOL_ERROR') || 
        errorMessage.includes('ERR_HTTP2_PROTOCCOL_ERROR')) {
      return 'ERR_HTTP2_PROTOCOL_ERROR';
    }
    if (errorMessage.includes('ERR_CONNECTION_REFUSED')) {
      return 'ERR_CONNECTION_REFUSED';
    }
    if (errorMessage.includes('ERR_NETWORK_CHANGED')) {
      return 'ERR_NETWORK_CHANGED';
    }
    if (errorMessage.includes('쿠팡 접속 차단')) {
      return 'BLOCKED';
    }
    if (errorMessage.includes('access denied') || errorMessage.includes('forbidden')) {
      return 'ACCESS_DENIED';
    }
    return 'UNKNOWN_BLOCK';
  }

  /**
   * 동시 차단 여부 체크
   */
  checkConcurrentBlocks(currentTime) {
    // 윈도우 내의 차단만 확인
    const recentBlocks = [];
    
    for (const [agent, blockTime] of this.recentBlocks.entries()) {
      if (currentTime - blockTime <= this.blockWindow) {
        recentBlocks.push({ agent, blockTime });
      } else {
        // 오래된 차단 기록 제거
        this.recentBlocks.delete(agent);
      }
    }

    const isConcurrentBlock = recentBlocks.length >= this.minAgentsForConcurrentBlock;
    
    return {
      isConcurrentBlock,
      blockedAgents: recentBlocks.length,
      affectedAgents: recentBlocks.map(block => block.agent),
      timeWindow: this.blockWindow / 1000
    };
  }

  /**
   * 키워드 차단 횟수 업데이트
   */
  async updateBlockCount(keywordId) {
    try {
      await dbServiceV2.query(
        `UPDATE v2_test_keywords 
         SET block_count = block_count + 1, 
             last_blocked_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [keywordId]
      );
    } catch (error) {
      console.error('키워드 차단 횟수 업데이트 실패:', error);
    }
  }

  /**
   * 추적 키 생성
   */
  generateTrackingKey(keywordData) {
    const suffix = keywordData.suffix ? `-${keywordData.suffix}` : '';
    return `${keywordData.keyword}${suffix}:${keywordData.product_code}`;
  }

  /**
   * 현재 권장 딜레이 반환
   */
  getCurrentRecommendedDelay() {
    const now = Date.now();
    const concurrentBlockInfo = this.checkConcurrentBlocks(now);
    
    return concurrentBlockInfo.isConcurrentBlock ? this.extendedDelay : this.baseDelay;
  }

  /**
   * 최근 차단 상태 정보 반환
   */
  getBlockStatus() {
    const now = Date.now();
    const concurrentBlockInfo = this.checkConcurrentBlocks(now);
    
    return {
      recentBlocks: Array.from(this.recentBlocks.entries()).map(([agent, time]) => ({
        agent,
        blockedAt: new Date(time).toISOString(),
        secondsAgo: Math.round((now - time) / 1000)
      })),
      currentDelay: concurrentBlockInfo.isConcurrentBlock ? this.extendedDelay : this.baseDelay,
      isConcurrentBlock: concurrentBlockInfo.isConcurrentBlock,
      affectedAgents: concurrentBlockInfo.affectedAgents
    };
  }

  /**
   * 차단 기록 초기화 (테스트용)
   */
  reset() {
    this.recentBlocks.clear();
  }
}

// 싱글톤 인스턴스 생성
const concurrentBlockDetector = new ConcurrentBlockDetector();

module.exports = concurrentBlockDetector;