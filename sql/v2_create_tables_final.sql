-- V2 테이블 생성 스크립트 (최종 버전)
-- Chrome 전용 쿠팡 자동화 프로젝트
-- 
-- 변경사항:
-- 1. userdata=true, session=false, cache=true 가 기본 정책
-- 2. optimize 관련 설정을 v2_keywords 테이블에 직접 포함
-- 3. 도메인별 allow/block 설정을 JSON으로 저장

-- 기존 테이블 삭제 (있는 경우)
DROP TABLE IF EXISTS v2_execution_logs CASCADE;
DROP TABLE IF EXISTS v2_error_logs CASCADE;
DROP TABLE IF EXISTS v2_test_keywords CASCADE;

-- v2_test_keywords 테이블 (optimize 설정 포함)
CREATE TABLE v2_test_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword VARCHAR(100) NOT NULL,
    suffix VARCHAR(100),
    product_code VARCHAR(20) NOT NULL,
    agent VARCHAR(50),
    profile_name VARCHAR(50),
    proxy_server VARCHAR(255),
    ip_change_mode VARCHAR(20) DEFAULT 'none' CHECK (ip_change_mode IN ('none', 'always', 'on_block')),
    cart_click_enabled BOOLEAN DEFAULT false,
    gpu_disabled BOOLEAN DEFAULT false,
    
    -- 최적화 설정 (v1_agent_config 통합 - 도메인별 allow 설정)
    -- NULL = 하드코딩된 기본값 사용, 값이 있으면 해당 설정 적용
    -- 도메인별 allow 설정 (JSON 문자열)
    coupang_main_allow TEXT,           -- www.coupang.com ["document", "xhr", "fetch"]
    mercury_allow TEXT,                -- mercury.coupang.com  
    ljc_allow TEXT,                    -- ljc.coupang.com
    assets_cdn_allow TEXT,             -- assets.coupangcdn.com
    front_cdn_allow TEXT,              -- front.coupangcdn.com
    image_cdn_allow TEXT,              -- image*.coupangcdn.com
    static_cdn_allow TEXT,             -- static.coupangcdn.com
    img1a_cdn_allow TEXT,              -- img1a.coupangcdn.com
    thumbnail_cdn_allow TEXT,          -- thumbnail*.coupangcdn.com
    
    -- blockPatterns (JSON 배열 문자열 또는 NULL)
    coupang_main_block_patterns TEXT,  -- www.coupang.com blockPatterns
    
    -- 실행 통계
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
    
    -- 메모
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- v2_execution_logs 테이블
CREATE TABLE v2_execution_logs (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    product_found BOOLEAN,
    product_rank INTEGER,
    url_rank INTEGER,
    real_rank INTEGER,
    item_id BIGINT,
    vendor_item_id BIGINT,
    pages_searched INTEGER,
    cart_clicked BOOLEAN DEFAULT false,
    cart_click_count INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    final_url TEXT,
    search_query VARCHAR(200),
    
    -- 검색 모드 관련
    search_mode VARCHAR(20),
    search_mode_reason VARCHAR(50),
    is_blocked BOOLEAN DEFAULT false,
    
    -- 최적화 관련
    optimize_level VARCHAR(20),
    optimize_config_applied TEXT,  -- 실제 적용된 도메인 규칙 (JSON)
    
    -- 네트워크 메트릭
    traffic_mb NUMERIC(10, 2),
    cached_mb NUMERIC(10, 2),
    blocked_requests INTEGER,
    allowed_requests INTEGER
);

-- v2_error_logs 테이블
CREATE TABLE v2_error_logs (
    id SERIAL PRIMARY KEY,
    browser VARCHAR(20) DEFAULT 'chrome',
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    page_url TEXT,
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50)
);

-- 인덱스 생성
CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date);
CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent);
CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code);
CREATE INDEX idx_v2_keywords_optimize ON v2_test_keywords(optimize_level);
CREATE INDEX idx_v2_keywords_executions ON v2_test_keywords(current_executions, max_executions);

CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
CREATE INDEX idx_v2_exec_date ON v2_execution_logs(executed_at);
CREATE INDEX idx_v2_exec_success ON v2_execution_logs(success);
CREATE INDEX idx_v2_exec_agent ON v2_execution_logs(agent);
CREATE INDEX idx_v2_exec_blocked ON v2_execution_logs(is_blocked);
CREATE INDEX idx_v2_exec_search_mode ON v2_execution_logs(search_mode);

CREATE INDEX idx_v2_error_date ON v2_error_logs(occurred_at);
CREATE INDEX idx_v2_error_keyword ON v2_error_logs(keyword_id);
CREATE INDEX idx_v2_error_code ON v2_error_logs(error_code);
CREATE INDEX idx_v2_error_agent ON v2_error_logs(agent);

-- 코멘트 추가
COMMENT ON TABLE v2_test_keywords IS 'V2 키워드 테이블 - optimize 설정 통합 (기본 정책: userdata=true, session=false, cache=true)';
COMMENT ON COLUMN v2_test_keywords.optimize_level IS '최적화 레벨 - minimal/balanced/maximum/custom';
COMMENT ON COLUMN v2_test_keywords.coupang_main_allow IS 'www.coupang.com 허용 리소스 타입 (JSON 배열) - NULL이면 기본값';
COMMENT ON COLUMN v2_test_keywords.search_mode IS '검색 모드 - goto(URL직접), search(검색창), auto(자동전환)';

COMMENT ON TABLE v2_execution_logs IS 'V2 실행 로그 - 적용된 최적화 설정 포함';
COMMENT ON COLUMN v2_execution_logs.optimize_config_applied IS '실행 시 적용된 실제 도메인 규칙 (JSON)';

-- 샘플 데이터 입력 (다양한 최적화 설정)
INSERT INTO v2_test_keywords (keyword, suffix, product_code, agent, optimize_level, coupang_main_allow, notes) 
VALUES 
    -- 기본 설정 (NULL = 하드코딩 기본값)
    ('노트북', NULL, '76174145', 'default', 'balanced', NULL, '기본 최적화 설정'),
    
    -- 최소 리소스 테스트
    ('노트북', '게이밍', '87654321', 'win11', 'custom', '["document"]', 'document만 허용 - 최소 리소스'),
    
    -- API 포함 테스트  
    ('노트북', '업무용', '12345678', 'u24', 'custom', '["document", "xhr", "fetch"]', 'API 요청 포함'),
    
    -- 전체 허용 테스트
    ('맥북', 'M2', '11111111', 'vm', 'custom', '["*"]', '모든 리소스 허용'),
    
    -- CDN 설정 포함
    ('아이패드', '프로', '22222222', 'local', 'custom', '["document", "xhr", "fetch"]', 'CDN script/css 허용');

-- 마지막 샘플의 CDN 설정 추가
UPDATE v2_test_keywords 
SET front_cdn_allow = '["script", "stylesheet"]',
    static_cdn_allow = '["script"]'
WHERE product_code = '22222222';

-- 통계 뷰 생성
CREATE OR REPLACE VIEW v2_keyword_stats AS
SELECT 
    k.id,
    k.keyword,
    k.suffix,
    k.product_code,
    k.agent,
    k.optimize_level,
    CASE 
        WHEN k.optimize_level = 'custom' THEN 
            COALESCE(k.coupang_main_allow, 'default')
        ELSE k.optimize_level
    END as optimize_detail,
    k.search_mode,
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
ORDER BY k.id;

-- 최적화 설정별 성능 뷰
CREATE OR REPLACE VIEW v2_optimize_performance AS
SELECT 
    COALESCE(k.optimize_level, 'default') as optimize_level,
    CASE 
        WHEN k.coupang_main_allow IS NOT NULL THEN k.coupang_main_allow
        ELSE 'default'
    END as main_allow_config,
    COUNT(DISTINCT e.keyword_id) as keyword_count,
    COUNT(e.id) as total_executions,
    COUNT(CASE WHEN e.success = true THEN 1 END) as success_count,
    COUNT(CASE WHEN e.is_blocked = true THEN 1 END) as blocked_count,
    ROUND(AVG(e.duration_ms), 0) as avg_duration_ms,
    ROUND(AVG(e.traffic_mb), 2) as avg_traffic_mb,
    ROUND(AVG(e.blocked_requests), 0) as avg_blocked_requests,
    ROUND(AVG(e.allowed_requests), 0) as avg_allowed_requests
FROM v2_execution_logs e
JOIN v2_test_keywords k ON e.keyword_id = k.id
WHERE e.executed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY k.optimize_level, k.coupang_main_allow
ORDER BY total_executions DESC;

-- 도메인별 리소스 차단 효과 분석 뷰
CREATE OR REPLACE VIEW v2_domain_block_analysis AS
SELECT 
    k.agent,
    CASE 
        WHEN k.coupang_main_allow = '["document"]' THEN 'document_only'
        WHEN k.coupang_main_allow = '["document", "xhr", "fetch"]' THEN 'with_api'
        WHEN k.coupang_main_allow = '["*"]' THEN 'allow_all'
        ELSE 'default'
    END as main_config_type,
    COUNT(*) as execution_count,
    ROUND(AVG(e.traffic_mb), 2) as avg_traffic_mb,
    ROUND(AVG(e.blocked_requests), 0) as avg_blocked,
    ROUND(COUNT(CASE WHEN e.is_blocked = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 1) as block_rate
FROM v2_execution_logs e
JOIN v2_test_keywords k ON e.keyword_id = k.id
WHERE e.executed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY k.agent, main_config_type
ORDER BY avg_traffic_mb;