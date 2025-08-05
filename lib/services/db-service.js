const { Pool } = require('pg');
const environment = require('../../environment');
const { mapV1KeywordToV2, mapV1KeywordsToV2 } = require('../utils/v1-field-mapper');

class DBService {
  constructor() {
    this.pool = null;
  }

  async connect() {
    if (!this.pool) {
      this.pool = new Pool({
        host: environment.database.host,
        port: environment.database.port,
        database: environment.database.database,
        user: environment.database.user,
        password: environment.database.password,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // 연결 테스트
      try {
        const client = await this.pool.connect();
        console.log('✅ 데이터베이스 연결 성공');
        client.release();
      } catch (error) {
        console.error('❌ 데이터베이스 연결 실패:', error.message);
        throw error;
      }
    }
    return this.pool;
  }

  async query(text, params) {
    const pool = await this.connect();
    return pool.query(text, params);
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
}

// 싱글톤 인스턴스
const dbService = new DBService();

module.exports = dbService;