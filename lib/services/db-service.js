const { Pool } = require('pg');
const environment = require('../../environment');
const { mapV1KeywordToV2, mapV1KeywordsToV2 } = require('../utils/v1-field-mapper');
const dbServiceV2 = require('./db-service-v2');

class DBService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.reconnectDelay = 5000; // 5초
    this.connectionStats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      connectionErrors: 0,
      lastError: null
    };
  }

  async connect() {
    if (!this.pool) {
      this.pool = new Pool({
        host: environment.database.host,
        port: environment.database.port,
        database: environment.database.database,
        user: environment.database.user,
        password: environment.database.password,
        max: 20, // 최대 연결 수
        min: 2,  // 최소 연결 수
        idleTimeoutMillis: 30000, // 30초 후 유휴 연결 해제
        connectionTimeoutMillis: 5000, // 5초 연결 타임아웃
        acquireTimeoutMillis: 10000, // 10초 획득 타임아웃
        allowExitOnIdle: true // 모든 클라이언트가 유휴 상태일 때 프로세스 종료 허용
      });

      // 연결 이벤트 리스너 설정
      this.setupEventListeners();

      // 연결 테스트
      await this.testConnection();
    }
    return this.pool;
  }

  setupEventListeners() {
    this.pool.on('connect', (client) => {
      console.log('🔗 새 데이터베이스 연결 생성');
      this.isConnected = true;
      this.connectionRetries = 0;
    });

    this.pool.on('error', (err) => {
      console.error('❌ 데이터베이스 풀 오류:', err.message);
      this.isConnected = false;
      this.connectionStats.connectionErrors++;
      this.connectionStats.lastError = err.message;
    });

    this.pool.on('remove', () => {
      console.log('🔌 데이터베이스 연결 제거됨');
    });
  }

  async testConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time');
      console.log('✅ 데이터베이스 연결 성공:', result.rows[0].current_time);
      client.release();
      this.isConnected = true;
      this.connectionRetries = 0;
    } catch (error) {
      console.error('❌ 데이터베이스 연결 실패:', error.message);
      this.isConnected = false;
      this.connectionStats.connectionErrors++;
      this.connectionStats.lastError = error.message;
      throw error;
    }
  }

  async reconnect() {
    if (this.connectionRetries >= this.maxRetries) {
      throw new Error(`최대 재연결 시도 횟수 초과 (${this.maxRetries}회)`);
    }

    this.connectionRetries++;
    console.log(`🔄 데이터베이스 재연결 시도 ${this.connectionRetries}/${this.maxRetries}...`);
    
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    
    try {
      await this.testConnection();
      console.log('✅ 데이터베이스 재연결 성공');
    } catch (error) {
      console.error(`❌ 재연결 실패 (${this.connectionRetries}/${this.maxRetries}):`, error.message);
      if (this.connectionRetries < this.maxRetries) {
        return await this.reconnect();
      }
      throw error;
    }
  }

  async query(text, params) {
    this.connectionStats.totalQueries++;
    
    try {
      const pool = await this.connect();
      const result = await pool.query(text, params);
      this.connectionStats.successfulQueries++;
      return result;
    } catch (error) {
      this.connectionStats.failedQueries++;
      
      // 연결 관련 오류인 경우 재연결 시도
      if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || !this.isConnected) {
        console.log('🔄 연결 오류로 인한 재연결 시도...');
        try {
          await this.reconnect();
          // 재연결 후 쿼리 재시도
          const pool = await this.connect();
          const result = await pool.query(text, params);
          this.connectionStats.successfulQueries++;
          return result;
        } catch (reconnectError) {
          console.error('❌ 재연결 후 쿼리 실패:', reconnectError.message);
          throw reconnectError;
        }
      }
      
      throw error;
    }
  }

  async getClient() {
    const pool = await this.connect();
    return pool.connect();
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('🔚 데이터베이스 연결 종료');
    }
  }

  // v1 테이블 전용 헬퍼 메서드
  async getKeywordById(id) {
    const query = `
      SELECT 
        k.id,
        k.keyword,
        k.code,
        k.date,
        k.cart,
        k.proxy,
        k.session,
        k.cache,
        k.userdata,
        k.gpu,
        k.optimize,
        k.search,
        k.agent,
        k.runs,
        k.max_runs,
        k.succ,
        k.fail,
        k.last_run
      FROM v1_keywords k
      WHERE k.id = $1
    `;

    const result = await this.query(query, [id]);
    const v1Keyword = result.rows[0];
    return v1Keyword ? mapV1KeywordToV2(v1Keyword) : null;
  }

  async getKeywords(agent = null, limit = null) {
    let query = `
      SELECT * FROM v1_keywords 
      WHERE runs < max_runs
      AND date = CURRENT_DATE
    `;
    const params = [];

    if (agent) {
      query += ` AND agent = $${params.length + 1}`;
      params.push(agent);
    }

    query += ' ORDER BY id';

    if (limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(limit);
    }

    console.log(`🔍 키워드 조회 쿼리:`, query);
    console.log(`📋 파라미터:`, params);

    const result = await this.query(query, params);
    console.log(`✅ 조회 결과: ${result.rows.length}개 키워드`);
    
    // v1 키워드를 v2 형식으로 변환
    return mapV1KeywordsToV2(result.rows);
  }

  async updateKeywordExecution(keywordId, success) {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      // 실행 횟수 및 성공/실패 카운트 업데이트
      await client.query(`
        UPDATE v1_keywords 
        SET 
          runs = runs + 1,
          succ = succ + $1,
          fail = fail + $2,
          last_run = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [success ? 1 : 0, success ? 0 : 1, keywordId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async logExecution(executionData) {
    try {
      const query = `
        INSERT INTO v1_executions (
          keyword_id, agent, success, found, rank,
          url_rank, real_rank, pages, cart, error,
          duration, proxy, ip, url, query,
          traffic, optimize, session, cache,
          userdata, gpu, item_id, vendor_item_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        RETURNING id
      `;

      const values = [
        executionData.keywordId,
        executionData.agent,
        executionData.success,
        executionData.productFound,
        executionData.productRank,
        executionData.urlRank,
        executionData.realRank,
        executionData.pagesSearched,
        executionData.cartClicked,
        executionData.errorMessage,
        executionData.durationMs,
        executionData.proxyUsed,
        executionData.actualIp,
        executionData.finalUrl,
        executionData.searchQuery,
        executionData.actualTrafficMb,
        executionData.optimizeEnabled,
        !executionData.clearSession,      // session (반전)
        !executionData.clearCache,         // cache (반전)
        executionData.usePersistent,       // userdata
        !executionData.gpuDisabled,        // gpu (반전)
        executionData.itemId,
        executionData.vendorItemId
      ];

      const result = await this.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('실행 로그 저장 오류:', error.message);
      throw error;
    }
  }

  async getKeywordStats() {
    const query = `
      SELECT 
        k.id,
        k.keyword,
        k.code,
        k.agent,
        k.runs as current_runs,
        k.max_runs,
        k.succ as success_count,
        k.fail as fail_count,
        CASE 
          WHEN (k.succ + k.fail) > 0 
          THEN ROUND((k.succ::NUMERIC / (k.succ + k.fail)) * 100, 2)
          ELSE 0 
        END as success_rate,
        k.last_run
      FROM v1_keywords k
      ORDER BY k.id
    `;

    const result = await this.query(query);
    return result.rows;
  }

  /**
   * 에이전트별 동적 설정 조회
   * @param {string} agent - 에이전트 이름
   * @returns {Object|null} 에이전트 설정 또는 null
   */
  async getAgentConfig(agent) {
    const query = `
      SELECT 
        agent,
        coupang_main_allow,
        mercury_allow,
        ljc_allow,
        assets_cdn_allow,
        front_cdn_allow,
        image_cdn_allow,
        static_cdn_allow,
        img1a_cdn_allow,
        thumbnail_cdn_allow,
        coupang_main_block_patterns,
        test_name,
        notes
      FROM v1_agent_config 
      WHERE agent = $1
    `;

    try {
      const result = await this.query(query, [agent]);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`⚠️  에이전트 설정 조회 실패 (${agent}):`, error.message);
      return null;
    }
  }

  /**
   * 모든 에이전트 설정 조회
   * @returns {Array} 모든 에이전트 설정 배열
   */
  async getAllAgentConfigs() {
    const query = `
      SELECT 
        agent,
        coupang_main_allow,
        mercury_allow,
        ljc_allow,
        assets_cdn_allow,
        front_cdn_allow,
        image_cdn_allow,
        static_cdn_allow,
        img1a_cdn_allow,
        thumbnail_cdn_allow,
        coupang_main_block_patterns,
        test_name,
        notes,
        updated_at
      FROM v1_agent_config 
      ORDER BY agent
    `;

    try {
      const result = await this.query(query);
      return result.rows;
    } catch (error) {
      console.error('⚠️  전체 에이전트 설정 조회 실패:', error.message);
      return [];
    }
  }

  /**
   * 연결 풀 통계 조회
   * @returns {Object} 연결 풀 통계
   */
  getPoolStats() {
    if (!this.pool) {
      return { error: '연결 풀이 초기화되지 않음' };
    }

    return {
      totalCount: this.pool.totalCount, // 총 생성된 연결 수
      idleCount: this.pool.idleCount,   // 유휴 연결 수
      waitingCount: this.pool.waitingCount, // 대기 중인 요청 수
      maxConnections: this.pool.options.max,
      minConnections: this.pool.options.min,
      connectionStats: this.connectionStats,
      isConnected: this.isConnected,
      connectionRetries: this.connectionRetries
    };
  }

  /**
   * 연결 풀 상태 확인
   * @returns {Object} 상태 정보
   */
  async getHealthCheck() {
    try {
      const start = Date.now();
      await this.query('SELECT 1 as health_check');
      const responseTime = Date.now() - start;
      
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        ...this.getPoolStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        ...this.getPoolStats()
      };
    }
  }

  /**
   * 연결 풀 정리 및 종료
   */
  async close() {
    if (this.pool) {
      console.log('🔽 데이터베이스 연결 풀 종료 중...');
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      console.log('✅ 데이터베이스 연결 풀 종료 완료');
    }
  }

  /**
   * 유휴 연결 정리
   */
  async cleanupIdleConnections() {
    if (this.pool && this.pool.idleCount > this.pool.options.min) {
      console.log(`🧹 유휴 연결 정리: ${this.pool.idleCount}개 중 여분 정리`);
      // PostgreSQL 풀은 자동으로 유휴 연결을 정리하므로 수동 작업 불필요
      // 하지만 통계는 업데이트
      console.log(`📊 정리 후 상태: 총 ${this.pool.totalCount}개, 유휴 ${this.pool.idleCount}개`);
    }
  }

  // ===== V2 테이블 지원 메서드 =====
  
  /**
   * V2 키워드 조회
   * @param {Object} options - 조회 옵션
   * @returns {Array} V2 키워드 배열
   */
  async getKeywordsV2(options = {}) {
    return await dbServiceV2.getKeywordsV2(options);
  }

  /**
   * V2 실행 로그 시작
   * @param {number} keywordId - 키워드 ID
   * @param {string} agent - 에이전트 이름
   * @param {string} searchMode - 검색 모드
   * @param {Object} optimizeConfig - 최적화 설정
   * @returns {Object} executionId와 sessionId
   */
  async startExecutionV2(keywordId, agent, searchMode = 'goto', optimizeConfig = null) {
    return await dbServiceV2.startExecutionV2(keywordId, agent, searchMode, optimizeConfig);
  }

  /**
   * V2 실행 단계 업데이트
   * @param {number} executionId - 실행 ID
   * @param {string} stage - 실행 단계
   * @param {Object} data - 단계별 데이터
   */
  async updateExecutionStageV2(executionId, stage, data = {}) {
    return await dbServiceV2.updateExecutionStageV2(executionId, stage, data);
  }

  /**
   * V2 실행 완료
   * @param {number} executionId - 실행 ID
   * @param {Object} result - 실행 결과
   */
  async completeExecutionV2(executionId, result) {
    return await dbServiceV2.completeExecutionV2(executionId, result);
  }

  /**
   * V2 액션 로그
   * @param {number} executionId - 실행 ID
   * @param {string} sessionId - 세션 ID
   * @param {Object} actionData - 액션 데이터
   */
  async logActionV2(executionId, sessionId, actionData) {
    return await dbServiceV2.logActionV2(executionId, sessionId, actionData);
  }

  /**
   * V2 네트워크 로그
   * @param {number} executionId - 실행 ID
   * @param {string} sessionId - 세션 ID
   * @param {Object} networkData - 네트워크 데이터
   */
  async logNetworkV2(executionId, sessionId, networkData) {
    return await dbServiceV2.logNetworkV2(executionId, sessionId, networkData);
  }

  /**
   * V2 에러 로그
   * @param {number} executionId - 실행 ID
   * @param {string} sessionId - 세션 ID
   * @param {Object} errorData - 에러 데이터
   */
  async logErrorV2(executionId, sessionId, errorData) {
    return await dbServiceV2.logErrorV2(executionId, sessionId, errorData);
  }

  /**
   * V2 상품 추적 로그
   * @param {number} executionId - 실행 ID
   * @param {string} sessionId - 세션 ID
   * @param {Object} trackingData - 추적 데이터
   */
  async logProductTrackingV2(executionId, sessionId, trackingData) {
    return await dbServiceV2.logProductTrackingV2(executionId, sessionId, trackingData);
  }

  /**
   * V1/V2 테이블 자동 선택
   * 환경 변수 USE_V2_TABLES가 true면 V2 사용
   */
  async getKeywordsAuto(options = {}) {
    if (process.env.USE_V2_TABLES === 'true') {
      console.log('📊 V2 테이블 사용');
      return await this.getKeywordsV2(options);
    } else {
      console.log('📊 V1 테이블 사용');
      return await this.getKeywords(options.agent, options.limit);
    }
  }
}

// 싱글톤 인스턴스
const dbService = new DBService();

// 프로세스 종료 시 정리
process.on('SIGINT', async () => {
  await dbService.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await dbService.close();
  process.exit(0);
});

module.exports = dbService;