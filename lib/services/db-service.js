const { Pool } = require('pg');
const environment = require('../../config/environment');

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

  // v2 테이블 전용 헬퍼 메서드
  async getKeywordById(id) {
    const query = `
      SELECT 
        k.id,
        k.keyword,
        k.suffix,
        k.product_code,
        k.date,
        k.cart_click_enabled,
        k.proxy_server,
        k.profile_name,
        k.clear_session,
        k.use_persistent,
        k.gpu_disabled,
        k.agent,
        k.current_executions,
        k.max_executions,
        k.success_count,
        k.fail_count,
        k.last_executed_at
      FROM v2_test_keywords k
      WHERE k.id = $1
    `;

    const result = await this.query(query, [id]);
    return result.rows[0] || null;
  }

  async getKeywords(agent = null, limit = null) {
    let query = `
      SELECT * FROM v2_test_keywords 
      WHERE current_executions < max_executions
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
    
    return result.rows;
  }

  async updateKeywordExecution(keywordId, success) {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      // 실행 횟수 및 성공/실패 카운트 업데이트
      await client.query(`
        UPDATE v2_test_keywords 
        SET 
          current_executions = current_executions + 1,
          success_count = success_count + $1,
          fail_count = fail_count + $2,
          last_executed_at = CURRENT_TIMESTAMP
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
      // cart_click_count 컬럼이 있는 경우
      const query = `
        INSERT INTO v2_execution_logs (
          keyword_id, agent, success, product_found, product_rank,
          url_rank, pages_searched, cart_clicked, cart_click_count, error_message,
          duration_ms, proxy_used, actual_ip, final_url, search_query
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `;

      const values = [
        executionData.keywordId,
        executionData.agent,
        executionData.success,
        executionData.productFound,
        executionData.productRank,
        executionData.urlRank,
        executionData.pagesSearched,
        executionData.cartClicked,
        executionData.cartClickCount || 0,
        executionData.errorMessage,
        executionData.durationMs,
        executionData.proxyUsed,
        executionData.actualIp,
        executionData.finalUrl,
        executionData.searchQuery
      ];

      const result = await this.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      // cart_click_count 컬럼이 없는 경우 fallback
      if (error.message.includes('column "cart_click_count"')) {
        console.log('⚠️  cart_click_count 컬럼이 없습니다. 기본 쿼리로 실행합니다.');
        console.log('   📝 sql/add_cart_click_count.sql을 실행하여 컬럼을 추가해주세요.');
        
        const fallbackQuery = `
          INSERT INTO v2_execution_logs (
            keyword_id, agent, success, product_found, product_rank,
            url_rank, pages_searched, cart_clicked, error_message,
            duration_ms, proxy_used, actual_ip, final_url, search_query
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id
        `;

        const fallbackValues = [
          executionData.keywordId,
          executionData.agent,
          executionData.success,
          executionData.productFound,
          executionData.productRank,
          executionData.urlRank,
          executionData.pagesSearched,
          executionData.cartClicked,
          executionData.errorMessage,
          executionData.durationMs,
          executionData.proxyUsed,
          executionData.actualIp,
          executionData.finalUrl,
          executionData.searchQuery
        ];

        const result = await this.query(fallbackQuery, fallbackValues);
        return result.rows[0].id;
      }
      
      // 다른 오류는 그대로 던지기
      throw error;
    }
  }

  async getKeywordStats() {
    const query = `
      SELECT 
        k.id,
        k.keyword,
        k.suffix,
        k.product_code,
        k.agent,
        k.current_executions,
        k.max_executions,
        k.success_count,
        k.fail_count,
        CASE 
          WHEN (k.success_count + k.fail_count) > 0 
          THEN ROUND((k.success_count::NUMERIC / (k.success_count + k.fail_count)) * 100, 2)
          ELSE 0 
        END as success_rate,
        k.last_executed_at
      FROM v2_test_keywords k
      ORDER BY k.id
    `;

    const result = await this.query(query);
    return result.rows;
  }
}

// 싱글톤 인스턴스
const dbService = new DBService();

module.exports = dbService;