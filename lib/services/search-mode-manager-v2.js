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

class SearchModeManagerV2 {
  constructor() {
    this.BLOCK_THRESHOLD = 5;      // goto 모드 연속 차단 임계값
    this.SEARCH_ROTATION = 20;     // search 모드 실행 횟수
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
        SELECT current_mode, consecutive_blocks, mode_execution_count, total_blocks
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
   * 키워드별 차단 기록
   */
  async recordKeywordBlock(keywordId) {
    try {
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET consecutive_blocks = consecutive_blocks + 1,
            total_blocks = total_blocks + 1
        WHERE id = $1
      `, [keywordId]);
      
      console.log(`🔴 [키워드 ID:${keywordId}] 차단 기록 (+1)`);
      
    } catch (error) {
      console.error('키워드 차단 기록 실패:', error.message);
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

module.exports = new SearchModeManagerV2();