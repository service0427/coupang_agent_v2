-- v1 테이블 생성 스크립트 (간소화된 컬럼명)
-- 작성일: 2025-08-05
-- 목적: 컬럼명 간소화 및 테이블 구조 개선

-- =====================================================
-- 1. v1_keywords 테이블 (기존 v2_test_keywords)
-- =====================================================
-- 컬럼명 변경 내역:
-- cart_click_enabled → cart (장바구니 클릭 여부)
-- use_persistent → userdata (유저데이터 디렉토리 사용)
-- gpu_disabled → gpu (GPU 사용 여부, 의미 반전)
-- clear_session → session (세션 유지 여부, 의미 반전)
-- clear_cache → cache (캐시 유지 여부, 의미 반전)

DROP TABLE IF EXISTS v1_keywords CASCADE;

CREATE TABLE v1_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword VARCHAR(200) NOT NULL,    -- suffix를 통합하므로 길이 증가
    code VARCHAR(20),                 -- product_code → code (NULL 허용)
    agent VARCHAR(50) DEFAULT 'default',
    proxy VARCHAR(255),               -- proxy_server → proxy
    
    -- 실행 옵션 (간소화된 이름)
    cart BOOLEAN DEFAULT true,         -- 장바구니 클릭 활성화 (실제 DB 기본값)
    userdata BOOLEAN DEFAULT true,     -- 유저데이터 디렉토리 사용
    session BOOLEAN DEFAULT false,     -- 세션 유지 (true=유지, false=초기화)
    cache BOOLEAN DEFAULT true,        -- 캐시 유지 (true=유지, false=삭제) (실제 DB 기본값)
    gpu BOOLEAN DEFAULT false,         -- GPU 사용 (true=사용, false=비활성화) (실제 DB 기본값)
    optimize BOOLEAN DEFAULT true,     -- 트래픽 최적화 (500KB 목표) (실제 DB 기본값)
    
    -- 실행 통계
    max_runs INTEGER DEFAULT 100,      -- 최대 실행 횟수 (기존 max_executions)
    runs INTEGER DEFAULT 0,            -- 현재 실행 횟수 (기존 current_executions)
    succ INTEGER DEFAULT 0,            -- 성공 횟수 (기존 success_count)
    fail INTEGER DEFAULT 0,            -- 실패 횟수 (기존 fail_count)
    
    -- 시간 정보
    last_run TIMESTAMP,                -- 마지막 실행 시간 (기존 last_executed_at)
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. v1_executions 테이블 (기존 v2_execution_logs)
-- =====================================================
-- 컬럼 순서를 논리적으로 재정렬
-- actual_traffic_mb → traffic_mb

DROP TABLE IF EXISTS v1_executions CASCADE;

CREATE TABLE v1_executions (
    -- 기본 식별 정보
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER,                -- FK 제약조건 제거 (실제 DB 구조)
    agent VARCHAR(50),
    executed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 기존 executed_at
    
    -- 실행 결과
    success BOOLEAN NOT NULL,
    error TEXT,                        -- 기존 error_message
    duration INTEGER,                  -- 기존 duration_ms (밀리초)
    
    -- 검색 정보
    query VARCHAR(200),                -- 기존 search_query (suffix 통합)
    found BOOLEAN,                     -- 기존 product_found
    rank INTEGER,                      -- 기존 product_rank
    url_rank INTEGER,
    real_rank INTEGER,                 -- 광고 제외 실제 순위
    pages INTEGER,                     -- 기존 pages_searched
    
    -- 클릭 정보
    cart BOOLEAN DEFAULT false,        -- 기존 cart_clicked
    
    -- 네트워크 정보
    proxy VARCHAR(255),                -- 기존 proxy_used
    ip VARCHAR(50),                    -- 기존 actual_ip
    traffic NUMERIC,                   -- 기존 actual_traffic_mb (실제 DB는 NUMERIC)
    url TEXT,                          -- 기존 final_url
    
    -- URL 파싱 정보
    item_id BIGINT,                    -- URL에서 추출한 itemId
    vendor_item_id BIGINT,             -- URL에서 추출한 vendorItemId
    
    -- 실행 당시 설정값 (분석용)
    optimize BOOLEAN,                  -- 기존 optimize_enabled
    session BOOLEAN,                   -- 세션 유지 여부 (기존 clear_session 반전)
    cache BOOLEAN,                     -- 캐시 유지 여부 (기존 clear_cache 반전)
    userdata BOOLEAN,                  -- 기존 use_persistent
    gpu BOOLEAN                        -- GPU 사용 여부 (기존 gpu_disabled 반전)
);

-- =====================================================
-- 3. v1_errors 테이블 (기존 v2_error_logs)
-- =====================================================
DROP TABLE IF EXISTS v1_errors CASCADE;

CREATE TABLE v1_errors (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100),                 -- 기존 error_code
    message TEXT NOT NULL,             -- 기존 error_message
    occurred TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 기존 occurred_at
    url TEXT,                          -- 기존 page_url
    proxy VARCHAR(255),                -- 기존 proxy_used
    ip VARCHAR(50),                    -- 기존 actual_ip
    keyword_id INTEGER,                -- FK 제약조건 제거 (실제 DB 구조)
    agent VARCHAR(50)
);

-- =====================================================
-- 인덱스 생성
-- =====================================================
-- v1_keywords 인덱스
CREATE INDEX idx_v1_keywords_date ON v1_keywords(date);
CREATE INDEX idx_v1_keywords_agent ON v1_keywords(agent);
CREATE INDEX idx_v1_keywords_code ON v1_keywords(code);  -- product_code → code
CREATE INDEX idx_v1_keywords_runs ON v1_keywords(runs, max_runs);

-- v1_executions 인덱스
CREATE INDEX idx_v1_exec_keyword ON v1_executions(keyword_id);
CREATE INDEX idx_v1_exec_date ON v1_executions(executed);
CREATE INDEX idx_v1_exec_success ON v1_executions(success);
CREATE INDEX idx_v1_exec_agent ON v1_executions(agent);
CREATE INDEX idx_v1_exec_traffic ON v1_executions(traffic);

-- v1_errors 인덱스
CREATE INDEX idx_v1_error_date ON v1_errors(occurred);
CREATE INDEX idx_v1_error_keyword ON v1_errors(keyword_id);
CREATE INDEX idx_v1_error_code ON v1_errors(code);
CREATE INDEX idx_v1_error_agent ON v1_errors(agent);

-- =====================================================
-- 통계 뷰 생성
-- =====================================================
CREATE OR REPLACE VIEW v1_keyword_stats AS
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
ORDER BY k.id;

CREATE OR REPLACE VIEW v1_execution_stats AS
SELECT 
    DATE(executed) as date,
    agent,
    COUNT(*) as total_runs,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as fail_count,
    ROUND(AVG(duration)/1000.0, 2) as avg_duration_sec,
    SUM(CASE WHEN cart THEN 1 ELSE 0 END) as cart_clicks,
    ROUND(AVG(traffic), 2) as avg_traffic_mb,
    SUM(traffic) as total_traffic_mb
FROM v1_executions
GROUP BY DATE(executed), agent
ORDER BY date DESC, agent;

CREATE OR REPLACE VIEW v1_error_summary AS
SELECT 
    code as error_code,
    COUNT(*) as error_count,
    MAX(occurred) as last_occurred,
    COUNT(DISTINCT keyword_id) as affected_keywords
FROM v1_errors
GROUP BY code
ORDER BY error_count DESC;

-- =====================================================
-- 코멘트 추가
-- =====================================================
COMMENT ON TABLE v1_keywords IS '검색 키워드 및 실행 설정 (간소화된 컬럼명)';
COMMENT ON COLUMN v1_keywords.cart IS '장바구니 클릭 활성화 (기존 cart_click_enabled)';
COMMENT ON COLUMN v1_keywords.userdata IS '유저데이터 디렉토리 사용 (기존 use_persistent)';
COMMENT ON COLUMN v1_keywords.session IS '세션 유지 여부 - true=유지, false=초기화 (기존 clear_session 반전)';
COMMENT ON COLUMN v1_keywords.cache IS '캐시 유지 여부 - true=유지, false=삭제 (기존 clear_cache 반전)';
COMMENT ON COLUMN v1_keywords.gpu IS 'GPU 사용 여부 - true=사용, false=비활성화 (기존 gpu_disabled 반전)';
COMMENT ON COLUMN v1_keywords.optimize IS '트래픽 최적화 활성화 (500KB 목표)';

COMMENT ON TABLE v1_executions IS '실행 로그 (재정렬된 컬럼 순서)';
COMMENT ON COLUMN v1_executions.traffic IS '실제 네트워크 사용량 MB (캐시 제외)';
COMMENT ON COLUMN v1_executions.duration IS '작업 실행 시간 (밀리초 단위)';

COMMENT ON TABLE v1_errors IS '에러 로그';