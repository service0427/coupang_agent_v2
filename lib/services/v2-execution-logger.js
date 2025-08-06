/**
 * V2 실행 로깅 서비스
 * 4단계 중심의 단순화된 실행 추적
 */

const dbService = require('./db-service');

class V2ExecutionLogger {
  constructor() {
    this.currentExecution = null;
    this.stageTimers = {};
  }

  /**
   * 새 실행 세션 시작
   */
  async startExecution(keywordData, agent, searchMode = 'goto') {
    const executionData = {
      keyword_id: keywordData.id,
      agent: agent,
      keyword: keywordData.keyword,
      product_code: keywordData.product_code,
      search_mode: searchMode,
      search_query: searchMode === 'search' ? keywordData.keyword : null,
      final_status: 'stage1_failed', // 기본값은 1단계 실패
      overall_success: false,
      last_successful_stage: 0
    };

    try {
      const result = await dbService.executeQuery(`
        INSERT INTO v2_execution_logs (
          keyword_id, agent, keyword, product_code, search_mode, search_query,
          final_status, overall_success, last_successful_stage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, session_id, tracking_key
      `, [
        executionData.keyword_id,
        executionData.agent,
        executionData.keyword,
        executionData.product_code,
        executionData.search_mode,
        executionData.search_query,
        executionData.final_status,
        executionData.overall_success,
        executionData.last_successful_stage
      ]);

      this.currentExecution = {
        id: result.rows[0].id,
        session_id: result.rows[0].session_id,
        tracking_key: result.rows[0].tracking_key,
        ...executionData
      };

      console.log(`📊 [V2] 실행 로그 시작 - ID: ${this.currentExecution.id}`);
      return this.currentExecution;

    } catch (error) {
      console.error('❌ V2 실행 로그 시작 실패:', error.message);
      throw error;
    }
  }

  /**
   * 1단계: 상품 검색/이동 시작
   */
  startStage1() {
    this.stageTimers.stage1 = Date.now();
    this.updateStageStatus('stage1_search_status', 'pending');
  }

  /**
   * 1단계 완료 (성공)
   */
  async completeStage1Success() {
    const duration = this.stageTimers.stage1 ? Date.now() - this.stageTimers.stage1 : null;
    
    await this.updateExecution({
      stage1_search_status: 'success',
      stage1_completed_at: new Date(),
      stage1_duration_ms: duration,
      last_successful_stage: 1
    });

    console.log(`✅ [V2-Stage1] 검색/이동 완료 (${duration}ms)`);
  }

  /**
   * 1단계 실패
   */
  async completeStage1Failed(errorMessage) {
    const duration = this.stageTimers.stage1 ? Date.now() - this.stageTimers.stage1 : null;
    
    await this.updateExecution({
      stage1_search_status: 'failed',
      stage1_completed_at: new Date(),
      stage1_duration_ms: duration,
      stage1_error_message: errorMessage,
      final_status: 'stage1_failed',
      critical_error_message: errorMessage
    });

    console.log(`❌ [V2-Stage1] 검색/이동 실패: ${errorMessage}`);
  }

  /**
   * 2단계: 상품 찾기 시작
   */
  startStage2() {
    this.stageTimers.stage2 = Date.now();
    this.updateStageStatus('stage2_find_status', 'pending');
  }

  /**
   * 2단계 완료 (성공) - 상품 발견
   */
  async completeStage2Success(productInfo) {
    const duration = this.stageTimers.stage2 ? Date.now() - this.stageTimers.stage2 : null;
    
    const updateData = {
      stage2_find_status: 'success',
      stage2_completed_at: new Date(),
      stage2_duration_ms: duration,
      stage2_pages_searched: productInfo.pagesSearched || 1,
      stage2_product_found_page: productInfo.foundPage || 1,
      stage2_product_rank: productInfo.rank || null,
      stage2_total_products: productInfo.totalProducts || null,
      last_successful_stage: 2
    };

    await this.updateExecution(updateData);

    console.log(`✅ [V2-Stage2] 상품 발견 완료 - ${productInfo.foundPage}페이지, ${productInfo.rank}위 (${duration}ms)`);
  }

  /**
   * 2단계 실패 - 상품을 찾을 수 없음
   */
  async completeStage2Failed(searchInfo, errorMessage) {
    const duration = this.stageTimers.stage2 ? Date.now() - this.stageTimers.stage2 : null;
    
    await this.updateExecution({
      stage2_find_status: 'failed',
      stage2_completed_at: new Date(),
      stage2_duration_ms: duration,
      stage2_pages_searched: searchInfo.pagesSearched || 1,
      stage2_total_products: searchInfo.totalProducts || 0,
      stage2_error_message: errorMessage,
      final_status: 'stage2_failed'
    });

    console.log(`❌ [V2-Stage2] 상품 찾기 실패: ${searchInfo.pagesSearched}페이지 검색 후 실패`);
  }

  /**
   * 3단계: 상품 클릭 시작
   */
  startStage3() {
    this.stageTimers.stage3 = Date.now();
    this.updateStageStatus('stage3_click_status', 'pending');
  }

  /**
   * 3단계 완료 (성공) - 상품 클릭 성공
   */
  async completeStage3Success(clickInfo) {
    const duration = this.stageTimers.stage3 ? Date.now() - this.stageTimers.stage3 : null;
    
    await this.updateExecution({
      stage3_click_status: 'success',
      stage3_completed_at: new Date(),
      stage3_duration_ms: duration,
      stage3_click_attempts: clickInfo.attempts || 1,
      stage3_final_url: clickInfo.finalUrl || null,
      last_successful_stage: 3
    });

    console.log(`✅ [V2-Stage3] 상품 클릭 완료 (${clickInfo.attempts}회 시도, ${duration}ms)`);
  }

  /**
   * 3단계 실패 - 상품 클릭 실패
   */
  async completeStage3Failed(clickInfo, errorMessage) {
    const duration = this.stageTimers.stage3 ? Date.now() - this.stageTimers.stage3 : null;
    
    await this.updateExecution({
      stage3_click_status: 'failed',
      stage3_completed_at: new Date(),
      stage3_duration_ms: duration,
      stage3_click_attempts: clickInfo.attempts || 1,
      stage3_error_message: errorMessage,
      final_status: 'stage3_failed'
    });

    console.log(`❌ [V2-Stage3] 상품 클릭 실패: ${clickInfo.attempts}회 시도 후 실패`);
  }

  /**
   * 4단계: 장바구니 클릭 시작
   */
  startStage4() {
    this.stageTimers.stage4 = Date.now();
    this.updateExecution({ stage4_cart_status: 'pending' });
  }

  /**
   * 4단계 완료 (성공) - 장바구니 클릭 성공
   */
  async completeStage4Success(cartInfo) {
    const duration = this.stageTimers.stage4 ? Date.now() - this.stageTimers.stage4 : null;
    
    await this.updateExecution({
      stage4_cart_status: 'success',
      stage4_completed_at: new Date(),
      stage4_duration_ms: duration,
      stage4_click_attempts: cartInfo.attempts || 1,
      final_status: 'success',
      overall_success: true,
      last_successful_stage: 4
    });

    console.log(`✅ [V2-Stage4] 장바구니 클릭 완료 - 전체 성공! (${cartInfo.attempts}회 시도, ${duration}ms)`);
  }

  /**
   * 4단계 실패 - 장바구니 클릭 실패
   */
  async completeStage4Failed(cartInfo, errorMessage) {
    const duration = this.stageTimers.stage4 ? Date.now() - this.stageTimers.stage4 : null;
    
    await this.updateExecution({
      stage4_cart_status: 'failed',
      stage4_completed_at: new Date(),
      stage4_duration_ms: duration,
      stage4_click_attempts: cartInfo.attempts || 1,
      stage4_error_message: errorMessage,
      final_status: 'stage4_failed'
    });

    console.log(`❌ [V2-Stage4] 장바구니 클릭 실패: ${cartInfo.attempts}회 시도 후 실패`);
  }

  /**
   * 4단계 건너뛰기 (장바구니 클릭 비활성화)
   */
  async skipStage4() {
    await this.updateExecution({
      stage4_cart_status: 'not_required',
      final_status: 'success',
      overall_success: true,
      last_successful_stage: 3
    });

    console.log(`⏭️  [V2-Stage4] 장바구니 클릭 건너뛰기 - 3단계까지 성공!`);
  }

  /**
   * 실행 완료 (전체 종료)
   */
  async completeExecution(trafficInfo = null) {
    const totalDuration = this.currentExecution ? 
      Date.now() - new Date(this.currentExecution.started_at).getTime() : null;

    const updateData = {
      completed_at: new Date(),
      duration_ms: totalDuration
    };

    // 트래픽 정보 추가 (있으면)
    if (trafficInfo) {
      updateData.total_traffic_bytes = trafficInfo.totalBytes || 0;
      updateData.total_traffic_mb = Math.round(trafficInfo.totalBytes / 1024 / 1024 * 100) / 100;
      updateData.blocked_requests_count = trafficInfo.blockedCount || 0;
      updateData.traffic_summary = JSON.stringify({
        domains: trafficInfo.domainSummary || {},
        types: trafficInfo.typeSummary || {},
        cached: trafficInfo.cachedBytes || 0
      });
    }

    await this.updateExecution(updateData);
    
    console.log(`🏁 [V2] 실행 완료 - 총 ${totalDuration}ms, 단계 ${this.currentExecution.last_successful_stage}/4`);
    
    const result = this.currentExecution;
    this.currentExecution = null;
    this.stageTimers = {};
    
    return result;
  }

  /**
   * 경고 메시지 추가
   */
  async addWarning(warningMessage) {
    if (!this.currentExecution) return;

    try {
      await dbService.executeQuery(`
        UPDATE v2_execution_logs 
        SET warning_messages = array_append(
          COALESCE(warning_messages, ARRAY[]::text[]), 
          $1
        )
        WHERE id = $2
      `, [warningMessage, this.currentExecution.id]);

      console.log(`⚠️  [V2] 경고 추가: ${warningMessage}`);
    } catch (error) {
      console.error('경고 메시지 추가 실패:', error.message);
    }
  }

  /**
   * 내부 헬퍼: 실행 데이터 업데이트
   */
  async updateExecution(updateData) {
    if (!this.currentExecution) return;

    const fields = Object.keys(updateData);
    const values = Object.values(updateData);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    try {
      await dbService.executeQuery(`
        UPDATE v2_execution_logs 
        SET ${setClause}
        WHERE id = $${fields.length + 1}
      `, [...values, this.currentExecution.id]);

      // 로컬 캐시도 업데이트
      Object.assign(this.currentExecution, updateData);

    } catch (error) {
      console.error('V2 실행 로그 업데이트 실패:', error.message);
      throw error;
    }
  }

  /**
   * 내부 헬퍼: 단계 상태만 업데이트 (로깅 없이)
   */
  async updateStageStatus(field, status) {
    if (!this.currentExecution) return;

    try {
      await dbService.executeQuery(`
        UPDATE v2_execution_logs SET ${field} = $1 WHERE id = $2
      `, [status, this.currentExecution.id]);

      this.currentExecution[field] = status;
    } catch (error) {
      console.error(`단계 상태 업데이트 실패 (${field}):`, error.message);
    }
  }

  /**
   * 현재 실행 정보 조회
   */
  getCurrentExecution() {
    return this.currentExecution;
  }
}

module.exports = V2ExecutionLogger;