/**
 * 검색 모드 동적 전환 관리자
 * - goto 모드: URL 직접 이동 (기본)
 * - search 모드: 검색창 입력
 * 
 * 전환 규칙:
 * 1. goto 모드에서 5번 연속 차단 → search 모드로 전환
 * 2. search 모드에서 20번 실행 → goto 모드로 복귀
 */

const dbService = require('./db-service');
const dbServiceV2 = require('./db-service-v2');

class SearchModeManager {
  constructor() {
    this.BLOCK_THRESHOLD = 5;      // goto 모드 연속 차단 임계값
    this.SEARCH_ROTATION = 20;     // search 모드 실행 횟수
  }

  /**
   * 에이전트의 현재 검색 모드 가져오기
   * @param {string} agent - 에이전트 이름
   * @param {number} keywordId - 키워드 ID
   * @returns {Object} { mode: 'goto'|'search', reason: string }
   */
  async getSearchMode(agent, keywordId = null) {
    try {
      // 에이전트 상태 조회 또는 생성
      const status = await this.ensureAgentStatus(agent);
      
      let mode = status.current_mode;
      let reason = 'initial';
      let shouldSwitch = false;
      
      // goto 모드에서 연속 차단 확인
      if (status.current_mode === 'goto' && status.goto_consecutive_blocks >= this.BLOCK_THRESHOLD) {
        mode = 'search';
        reason = 'auto_switch_blocked';
        shouldSwitch = true;
        
        console.log(`🔄 [${agent}] 검색 모드 자동 전환: goto → search (${status.goto_consecutive_blocks}번 연속 차단)`);
      }
      
      // search 모드에서 실행 횟수 확인
      else if (status.current_mode === 'search' && status.search_execution_count >= this.SEARCH_ROTATION) {
        mode = 'goto';
        reason = 'auto_switch_rotation';
        shouldSwitch = true;
        
        console.log(`🔄 [${agent}] 검색 모드 자동 전환: search → goto (${status.search_execution_count}번 실행 완료)`);
      }
      
      // 모드 전환이 필요한 경우
      if (shouldSwitch) {
        await this.switchMode(agent, status.current_mode, mode, reason);
      }
      
      return { mode, reason };
      
    } catch (error) {
      console.error(`[SearchModeManager] 모드 조회 오류:`, error.message);
      // 오류 시 기본값 반환
      return { mode: 'goto', reason: 'error_fallback' };
    }
  }

  /**
   * 에이전트 상태 확인 및 생성
   */
  async ensureAgentStatus(agent) {
    const query = `
      INSERT INTO v2_search_mode_status (agent)
      VALUES ($1)
      ON CONFLICT (agent) DO NOTHING
      RETURNING *
    `;
    
    await dbServiceV2.query(query, [agent]);
    
    // 현재 상태 조회
    const result = await dbServiceV2.query(
      'SELECT * FROM v2_search_mode_status WHERE agent = $1',
      [agent]
    );
    
    return result.rows[0];
  }

  /**
   * 차단된 실행 기록
   * @param {string} agent - 에이전트 이름
   * @param {string} currentMode - 현재 모드
   */
  async recordBlockedExecution(agent, currentMode) {
    try {
      if (currentMode === 'goto') {
        // goto 모드에서만 연속 차단 카운트 증가
        await dbServiceV2.query(`
          UPDATE v2_search_mode_status 
          SET 
            goto_consecutive_blocks = goto_consecutive_blocks + 1,
            total_goto_blocks = total_goto_blocks + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE agent = $1
        `, [agent]);
        
        // 현재 카운트 확인
        const result = await dbServiceV2.query(
          'SELECT goto_consecutive_blocks FROM v2_search_mode_status WHERE agent = $1',
          [agent]
        );
        
        const blocks = result.rows[0]?.goto_consecutive_blocks || 0;
        console.log(`⚠️  [${agent}] goto 모드 연속 차단: ${blocks}회`);
      }
    } catch (error) {
      console.error(`[SearchModeManager] 차단 기록 오류:`, error.message);
    }
  }

  /**
   * 성공적인 실행 기록
   * @param {string} agent - 에이전트 이름  
   * @param {string} mode - 실행 모드
   */
  async recordSuccessfulExecution(agent, mode) {
    try {
      if (mode === 'goto') {
        // goto 성공 시 연속 차단 카운트 리셋
        await dbServiceV2.query(`
          UPDATE v2_search_mode_status 
          SET 
            goto_consecutive_blocks = 0,
            total_goto_executions = total_goto_executions + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE agent = $1
        `, [agent]);
        
        console.log(`✅ [${agent}] goto 모드 실행 성공 (연속 차단 리셋)`);
        
      } else if (mode === 'search') {
        // search 모드 실행 카운트 증가
        await dbServiceV2.query(`
          UPDATE v2_search_mode_status 
          SET 
            search_execution_count = search_execution_count + 1,
            total_search_executions = total_search_executions + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE agent = $1
        `, [agent]);
        
        // 현재 카운트 확인
        const result = await dbServiceV2.query(
          'SELECT search_execution_count FROM v2_search_mode_status WHERE agent = $1',
          [agent]
        );
        
        const count = result.rows[0]?.search_execution_count || 0;
        console.log(`🔍 [${agent}] search 모드 실행: ${count}/${this.SEARCH_ROTATION}회`);
      }
    } catch (error) {
      console.error(`[SearchModeManager] 성공 기록 오류:`, error.message);
    }
  }

  /**
   * 모드 전환 실행
   */
  async switchMode(agent, fromMode, toMode, reason) {
    const client = await dbServiceV2.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 상태 업데이트
      await client.query(`
        UPDATE v2_search_mode_status 
        SET 
          current_mode = $2,
          last_mode_change = CURRENT_TIMESTAMP,
          goto_consecutive_blocks = 0,
          search_execution_count = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE agent = $1
      `, [agent, toMode]);
      
      // 전환 이력 저장
      await client.query(`
        INSERT INTO v2_search_mode_history 
        (agent, from_mode, to_mode, switch_reason, goto_blocks_before_switch, search_executions_before_switch)
        SELECT 
          agent, $2, $3, $4, goto_consecutive_blocks, search_execution_count
        FROM v2_search_mode_status
        WHERE agent = $1
      `, [agent, fromMode, toMode, reason]);
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 에이전트별 검색 모드 통계 조회
   */
  async getStatistics(agent = null) {
    let query = `
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM v2_search_mode_history h WHERE h.agent = s.agent) as total_switches
      FROM v2_search_mode_status s
    `;
    
    const params = [];
    if (agent) {
      query += ' WHERE s.agent = $1';
      params.push(agent);
    }
    
    query += ' ORDER BY s.updated_at DESC';
    
    const result = await dbServiceV2.query(query, params);
    return result.rows;
  }

  /**
   * 검색 모드 리셋 (테스트용)
   */
  async resetAgent(agent) {
    await dbServiceV2.query(`
      UPDATE v2_search_mode_status 
      SET 
        current_mode = 'goto',
        goto_consecutive_blocks = 0,
        search_execution_count = 0,
        last_mode_change = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE agent = $1
    `, [agent]);
    
    console.log(`🔄 [${agent}] 검색 모드 상태 리셋 완료`);
  }
}

module.exports = new SearchModeManager();