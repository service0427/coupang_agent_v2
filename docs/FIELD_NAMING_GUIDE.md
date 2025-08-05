# 필드명 통일 가이드

## 개요
v1(신버전)과 v2(구버전) 간의 필드명을 통일하여 코드 일관성을 높이고 유지보수를 용이하게 합니다.

## 표준 필드명 (v1 기준)

### 기본 정보
| 표준명 | v2(구버전) | 설명 |
|--------|------------|------|
| `keyword` | keyword + suffix | 검색어 (suffix 통합) |
| `code` | product_code | 상품 코드 |
| `proxy` | proxy_server | 프록시 서버 |

### Boolean 옵션
| 표준명 | v2(구버전) | 의미 | 변환 규칙 |
|--------|------------|------|-----------|
| `cart` | cart_click_enabled | 장바구니 클릭 여부 | 동일 |
| `session` | clear_session | 세션 유지 여부 | **반전** (v2: !session) |
| `cache` | clear_cache | 캐시 유지 여부 | **반전** (v2: !cache) |
| `userdata` | use_persistent | 영구 프로필 사용 | 동일 |
| `gpu` | gpu_disabled | GPU 사용 여부 | **반전** (v2: !gpu) |
| `optimize` | optimize | 최적화 사용 | 동일 |

### 실행 통계
| 표준명 | v2(구버전) | 설명 |
|--------|------------|------|
| `runs` | current_executions | 현재 실행 횟수 |
| `max_runs` | max_executions | 최대 실행 횟수 |
| `succ` | success_count | 성공 횟수 |
| `fail` | fail_count | 실패 횟수 |
| `last_run` | last_executed_at | 마지막 실행 시간 |

### 실행 결과
| 표준명 | v2(구버전) | 설명 |
|--------|------------|------|
| `rank` | product_rank | 상품 순위 |
| `url_rank` | url_rank | URL 순위 |
| `real_rank` | real_rank | 실제 순위 (광고 제외) |
| `item_id` | item_id | 상품 ID |
| `vendor_item_id` | vendor_item_id | 판매자 상품 ID |
| `traffic_mb` | actual_traffic_mb | 트래픽 사용량 |
| `actual_ip` | actual_ip | 실제 IP |

## 코드 내 변수명 통일

### chrome-launcher.js
```javascript
// 기존 (v2 스타일)
async function launchChrome(proxy, persistent, profileName, clearSession, clearCache, ...)

// 권장 (표준화)
async function launchChrome(proxy, userdata, profileName, clearSession, clearCache, ...)
// 내부적으로는 clearSession/clearCache 유지 (반전 로직 처리를 위해)
```

### 핸들러 및 서비스
```javascript
// 기존 (v2 스타일)
{
  productCode: 'ABC123',
  cartClickEnabled: true,
  usePersistent: true
}

// 권장 (표준화)
{
  code: 'ABC123',
  cart: true,
  userdata: true
}
```

## 사용 예시

### 1. 표준화 유틸리티 사용
```javascript
const { standardizeKeywordData, standardizeSearchOptions } = require('./utils/field-standardizer');

// DB에서 가져온 v2 데이터를 표준화
const v2Data = await dbService.getNextKeyword();
const standardData = standardizeKeywordData(v2Data, 'v2');

// 검색 옵션 표준화
const searchOptions = standardizeSearchOptions({
  keyword: standardData.keyword,
  code: standardData.code,
  cart: standardData.cart
});
```

### 2. Chrome 실행 옵션
```javascript
const { standardizeLaunchOptions } = require('./utils/field-standardizer');

// v1 스타일 옵션
const v1Options = {
  proxy: 'http://proxy.com',
  userdata: true,
  session: true,    // 세션 유지
  cache: false,     // 캐시 삭제
  gpu: true         // GPU 사용
};

// chrome-launcher에 전달할 옵션으로 변환
const launchOptions = standardizeLaunchOptions(v1Options);
// 결과: { persistent: true, clearSession: false, clearCache: true, gpuDisabled: false }
```

### 3. 실행 결과 표준화
```javascript
const { standardizeExecutionResult } = require('./utils/field-standardizer');

// 다양한 형식의 결과를 표준화
const result = standardizeExecutionResult({
  productRank: 5,
  actualTrafficMb: 2.5,
  actualIp: '1.2.3.4'
});
// 결과: { rank: 5, trafficMb: 2.5, actualIp: '1.2.3.4' }
```

## 마이그레이션 가이드

### 1단계: 새 코드에서 표준 필드명 사용
- 새로 작성하는 코드는 v1 표준 필드명 사용
- field-standardizer 유틸리티 활용

### 2단계: 기존 코드 점진적 수정
- DB 접근 부분에 standardize 함수 적용
- 외부 인터페이스는 유지하면서 내부적으로 표준화

### 3단계: 전체 통일
- 모든 코드가 표준 필드명 사용
- v2 호환 레이어 제거

## 주의사항

### Boolean 반전 필드
다음 필드들은 v1과 v2에서 의미가 반대입니다:
- `session` ↔ `clear_session`
- `cache` ↔ `clear_cache`  
- `gpu` ↔ `gpu_disabled`

### 내부 로직 유지
- chrome-launcher 등 핵심 모듈은 기존 로직 유지
- 표준화 레이어를 통해 변환하여 사용

### 점진적 적용
- 한 번에 모든 코드를 바꾸지 않음
- 표준화 유틸리티를 통한 점진적 마이그레이션