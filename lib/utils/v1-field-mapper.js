/**
 * v1 테이블 필드를 v2 호환 필드로 매핑
 * 기존 코드가 v2 필드명을 사용하므로 호환성을 위한 매퍼
 */

/**
 * v1_keywords 테이블 데이터를 v2 호환 형식으로 변환
 */
function mapV1KeywordToV2(v1Keyword) {
  if (!v1Keyword) return null;
  
  return {
    // 동일한 필드
    id: v1Keyword.id,
    date: v1Keyword.date,
    agent: v1Keyword.agent,
    
    // 이름 변경된 필드
    keyword: v1Keyword.keyword,  // suffix가 이미 통합됨
    suffix: '',                   // v1에서는 keyword에 통합됨
    product_code: v1Keyword.code,
    proxy_server: v1Keyword.proxy,
    
    // boolean 반전 필드
    cart_click_enabled: v1Keyword.cart,
    clear_session: !v1Keyword.session,     // 반전
    clear_cache: !v1Keyword.cache,         // 반전
    use_persistent: v1Keyword.userdata,
    gpu_disabled: !v1Keyword.gpu,          // 반전
    optimize: v1Keyword.optimize,
    search: v1Keyword.search,               // 새로 추가된 search 컬럼
    
    // 실행 통계
    current_executions: v1Keyword.runs,
    max_executions: v1Keyword.max_runs,
    success_count: v1Keyword.succ,
    fail_count: v1Keyword.fail,
    last_executed_at: v1Keyword.last_run,
    created_at: v1Keyword.created
  };
}

/**
 * 배열 매핑
 */
function mapV1KeywordsToV2(v1Keywords) {
  return v1Keywords.map(mapV1KeywordToV2);
}

module.exports = {
  mapV1KeywordToV2,
  mapV1KeywordsToV2
};