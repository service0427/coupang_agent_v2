/**
 * 데이터베이스 서비스 V2
 * - 새로운 V2 테이블 구조 지원
 * - 상세 실행 로그 및 네트워크 트래픽 추적
 */

const { Pool } = require('pg');
const config = require('../../environment');

class DatabaseServiceV2 {
  constructor() {
    this.pool = new Pool(config.database);
    this.pool.on('error', (err) => {
      console.error('🔴 예상치 못한 데이터베이스 오류:', err);
    });
  }

  /**
   * 쿼리 실행
   */
  async query(text, params) {
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('쿼리 실행 오류:', error);
      throw error;
    }
  }

  /**
   * 트랜잭션용 클라이언트 가져오기
   */
  async getClient() {
    return await this.pool.connect();
  }

  /**
   * V2 키워드 목록 조회
   */
  async getKeywordsV2(options = {}) {
    const { agent = null, limit = null } = options;
    
    let query = `
      SELECT 
        k.*,
        k.current_executions as runs,
        k.success_count as succ,
        k.fail_count as fail,
        CASE 
          WHEN (k.success_count + k.fail_count) > 0 
          THEN ROUND((k.success_count::NUMERIC / (k.success_count + k.fail_count)) * 100, 2)
          ELSE 0 
        END as success_rate
      FROM v2_test_keywords k
      WHERE k.current_executions < k.max_executions
        AND k.date = CURRENT_DATE
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (agent) {
      query += ` AND k.agent = $${paramIndex}`;
      params.push(agent);
      paramIndex++;
    }
    
    query += ' ORDER BY k.id';
    
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
    }
    
    const result = await this.query(query, params);
    return result.rows;
  }

  /**
   * V2 실행 로그 시작
   */
  async startExecutionV2(keywordId, agent, searchMode = 'goto', optimizeConfig = null, keywordData = null) {
    // keywordData에서 keyword와 product_code 추출
    let keyword = '';
    let productCode = '';
    
    if (keywordData) {
      keyword = keywordData.keyword || '';
      productCode = keywordData.product_code || '';
    } else {
      // keywordId로 조회
      const keywordResult = await this.query(
        'SELECT keyword, product_code FROM v2_test_keywords WHERE id = $1',
        [keywordId]
      );
      if (keywordResult.rows.length > 0) {
        keyword = keywordResult.rows[0].keyword;
        productCode = keywordResult.rows[0].product_code;
      }
    }
    
    // v2_test_keywords 테이블에서 블록 설정을 읽어서 하나로 뭉침
    let optimizeConfigApplied = null;
    try {
      const blockQuery = `
        SELECT 
          block_mercury, 
          block_image_cdn, 
          block_img1a_cdn, 
          block_thumbnail_cdn 
        FROM v2_test_keywords 
        WHERE id = $1
      `;
      const blockResult = await this.query(blockQuery, [keywordId]);
      
      if (blockResult.rows.length > 0) {
        const blockSettings = blockResult.rows[0];
        optimizeConfigApplied = JSON.stringify({
          block_mercury: blockSettings.block_mercury || false,
          block_image_cdn: blockSettings.block_image_cdn || false,
          block_img1a_cdn: blockSettings.block_img1a_cdn || false,
          block_thumbnail_cdn: blockSettings.block_thumbnail_cdn || false
        });
      }
    } catch (error) {
      console.error('🔴 [V2 Log] 블록 설정 읽기 실패:', error.message);
    }
    
    const query = `
      INSERT INTO v2_execution_logs (
        keyword_id, agent, keyword, product_code, search_mode, optimize_config_applied, 
        started_at, final_status, overall_success
      ) VALUES (
        $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 'in_progress', false
      ) RETURNING id, session_id
    `;
    
    const result = await this.query(query, [
      keywordId, 
      agent,
      keyword,
      productCode,
      searchMode,
      optimizeConfigApplied
    ]);
    
    return {
      executionId: result.rows[0].id,
      sessionId: result.rows[0].session_id
    };
  }

  /**
   * V2 실행 로그 업데이트 (4단계 구조)
   */
  async updateExecutionStageV2(executionId, stage, data = {}) {
    const startTime = Date.now();
    const stageUpdates = {
      // 1단계: 페이지 도달
      'page_reached': {
        stage1_search_status: 'success',
        stage1_completed_at: 'CURRENT_TIMESTAMP',
        stage1_duration_ms: data.loadTime || 0
      },
      // 2단계: 상품 목록 추출
      'product_searched': {
        stage2_find_status: 'success',
        stage2_completed_at: 'CURRENT_TIMESTAMP',
        stage2_duration_ms: Date.now() - startTime,
        stage2_pages_searched: data.pagesSearched || 1,
        stage2_total_products: data.productCount || 0
      },
      // 3단계: 상품 발견
      'product_found': {
        stage2_find_status: 'success',
        stage2_product_found_page: data.page || 1,
        stage2_product_rank: data.rank,
        stage2_total_products: data.productCount || 0
      },
      // 4단계: 상품 클릭
      'product_clicked': {
        stage3_click_status: 'success',
        stage3_completed_at: 'CURRENT_TIMESTAMP',
        stage3_duration_ms: data.clickTime || 0,
        stage3_click_attempts: 1,
        stage3_final_url: data.finalUrl
      },
      // 5단계: 장바구니 클릭
      'cart_clicked': {
        stage4_cart_status: data.success ? 'success' : 'failed',
        stage4_completed_at: 'CURRENT_TIMESTAMP',
        stage4_duration_ms: Date.now() - startTime,
        stage4_click_attempts: data.clickCount || 1
      }
    };
    
    const updates = stageUpdates[stage];
    if (!updates) {
      throw new Error(`Unknown stage: ${stage}`);
    }
    
    // 동적 쿼리 생성
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (value === 'CURRENT_TIMESTAMP') {
        setClauses.push(`${key} = CURRENT_TIMESTAMP`);
      } else {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    values.push(executionId);
    
    const query = `
      UPDATE v2_execution_logs 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `;
    
    await this.query(query, values);
  }

  /**
   * V2 실행 완료
   */
  async completeExecutionV2(executionId, result) {
    const {
      success = false,
      finalStatus = 'error',
      errorMessage = null,
      errorStep = null,
      successLevel = 0,
      partialSuccess = false,
      finalUrl = null,
      searchQuery = null,
      actualIp = null,
      itemId = null,
      vendorItemId = null,
      totalTrafficBytes = 0,
      totalTrafficMb = 0  // MB 단위로 직접 받기
    } = result;
    
    // 기존 bytes 변환 로직 제거
    
    // overall_success는 최종 단계까지 성공했는지 여부
    const overallSuccess = finalStatus === 'success' || finalStatus === 'stage4_success' || finalStatus === 'stage3_success';
    
    const query = `
      UPDATE v2_execution_logs 
      SET 
        completed_at = CURRENT_TIMESTAMP,
        duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) * 1000,
        final_status = $1,
        overall_success = $2,
        last_successful_stage = $3,
        critical_error_message = $4,
        actual_ip = $5,
        item_id = $6,
        vendor_item_id = $7,
        total_traffic_mb = $8
      WHERE id = $9
    `;
    
    await this.query(query, [
      finalStatus,
      overallSuccess,
      successLevel,
      errorMessage,
      actualIp,
      itemId,
      vendorItemId,
      totalTrafficMb,
      executionId
    ]);
    
    // 키워드 통계 업데이트 (차단 여부 확인)
    const isBlocked = errorMessage && (
      errorMessage.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
      errorMessage.includes('쿠팡 접속 차단') ||
      errorMessage.includes('net::ERR_HTTP2_PROTOCOL_ERROR')
    );
    await this.updateKeywordStatsV2(executionId, success, isBlocked);
  }

  /**
   * 키워드 실행 통계 업데이트
   */
  async updateKeywordStatsV2(executionId, success, isBlocked = false) {
    // 실행 정보 조회
    const execResult = await this.query(
      'SELECT keyword_id, final_status, critical_error_message FROM v2_execution_logs WHERE id = $1',
      [executionId]
    );
    
    if (execResult.rows.length === 0) return;
    
    const { keyword_id: keywordId, final_status, critical_error_message } = execResult.rows[0];
    
    // 차단 여부 판단
    const blocked = isBlocked || 
      (critical_error_message && (
        critical_error_message.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
        critical_error_message.includes('쿠팡 접속 차단') ||
        critical_error_message.includes('net::ERR_HTTP2_PROTOCOL_ERROR')
      ));
    
    // 통계 업데이트
    const updateQuery = `
      UPDATE v2_test_keywords 
      SET 
        current_executions = current_executions + 1,
        success_count = success_count + $1,
        fail_count = fail_count + $2,
        block_count = block_count + $3,
        last_executed_at = CURRENT_TIMESTAMP,
        last_blocked_at = CASE WHEN $3 = 1 THEN CURRENT_TIMESTAMP ELSE last_blocked_at END
      WHERE id = $4
    `;
    
    await this.query(updateQuery, [
      success ? 1 : 0,
      (!success && !blocked) ? 1 : 0,
      blocked ? 1 : 0,
      keywordId
    ]);
  }

  /**
   * 액션 로그 추가
   */
  async logActionV2(executionId, sessionId, actionData) {
    const {
      actionSeq,
      actionType,
      actionTarget,
      actionDetail = null,
      processStep = null,
      success = false,
      errorType = null,
      errorMessage = null,
      currentUrl = null,
      pageTitle = null,
      domReadyMs = null,
      loadCompleteMs = null,
      elementVisible = null,
      elementClickable = null,
      elementSelector = null,
      elementText = null,
      screenshotPath = null,
      domSnapshot = null,
      durationMs = null
    } = actionData;
    
    const query = `
      INSERT INTO v2_action_logs (
        execution_id, session_id, action_seq, action_type, action_target,
        action_detail, process_step, started_at, duration_ms,
        success, error_type, error_message, current_url, page_title,
        dom_ready_ms, load_complete_ms, element_visible, element_clickable,
        element_selector, element_text, screenshot_path, dom_snapshot
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING id
    `;
    
    const result = await this.query(query, [
      executionId, sessionId, actionSeq, actionType, actionTarget,
      actionDetail ? JSON.stringify(actionDetail) : null,
      processStep, durationMs, success, errorType, errorMessage,
      currentUrl, pageTitle, domReadyMs, loadCompleteMs,
      elementVisible, elementClickable, elementSelector, elementText,
      screenshotPath, domSnapshot
    ]);
    
    return result.rows[0].id;
  }


  /**
   * 에러 로그 추가
   */
  async logErrorV2(executionId, sessionId, errorData) {
    const {
      actionId = null,
      errorLevel = 'error',
      errorCode = null,
      errorMessage,
      errorStack = null,
      actionType = null,
      keyword = null,
      productCode = null,
      pageUrl = null,
      agent = null,
      proxyUsed = null,
      actualIp = null,
      domState = null,
      consoleLogs = null,
      networkState = null
    } = errorData;
    
    // tracking_key 생성
    const trackingKey = keyword && productCode ? `${keyword}:${productCode}` : null;
    
    const query = `
      INSERT INTO v2_error_logs (
        execution_id, action_id, session_id, error_level, error_code,
        error_message, error_stack, occurred_at, action_type, 
        keyword, product_code, tracking_key, page_url,
        agent, proxy_used, actual_ip, dom_state, console_logs, network_state
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, 
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
    `;
    
    await this.query(query, [
      executionId, actionId, sessionId, errorLevel, errorCode,
      errorMessage, errorStack, actionType, 
      keyword, productCode, trackingKey, pageUrl,
      agent, proxyUsed, actualIp, domState, consoleLogs, networkState
    ]);
  }

  /**
   * 상품 추적 로그 추가
   */
  async logProductTrackingV2(executionId, sessionId, trackingData) {
    const {
      pageNumber,
      pageUrl,
      productsInPage = 0,
      productsWithRank = 0,
      targetProductCode = null,
      targetFound = false,
      targetPosition = null,
      pageLoadSuccess = true,
      productListFound = true,
      errorMessage = null
    } = trackingData;
    
    const query = `
      INSERT INTO v2_product_tracking (
        execution_id, session_id, page_number, page_url,
        products_in_page, products_with_rank, target_product_code,
        target_found, target_position, page_load_success,
        product_list_found, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
    `;
    
    await this.query(query, [
      executionId, sessionId, pageNumber, pageUrl,
      productsInPage, productsWithRank, targetProductCode,
      targetFound, targetPosition, pageLoadSuccess,
      productListFound, errorMessage
    ]);
  }
  

  /**
   * 연결 종료
   */
  async close() {
    await this.pool.end();
    console.log('✅ V2 데이터베이스 연결 풀 종료 완료');
  }
}

module.exports = new DatabaseServiceV2();