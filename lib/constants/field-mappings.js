/**
 * 필드명 통일을 위한 상수 정의
 * v1(신버전)의 간결한 이름을 기준으로 통일
 */

// 표준 필드명 (v1 기준)
const STANDARD_FIELDS = {
  // 키워드 관련
  KEYWORD: 'keyword',           // 검색어 (suffix 통합)
  CODE: 'code',                 // 상품 코드
  PROXY: 'proxy',               // 프록시 서버
  
  // 옵션 (boolean)
  CART: 'cart',                 // 장바구니 클릭 여부
  SESSION: 'session',           // 세션 유지 여부
  CACHE: 'cache',               // 캐시 유지 여부
  USERDATA: 'userdata',         // 영구 프로필 사용 여부
  GPU: 'gpu',                   // GPU 사용 여부
  OPTIMIZE: 'optimize',         // 최적화 여부
  SEARCH: 'search',             // 검색창 입력 모드 여부
  
  // 실행 통계
  RUNS: 'runs',                 // 현재 실행 횟수
  MAX_RUNS: 'max_runs',         // 최대 실행 횟수
  SUCC: 'succ',                 // 성공 횟수
  FAIL: 'fail',                 // 실패 횟수
  LAST_RUN: 'last_run',         // 마지막 실행 시간
  
  // 실행 결과
  RANK: 'rank',                 // 순위
  URL_RANK: 'url_rank',         // URL 순위
  REAL_RANK: 'real_rank',       // 실제 순위 (광고 제외)
  ITEM_ID: 'item_id',           // 상품 ID
  VENDOR_ITEM_ID: 'vendor_item_id', // 판매자 상품 ID
  TRAFFIC_MB: 'traffic_mb',     // 트래픽 사용량
  ACTUAL_IP: 'actual_ip'        // 실제 IP
};

// v2(구버전) -> v1(신버전) 필드 매핑
const V2_TO_V1_MAPPING = {
  // 이름 변경된 필드
  'product_code': STANDARD_FIELDS.CODE,
  'proxy_server': STANDARD_FIELDS.PROXY,
  'cart_click_enabled': STANDARD_FIELDS.CART,
  'use_persistent': STANDARD_FIELDS.USERDATA,
  'current_executions': STANDARD_FIELDS.RUNS,
  'max_executions': STANDARD_FIELDS.MAX_RUNS,
  'success_count': STANDARD_FIELDS.SUCC,
  'fail_count': STANDARD_FIELDS.FAIL,
  'last_executed_at': STANDARD_FIELDS.LAST_RUN,
  
  // boolean 반전 필드 (v2에서는 반대 의미)
  'clear_session': STANDARD_FIELDS.SESSION,     // v2: clear_session -> v1: !session
  'clear_cache': STANDARD_FIELDS.CACHE,         // v2: clear_cache -> v1: !cache  
  'gpu_disabled': STANDARD_FIELDS.GPU,           // v2: gpu_disabled -> v1: !gpu
  
  // 동일한 필드
  'keyword': STANDARD_FIELDS.KEYWORD,
  'optimize': STANDARD_FIELDS.OPTIMIZE,
  'search': STANDARD_FIELDS.SEARCH,
  'product_rank': STANDARD_FIELDS.RANK,
  'url_rank': STANDARD_FIELDS.URL_RANK,
  'real_rank': STANDARD_FIELDS.REAL_RANK,
  'item_id': STANDARD_FIELDS.ITEM_ID,
  'vendor_item_id': STANDARD_FIELDS.VENDOR_ITEM_ID,
  'actual_traffic_mb': STANDARD_FIELDS.TRAFFIC_MB,
  'actual_ip': STANDARD_FIELDS.ACTUAL_IP
};

// 함수 파라미터명 매핑 (코드에서 사용되는 이름들)
const PARAM_MAPPINGS = {
  // chrome-launcher.js
  'persistent': STANDARD_FIELDS.USERDATA,        // 영구 프로필 사용 여부
  'clearSession': 'clearSession',                // 내부적으로는 v2 이름 유지 (반전 로직 때문)
  'clearCache': 'clearCache',                    // 내부적으로는 v2 이름 유지 (반전 로직 때문)
  'gpuDisabled': 'gpuDisabled',                  // 내부적으로는 v2 이름 유지 (반전 로직 때문)
  
  // handlers
  'productCode': STANDARD_FIELDS.CODE,
  'cartClickEnabled': STANDARD_FIELDS.CART,
  'proxyConfig': STANDARD_FIELDS.PROXY,
  'proxyServer': STANDARD_FIELDS.PROXY,
  
  // results
  'productRank': STANDARD_FIELDS.RANK,
  'urlRank': STANDARD_FIELDS.URL_RANK,
  'realRank': STANDARD_FIELDS.REAL_RANK,
  'itemId': STANDARD_FIELDS.ITEM_ID,
  'vendorItemId': STANDARD_FIELDS.VENDOR_ITEM_ID,
  'actualTrafficMb': STANDARD_FIELDS.TRAFFIC_MB,
  'actualIp': STANDARD_FIELDS.ACTUAL_IP
};

// 필드 변환 헬퍼 함수
function standardizeFieldName(v2FieldName) {
  return V2_TO_V1_MAPPING[v2FieldName] || v2FieldName;
}

function standardizeParamName(paramName) {
  return PARAM_MAPPINGS[paramName] || paramName;
}

// boolean 반전이 필요한 필드 확인
function needsBooleanInversion(fieldName) {
  const inversionFields = ['clear_session', 'clear_cache', 'gpu_disabled'];
  return inversionFields.includes(fieldName);
}

module.exports = {
  STANDARD_FIELDS,
  V2_TO_V1_MAPPING,
  PARAM_MAPPINGS,
  standardizeFieldName,
  standardizeParamName,
  needsBooleanInversion
};