/**
 * 키워드별 검색 모드 동적 전환 관리자 (V2)
 * - goto 모드: URL 직접 이동 (기본)
 * - search 모드: 검색창 입력
 * 
 * 전환 규칙:
 * 1. goto 모드에서 5번 연속 차단 → search 모드로 전환
 * 2. search 모드에서 20번 실행 → goto 모드로 복귀
 */

const dbServiceV2 = require('./db-service-v2');

class SearchModeManager {
  constructor() {
    this.BLOCK_THRESHOLD = 5;      // goto 모드 연속 차단 임계값
    this.SEARCH_ROTATION = 20;     // search 모드 실행 횟수
    this.FOLDER_SWITCH_THRESHOLD = 5; // 연속 차단 시 폴더 전환 임계값
  }

  /**
   * 키워드의 현재 검색 모드 가져오기
   * @param {string} agent - 에이전트 이름
   * @param {number} keywordId - 키워드 ID
   * @returns {Object} { mode: 'goto'|'search', reason: string }
   */
  async getSearchMode(agent, keywordId = null) {
    try {
      if (!keywordId) {
        // keywordId가 없으면 기본 goto 모드 반환
        return { mode: 'goto', reason: 'no_keyword_id' };
      }
      
      // 키워드별 모드 상태 조회
      const keywordStatus = await this.getKeywordModeStatus(keywordId);
      
      let mode = keywordStatus.current_mode || 'goto';
      let reason = 'initial';
      let shouldSwitch = false;
      
      // 초기 상태 기록 (last_mode_change가 null인 경우)
      if (!keywordStatus.last_mode_change && keywordStatus.current_mode) {
        await this.initializeKeywordMode(keywordId, keywordStatus.current_mode);
      }
      
      // goto 모드에서 연속 차단 확인
      if (mode === 'goto' && keywordStatus.consecutive_blocks >= this.BLOCK_THRESHOLD) {
        mode = 'search';
        reason = 'auto_switch_blocked';
        shouldSwitch = true;
        
        console.log(`🔄 [키워드 ID:${keywordId}] 검색 모드 자동 전환: goto → search (${keywordStatus.consecutive_blocks}번 연속 차단)`);
      }
      
      // search 모드에서 실행 횟수 확인
      else if (mode === 'search' && keywordStatus.mode_execution_count >= this.SEARCH_ROTATION) {
        mode = 'goto';
        reason = 'auto_switch_rotation';
        shouldSwitch = true;
        
        console.log(`🔄 [키워드 ID:${keywordId}] 검색 모드 자동 전환: search → goto (${keywordStatus.mode_execution_count}번 실행 완료)`);
      }
      
      // 모드 전환이 필요한 경우
      if (shouldSwitch) {
        await this.switchKeywordMode(keywordId, mode, reason);
      }
      
      return { mode, reason };
      
    } catch (error) {
      console.error('키워드별 검색 모드 조회 실패:', error.message);
      return { mode: 'goto', reason: 'error' };
    }
  }

  /**
   * 키워드별 모드 상태 조회
   */
  async getKeywordModeStatus(keywordId) {
    try {
      const result = await dbServiceV2.query(`
        SELECT current_mode, consecutive_blocks, mode_execution_count, total_blocks, last_mode_change
        FROM v2_test_keywords 
        WHERE id = $1
      `, [keywordId]);
      
      if (result.rows.length > 0) {
        return result.rows[0];
      } else {
        // 키워드가 없으면 기본값 반환
        return {
          current_mode: 'goto',
          consecutive_blocks: 0,
          mode_execution_count: 0,
          total_blocks: 0
        };
      }
    } catch (error) {
      console.error('키워드 모드 상태 조회 실패:', error.message);
      return {
        current_mode: 'goto',
        consecutive_blocks: 0,
        mode_execution_count: 0,
        total_blocks: 0
      };
    }
  }

  /**
   * 키워드 모드 전환
   */
  async switchKeywordMode(keywordId, newMode, reason) {
    try {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET current_mode = $1, 
            mode_execution_count = 0,
            consecutive_blocks = CASE WHEN $1 = 'search' THEN 0 ELSE consecutive_blocks END,
            last_mode_change = CURRENT_TIMESTAMP,
            mode_switch_reason = $2
        WHERE id = $3
      `, [newMode, reason, keywordId]);
      
      console.log(`✅ [키워드 ID:${keywordId}] 모드 전환 완료: ${newMode.toUpperCase()}`);
      
    } catch (error) {
      console.error('키워드 모드 전환 실패:', error.message);
    }
  }

  /**
   * 키워드별 차단 기록 (폴더 전환 로직 포함)
   */
  async recordKeywordBlock(keywordId, agent = null, errorInfo = null) {
    try {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET consecutive_blocks = consecutive_blocks + 1,
            total_blocks = total_blocks + 1
        WHERE id = $1
      `, [keywordId]);
      
      console.log(`🔴 [키워드 ID:${keywordId}] 차단 기록 (+1)`);
      
      // 폴더 전환 임계값 확인
      if (agent && keywordId) {
        await this.checkAndHandleFolderSwitch(keywordId, agent, errorInfo);
      }
      
    } catch (error) {
      console.error('키워드 차단 기록 실패:', error.message);
    }
  }

  /**
   * 폴더 전환 필요성 확인 및 실행
   */
  async checkAndHandleFolderSwitch(keywordId, agent, errorInfo = null) {
    try {
      // 현재 연속 차단 횟수 확인
      const result = await dbServiceV2.query(`
        SELECT consecutive_blocks, keyword 
        FROM v2_test_keywords 
        WHERE id = $1
      `, [keywordId]);
      
      if (result.rows.length === 0) return;
      
      const { consecutive_blocks, keyword } = result.rows[0];
      
      // 5회 연속 차단 시 폴더 전환
      if (consecutive_blocks >= this.FOLDER_SWITCH_THRESHOLD) {
        console.log(`🚨 [${agent}] 키워드 "${keyword}" 연속 ${consecutive_blocks}회 차단 - 폴더 전환 실행`);
        
        const SequentialProfileManager = require('../utils/sequential-profile-manager');
        const manager = new SequentialProfileManager(agent);
        
        // 차단 원인 분석
        const blockingReason = this.analyzeBlockingReason(errorInfo, consecutive_blocks);
        const additionalInfo = {
          keyword_id: keywordId,
          keyword_name: keyword,
          consecutive_blocks: consecutive_blocks,
          trigger: 'auto_blocking_threshold',
          error_info: errorInfo
        };
        
        // 새 폴더로 전환
        const switchResult = await manager.handleBlocking(blockingReason, additionalInfo);
        
        console.log(`✅ [${agent}] 폴더 전환 완료: ${switchResult.oldFolder} → ${switchResult.newFolder}`);
        console.log(`📁 새 프로필 경로: ${switchResult.newPath}`);
        
        // 차단 카운터 리셋 (새 폴더이므로)
        await dbServiceV2.query(`
          UPDATE v2_test_keywords 
          SET consecutive_blocks = 0,
              mode_switch_reason = 'folder_switch_blocking'
          WHERE id = $1
        `, [keywordId]);
        
        console.log(`🔄 [키워드 ID:${keywordId}] 연속 차단 카운터 리셋 (새 폴더)`);
        
        return switchResult;
      }
      
    } catch (error) {
      console.error('폴더 전환 확인 실패:', error.message);
      return null;
    }
  }

  /**
   * 차단 원인 분석
   */
  analyzeBlockingReason(errorInfo, consecutiveBlocks) {
    if (!errorInfo) {
      return `consecutive_blocks_${consecutiveBlocks}`;
    }
    
    const errorMessage = errorInfo.message || errorInfo.error || '';
    
    if (errorMessage.includes('ERR_HTTP2_PROTOCOL_ERROR')) {
      return 'http2_protocol_error';
    } else if (errorMessage.includes('net::ERR_CONNECTION_REFUSED')) {
      return 'connection_refused';
    } else if (errorMessage.includes('timeout')) {
      return 'navigation_timeout';
    } else if (errorMessage.includes('차단') || errorMessage.includes('block')) {
      return 'coupang_blocking_detected';
    } else {
      return `error_based_blocking_${consecutiveBlocks}`;
    }
  }

  /**
   * 키워드별 성공 실행 기록
   */
  async recordKeywordSuccess(keywordId, mode) {
    try {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET mode_execution_count = mode_execution_count + 1,
            consecutive_blocks = 0
        WHERE id = $1
      `, [keywordId]);
      
      console.log(`✅ [키워드 ID:${keywordId}] ${mode.toUpperCase()} 모드 성공 실행 (+1)`);
      
    } catch (error) {
      console.error('키워드 성공 실행 기록 실패:', error.message);
    }
  }

  /**
   * 키워드 모드 초기 상태 기록
   */
  async initializeKeywordMode(keywordId, currentMode) {
    try {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET last_mode_change = CURRENT_TIMESTAMP,
            mode_switch_reason = 'initial_state'
        WHERE id = $1
      `, [keywordId]);
      
      console.log(`🔧 [키워드 ID:${keywordId}] 초기 모드 상태 기록: ${currentMode.toUpperCase()}`);
      
    } catch (error) {
      console.error('키워드 초기 모드 기록 실패:', error.message);
    }
  }

  /**
   * 키워드별 모드 수동 설정
   */
  async setKeywordMode(keywordId, mode) {
    try {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET current_mode = $1,
            mode_execution_count = 0,
            consecutive_blocks = 0,
            last_mode_change = CURRENT_TIMESTAMP,
            mode_switch_reason = 'manual'
        WHERE id = $2
      `, [mode, keywordId]);
      
      console.log(`⚙️ [키워드 ID:${keywordId}] 모드 수동 설정: ${mode.toUpperCase()}`);
      
    } catch (error) {
      console.error('키워드 모드 수동 설정 실패:', error.message);
    }
  }
}

module.exports = new SearchModeManager();