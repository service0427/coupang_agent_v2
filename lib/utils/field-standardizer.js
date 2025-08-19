/**
 * 필드명 표준화 유틸리티
 * v1과 v2 간의 필드명을 통일하여 사용
 */

const { STANDARD_FIELDS, needsBooleanInversion } = require('../constants/field-mappings');

/**
 * 키워드 데이터 표준화
 * DB에서 가져온 데이터를 표준 필드명으로 변환
 */
function standardizeKeywordData(data, fromVersion = 'v2') {
  if (!data) return null;
  
  if (fromVersion === 'v1') {
    // v1은 이미 표준이므로 그대로 반환
    return { ...data };
  }
  
  // v2 -> 표준(v1) 변환
  return {
    // 기본 정보
    id: data.id,
    keyword: data.keyword + (data.suffix ? ` ${data.suffix}` : ''),
    code: data.product_code,
    proxy: data.proxy_server,
    date: data.date,
    
    // 옵션 (boolean 반전 처리)
    cart: data.cart_click_enabled,
    session: !data.clear_session,      // 반전
    userdata: data.use_persistent,
    gpu: !data.gpu_disabled,           // 반전
    optimize: data.optimize,
    
    // 실행 통계
    runs: data.current_executions,
    max_runs: data.max_executions,
    succ: data.success_count,
    fail: data.fail_count,
    last_run: data.last_executed_at,
    created: data.created_at
  };
}

/**
 * 실행 결과 표준화
 */
function standardizeExecutionResult(result) {
  if (!result) return null;
  
  return {
    success: result.success,
    productFound: result.productFound || result.product_found,
    
    // 순위 정보
    rank: result.productRank || result.product_rank || result.rank,
    urlRank: result.urlRank || result.url_rank,
    realRank: result.realRank || result.real_rank,
    
    // 상품 정보
    itemId: result.itemId || result.item_id,
    vendorItemId: result.vendorItemId || result.vendor_item_id,
    
    // 기타 정보
    pagesSearched: result.pagesSearched || result.pages_searched,
    cartClicked: result.cartClicked || result.cart_clicked,
    errorMessage: result.errorMessage || result.error_message,
    durationMs: result.durationMs || result.duration_ms,
    trafficMb: result.actualTrafficMb || result.actual_traffic_mb || result.traffic_mb,
    actualIp: result.actualIp || result.actual_ip
  };
}

/**
 * Chrome 실행 옵션 표준화
 */
function standardizeLaunchOptions(options) {
  if (!options) return {};
  
  // v1 스타일 옵션을 chrome-launcher가 이해하는 형식으로 변환
  return {
    proxy: options.proxy || options.proxyServer || options.proxy_server,
    persistent: options.userdata !== undefined ? options.userdata : options.use_persistent !== false,
    profileName: options.profileName || options.profile_name || 'default',
    clearSession: true, // 항상 세션 정리
    useTracker: options.tracker || options.useTracker || false,
    gpuDisabled: options.gpu !== undefined ? !options.gpu : options.gpu_disabled === true,
    windowPosition: options.windowPosition || options.window_position,
    trafficMonitor: options.trafficMonitor || options.traffic_monitor || false
  };
}

/**
 * 검색 옵션 표준화
 */
function standardizeSearchOptions(options) {
  if (!options) return {};
  
  return {
    keyword: options.keyword,
    suffix: options.suffix || '',
    productCode: options.code || options.productCode || options.product_code,
    cartClickEnabled: options.cart !== undefined ? options.cart : options.cartClickEnabled || options.cart_click_enabled,
    maxPages: options.maxPages || options.max_pages || 15,
    searchMode: options.searchMode || options.search_mode || false,
    optimizationLevel: options.optimize ? 'balanced' : false,
    
    // 추가 옵션
    keywordId: options.keywordId || options.keyword_id || options.id,
    checkCookies: options.checkCookies || options.check_cookies || false,
    monitor: options.monitor || false,
    networkMonitor: options.networkMonitor || options.network_monitor
  };
}

/**
 * DB 저장용 데이터 변환 (표준 -> v2)
 * 기존 코드 호환성을 위해 v2 형식으로 변환
 */
function convertToV2Format(standardData) {
  if (!standardData) return null;
  
  return {
    // 기본 정보
    id: standardData.id,
    keyword: standardData.keyword,
    product_code: standardData.code,
    proxy_server: standardData.proxy,
    
    // 옵션 (boolean 반전)
    cart_click_enabled: standardData.cart,
    clear_session: !standardData.session,
    use_persistent: standardData.userdata,
    gpu_disabled: !standardData.gpu,
    optimize: standardData.optimize,
    
    // 실행 통계
    current_executions: standardData.runs,
    max_executions: standardData.max_runs,
    success_count: standardData.succ,
    fail_count: standardData.fail,
    last_executed_at: standardData.last_run
  };
}

module.exports = {
  standardizeKeywordData,
  standardizeExecutionResult,
  standardizeLaunchOptions,
  standardizeSearchOptions,
  convertToV2Format
};