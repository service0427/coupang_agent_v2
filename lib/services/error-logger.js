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
        INSERT INTO v1_errors (
          code, message, url,
          proxy, ip, keyword_id, agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      
      const values = [
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
    const { agent = null, days = 7 } = options;
    
    let query = `
      SELECT 
        code as error_code,
        COUNT(*) as error_count,
        MAX(occurred) as last_occurred,
        COUNT(DISTINCT keyword_id) as affected_keywords
      FROM v1_errors
      WHERE occurred >= NOW() - INTERVAL '${days} days'
    `;
    
    const conditions = [];
    const params = [];
    
    if (agent) {
      conditions.push(`agent = $${params.length + 1}`);
      params.push(agent);
    }
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY code ORDER BY error_count DESC';
    
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
        k.code
      FROM v1_errors e
      LEFT JOIN v1_keywords k ON e.keyword_id = k.id
      ORDER BY e.occurred DESC
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
      SELECT * FROM v1_errors 
      WHERE keyword_id = $1
      ORDER BY occurred DESC
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