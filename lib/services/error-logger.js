const dbService = require('./db-service');

/**
 * 에러 코드 추출 함수
 */
function extractErrorCode(error) {
  if (!error) return null;
  
  const message = error.message || error.toString();
  
  // 일반적인 에러 코드 패턴
  const patterns = [
    /ERR_[A-Z0-9_]+/,           // ERR_HTTP2_PROTOCOL_ERROR
    /NS_ERROR_[A-Z0-9_]+/,      // NS_ERROR_FAILURE
    /net::[A-Z0-9_]+/,          // net::ERR_FAILED
    /[A-Z]+_ERROR/,             // PROTOCOL_ERROR
    /Error:\s*([A-Z0-9_]+)/,    // Error: TIMEOUT
    /code:\s*['"]?([A-Z0-9_]+)/i, // code: 'ECONNRESET'
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  // 특정 에러 메시지에서 코드 추출
  if (message.includes('Stream error')) return 'STREAM_ERROR';
  if (message.includes('Protocol error')) return 'PROTOCOL_ERROR';
  if (message.includes('Timeout')) return 'TIMEOUT_ERROR';
  if (message.includes('Navigation')) return 'NAVIGATION_ERROR';
  if (message.includes('Execution context was destroyed')) return 'CONTEXT_DESTROYED';
  if (message.includes('Target crashed')) return 'TARGET_CRASHED';
  
  return null;
}

/**
 * 에러 로깅 서비스
 */
class ErrorLogger {
  /**
   * 에러 로그 저장
   */
  async logError(errorData) {
    try {
      const {
        browser = 'chrome',
        errorCode = null,
        errorMessage,
        pageUrl = null,
        proxyUsed = null,
        actualIp = null,
        keywordId = null,
        agent = null,
        requireErrorCode = true
      } = errorData;
      
      // 에러 코드 추출 시도
      const extractedCode = errorCode || extractErrorCode({ message: errorMessage });
      
      // requireErrorCode가 true이고 에러 코드가 없으면 저장하지 않음
      if (requireErrorCode && !extractedCode) {
        return null;
      }
      
      const query = `
        INSERT INTO v2_error_logs (
          browser, error_code, error_message, page_url,
          proxy_used, actual_ip, keyword_id, agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;
      
      const values = [
        browser,
        extractedCode,
        errorMessage,
        pageUrl,
        proxyUsed,
        actualIp,
        keywordId,
        agent
      ];
      
      const result = await dbService.query(query, values);
      console.log(`📝 에러 로그 저장됨 (ID: ${result.rows[0].id})`);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('❌ 에러 로그 저장 실패:', error.message);
      return null;
    }
  }
  
  /**
   * 에러 통계 조회
   */
  async getErrorStats(options = {}) {
    const { agent = null, browser = null, days = 7 } = options;
    
    let query = `
      SELECT 
        error_code,
        browser,
        COUNT(*) as error_count,
        MAX(occurred_at) as last_occurred,
        COUNT(DISTINCT keyword_id) as affected_keywords
      FROM v2_error_logs
      WHERE occurred_at >= NOW() - INTERVAL '${days} days'
    `;
    
    const conditions = [];
    const params = [];
    
    if (agent) {
      conditions.push(`agent = $${params.length + 1}`);
      params.push(agent);
    }
    
    if (browser) {
      conditions.push(`browser = $${params.length + 1}`);
      params.push(browser);
    }
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY error_code, browser ORDER BY error_count DESC';
    
    const result = await dbService.query(query, params);
    return result.rows;
  }
  
  /**
   * 최근 에러 조회
   */
  async getRecentErrors(limit = 10) {
    const query = `
      SELECT 
        e.*,
        k.keyword,
        k.suffix,
        k.product_code
      FROM v2_error_logs e
      LEFT JOIN v2_test_keywords k ON e.keyword_id = k.id
      ORDER BY e.occurred_at DESC
      LIMIT $1
    `;
    
    const result = await dbService.query(query, [limit]);
    return result.rows;
  }
  
  /**
   * 특정 키워드의 에러 조회
   */
  async getKeywordErrors(keywordId) {
    const query = `
      SELECT * FROM v2_error_logs 
      WHERE keyword_id = $1
      ORDER BY occurred_at DESC
    `;
    
    const result = await dbService.query(query, [keywordId]);
    return result.rows;
  }
  
  // extractErrorCode 함수도 외부에서 사용할 수 있도록 노출
  extractErrorCode(error) {
    return extractErrorCode(error);
  }
}

// 싱글톤 인스턴스
const errorLogger = new ErrorLogger();

module.exports = errorLogger;