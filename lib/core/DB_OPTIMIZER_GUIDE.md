# DB 기반 동적 최적화 시스템 가이드

## 개요

기존 `optimizer.js`의 하드코딩된 설정을 DB 기반으로 동적 변경 가능하도록 개선한 시스템입니다. 패턴 탐지 분석을 위해 다양한 설정을 실시간으로 테스트할 수 있습니다.

## 파일 구조

```
lib/core/
├── optimizer.js          # 기존 하드코딩 최적화 (백업용)
├── optimizer_db.js       # 새로운 DB 기반 동적 최적화
└── DB_OPTIMIZER_GUIDE.md # 이 문서
```

## DB 테이블 구조

### v1_agent_config 테이블

```sql
CREATE TABLE v1_agent_config (
    id SERIAL PRIMARY KEY,
    agent VARCHAR(50) UNIQUE NOT NULL,
    
    -- 도메인별 허용 설정 (JSON 문자열 또는 NULL)
    coupang_main_allow TEXT,           -- www.coupang.com
    mercury_allow TEXT,                -- mercury.coupang.com
    ljc_allow TEXT,                    -- ljc.coupang.com
    assets_cdn_allow TEXT,             -- assets.coupangcdn.com
    front_cdn_allow TEXT,              -- front.coupangcdn.com
    image_cdn_allow TEXT,              -- image*.coupangcdn.com
    static_cdn_allow TEXT,             -- static.coupangcdn.com
    img1a_cdn_allow TEXT,              -- img1a.coupangcdn.com
    thumbnail_cdn_allow TEXT,          -- thumbnail*.coupangcdn.com
    
    -- 차단 패턴
    coupang_main_block_patterns TEXT,  -- www.coupang.com blockPatterns
    
    -- 실험 관리
    test_name VARCHAR(100),
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## 설정 값 형식

### allow 설정 (JSON 문자열)
- `null`: 기본값 사용
- `'["*"]'`: 모든 리소스 허용
- `'["document"]'`: document만 허용
- `'["document", "xhr", "fetch"]'`: 특정 타입들만 허용
- `'[]'`: 모든 리소스 차단

### blockPatterns 설정 (JSON 문자열)
- `null`: 패턴 차단 없음
- `'["/9U6eUwCw/", "/akam/"]'`: 특정 URL 패턴 차단

## 현재 실험 그룹

### 그룹 1: minimal_document_only (win11, u24)
```sql
coupang_main_allow = '["document"]'
```
- 최소 리소스만 허용하여 패턴 탐지 최소화 테스트

### 그룹 2: document_api_allowed (u22, r10)
```sql
coupang_main_allow = '["document", "xhr", "fetch"]'
```
- 기존 하드코딩 설정과 동일한 기본 테스트

### 그룹 3: full_allow_test (vm, local)
```sql
coupang_main_allow = '["*"]'
front_cdn_allow = '["script", "stylesheet"]'
```
- 최대 허용 테스트

## 사용법

### 1. 데이터베이스 설정

```bash
# SQL 파일 실행
psql -h mkt.techb.kr -U svc_mkt -d mkt -f sql/create_agent_config.sql
```

### 2. 실시간 설정 변경

```sql
-- 특정 에이전트 설정 변경
UPDATE v1_agent_config 
SET coupang_main_allow = '["*"]',
    test_name = 'full_allow_test',
    notes = '모든 리소스 허용 테스트',
    updated_at = NOW()
WHERE agent = 'win11';

-- 추가 CDN 허용 테스트
UPDATE v1_agent_config 
SET front_cdn_allow = '["*"]',
    updated_at = NOW()
WHERE agent = 'local';

-- blockPatterns 테스트
UPDATE v1_agent_config 
SET coupang_main_allow = '["document", "xhr", "fetch"]',
    coupang_main_block_patterns = '["/9U6eUwCw/", "/akam/"]',
    test_name = 'block_patterns_test',
    updated_at = NOW()
WHERE agent = 'u24';
```

### 3. 설정 확인

```sql
-- 전체 에이전트 설정 현황
SELECT 
    agent,
    test_name,
    coupang_main_allow,
    front_cdn_allow,
    notes
FROM v1_agent_config 
ORDER BY agent;
```

## 분석 쿼리

### 성능 분석
```sql
-- 테스트 그룹별 성공률 (최근 1시간)
SELECT 
    ac.test_name,
    COUNT(DISTINCT ac.agent) as 에이전트수,
    COUNT(el.id) as 총실행,
    SUM(CASE WHEN el.success THEN 1 ELSE 0 END) as 성공,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '1 hour'
GROUP BY ac.test_name
ORDER BY 성공률 DESC;
```

### 설정별 비교
```sql
-- coupang_main_allow 설정별 성공률
SELECT 
    COALESCE(coupang_main_allow, 'DEFAULT') as 설정,
    COUNT(el.id) as 실행수,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '1 hour'
GROUP BY ac.coupang_main_allow
ORDER BY 성공률 DESC;
```

## 코드 적용

### search-executor.js 수정됨
```javascript
// 기존
const { applyAggressiveOptimization } = require('./optimizer');

// 변경됨
const { applyDynamicOptimization } = require('./optimizer_db');

// 사용
disableOptimization = await applyDynamicOptimization(page, keywordData.agent);
```

### 키워드별 search 모드 적용
- v1_keywords 테이블의 `search` 컬럼으로 키워드별 개별 제어
- 에이전트 단위가 아닌 키워드 단위로 정밀한 설정 가능

## 로그 출력 예시

```
🔧 [OptimizerDB] 에이전트 win11 설정 로드 완료 (minimal_document_only)
🎯 테스트 설정: minimal_document_only
📝 www.coupang.com: ["document"]
📝 front CDN: DEFAULT
📋 실행 조건:
   검색 모드: ✅ (keyword DB)
✅ 허용: www.coupang.com | document | /search
🚫 차단: front.coupangcdn.com | script | /js/main.js
📊 DB 기반 최적화 완료: 허용 25개, 차단 150개 (85.7%)
```

## 복원 방법

원래 시스템으로 되돌리려면:

1. `search-executor.js` 수정:
```javascript
// 되돌리기
const { applyAggressiveOptimization } = require('./optimizer');
disableOptimization = await applyAggressiveOptimization(page);
```

2. `optimizer_db.js` 파일 삭제 또는 백업

## 주의사항

1. **DB 연결 실패 시**: 자동으로 기본 하드코딩 설정 사용
2. **JSON 파싱 오류 시**: 오류 로그 출력 후 기본값 사용  
3. **NULL 값**: 모든 NULL 값은 기본 하드코딩 설정과 동일하게 동작
4. **캐시**: 설정 변경 후 새로운 실행에서 적용됨 (재시작 불필요)
5. **Search 모드**: v1_keywords.search 컬럼에서만 관리됨 (키워드별 개별 설정)

## 실험 워크플로우

1. **기준선 설정**: 모든 에이전트를 기본값(NULL)으로 설정
2. **그룹별 테스트**: 3개 그룹으로 나누어 다른 설정 적용
3. **성능 모니터링**: 1시간 단위로 성공률 분석
4. **설정 조정**: 성공률이 낮은 그룹의 설정 변경
5. **패턴 분석**: 어떤 설정이 패턴 탐지를 피하는지 확인
6. **최적화**: 가장 성공률이 높은 설정을 전체 적용

이 시스템을 통해 쿠팡의 패턴 탐지를 우회하는 최적의 설정을 체계적으로 찾을 수 있습니다.