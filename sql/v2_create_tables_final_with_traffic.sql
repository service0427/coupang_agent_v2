-- V2 테이블 생성 스크립트 (최종 - 네트워크 트래픽 포함)
-- 기존 v2 테이블을 old-v2로 변경 후 실행
-- 
-- 주요 특징:
-- 1. 상품 검색/발견/클릭 각 단계 명확한 구분
-- 2. 네트워크 트래픽 실시간 추적
-- 3. 부분적 성공 케이스 처리

-- 먼저 기존 v2 테이블을 old-v2로 변경하는 스크립트 실행
-- psql -f rename_v2_to_old_v2.sql

-- 기존 테이블 삭제
DROP TABLE IF EXISTS v2_product_tracking CASCADE;
DROP TABLE IF EXISTS v2_action_logs CASCADE;
DROP TABLE IF EXISTS v2_network_logs CASCADE;
DROP TABLE IF EXISTS v2_execution_logs CASCADE;
DROP TABLE IF EXISTS v2_error_logs CASCADE;
DROP TABLE IF EXISTS v2_test_keywords CASCADE;

-- =====================================================
-- 1. v2_test_keywords 테이블
-- =====================================================
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
    
    -- 도메인별 allow 설정 (v1_agent_config 스타일)
    coupang_main_allow TEXT,
    mercury_allow TEXT,
    ljc_allow TEXT,
    assets_cdn_allow TEXT,
    front_cdn_allow TEXT,
    image_cdn_allow TEXT,
    static_cdn_allow TEXT,
    img1a_cdn_allow TEXT,
    thumbnail_cdn_allow TEXT,
    coupang_main_block_patterns TEXT,
    
    -- 실행 통계
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. v2_execution_logs 테이블 (강화된 추적 + 트래픽)
-- =====================================================
CREATE TABLE v2_execution_logs (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    session_id UUID DEFAULT gen_random_uuid(),
    
    -- 실행 시작/종료
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 1단계: 페이지 도달
    page_reached BOOLEAN DEFAULT false,
    page_reached_at TIMESTAMP,
    page_load_ms INTEGER,
    
    -- 2단계: 상품 검색
    product_searched BOOLEAN DEFAULT false,
    product_list_count INTEGER DEFAULT 0,
    pages_searched INTEGER DEFAULT 0,
    
    -- 3단계: 상품 발견
    product_found BOOLEAN DEFAULT false,
    product_found_at TIMESTAMP,
    product_found_page INTEGER,
    product_rank INTEGER,
    product_rank_in_page INTEGER,
    url_rank INTEGER,
    real_rank INTEGER,
    
    -- 4단계: 상품 클릭
    product_click_attempted BOOLEAN DEFAULT false,
    product_click_success BOOLEAN DEFAULT false,
    product_click_at TIMESTAMP,
    product_click_ms INTEGER,
    product_page_reached BOOLEAN DEFAULT false,
    
    -- 4-1단계: 상품 페이지 로딩 상태
    product_page_url_changed BOOLEAN DEFAULT false,
    product_page_dom_loaded BOOLEAN DEFAULT false,
    product_page_fully_loaded BOOLEAN DEFAULT false,
    product_title_loaded BOOLEAN DEFAULT false,
    cart_button_visible BOOLEAN DEFAULT false,
    cart_button_enabled BOOLEAN DEFAULT false,
    page_load_timeout BOOLEAN DEFAULT false,
    
    -- 5단계: 장바구니
    cart_click_attempted BOOLEAN DEFAULT false,
    cart_click_success BOOLEAN DEFAULT false,
    cart_click_at TIMESTAMP,
    cart_click_count INTEGER DEFAULT 0,
    
    -- 최종 결과
    success BOOLEAN DEFAULT false,
    success_level VARCHAR(20),
    partial_success BOOLEAN DEFAULT false,
    
    -- 상품 정보
    item_id BIGINT,
    vendor_item_id BIGINT,
    
    -- 검색 모드
    search_mode VARCHAR(20),
    search_mode_reason VARCHAR(50),
    search_query VARCHAR(200),
    
    -- 네트워크 환경
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    
    -- 최종 상태
    final_url TEXT,
    final_status VARCHAR(50),
    error_message TEXT,
    error_step VARCHAR(50),
    warning_messages TEXT[],
    
    -- 최적화 설정
    optimize_config_applied TEXT,
    
    -- 네트워크 트래픽 총계 (오류 발생 시에도 현재까지의 값)
    total_traffic_bytes BIGINT DEFAULT 0,
    total_traffic_mb NUMERIC(10,2),
    cached_traffic_bytes BIGINT DEFAULT 0,
    cached_traffic_mb NUMERIC(10,2),
    blocked_requests_count INTEGER DEFAULT 0,
    allowed_requests_count INTEGER DEFAULT 0,
    
    -- 도메인별 트래픽 요약 (JSON)
    traffic_by_domain TEXT,
    traffic_by_type TEXT
);

-- =====================================================
-- 3. v2_product_tracking 테이블
-- =====================================================
CREATE TABLE v2_product_tracking (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    
    page_number INTEGER,
    page_url TEXT,
    
    products_in_page INTEGER,
    products_with_rank INTEGER,
    
    target_product_code VARCHAR(20),
    target_found BOOLEAN DEFAULT false,
    target_position INTEGER,
    
    page_load_success BOOLEAN,
    product_list_found BOOLEAN,
    error_message TEXT,
    
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. v2_action_logs 테이블
-- =====================================================
CREATE TABLE v2_action_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    
    action_seq INTEGER,
    action_type VARCHAR(50),
    action_target VARCHAR(200),
    action_detail TEXT,
    
    process_step VARCHAR(50),
    
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    success BOOLEAN DEFAULT false,
    error_type VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    current_url TEXT,
    page_title VARCHAR(500),
    
    dom_ready_ms INTEGER,
    load_complete_ms INTEGER,
    
    element_visible BOOLEAN,
    element_clickable BOOLEAN,
    element_selector VARCHAR(500),
    element_text TEXT,
    
    screenshot_path TEXT,
    dom_snapshot TEXT
);

-- =====================================================
-- 5. v2_network_logs 테이블
-- =====================================================
CREATE TABLE v2_network_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    action_id INTEGER REFERENCES v2_action_logs(id),
    session_id UUID,
    
    request_id VARCHAR(100),
    request_url TEXT,
    request_method VARCHAR(10),
    request_type VARCHAR(50),
    request_headers TEXT,
    
    response_status INTEGER,
    response_headers TEXT,
    response_size_bytes INTEGER,
    response_body_size INTEGER,
    
    started_at TIMESTAMP,
    dns_lookup_ms NUMERIC(10,2),
    initial_connection_ms NUMERIC(10,2),
    ssl_ms NUMERIC(10,2),
    request_sent_ms NUMERIC(10,2),
    waiting_ms NUMERIC(10,2),
    content_download_ms NUMERIC(10,2),
    total_time_ms NUMERIC(10,2),
    
    was_blocked BOOLEAN DEFAULT false,
    block_reason VARCHAR(100),
    from_cache BOOLEAN DEFAULT false,
    
    domain VARCHAR(255),
    is_third_party BOOLEAN,
    
    content_type VARCHAR(100),
    content_encoding VARCHAR(50)
);

-- =====================================================
-- 6. v2_error_logs 테이블
-- =====================================================
CREATE TABLE v2_error_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    action_id INTEGER REFERENCES v2_action_logs(id),
    session_id UUID,
    
    error_level VARCHAR(20),
    error_code VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(50),
    page_url TEXT,
    
    browser VARCHAR(20) DEFAULT 'chrome',
    agent VARCHAR(50),
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    
    dom_state TEXT,
    console_logs TEXT,
    network_state TEXT
);

-- =====================================================
-- 인덱스 생성
-- =====================================================

-- v2_test_keywords
CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date);
CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent);
CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code);
CREATE INDEX idx_v2_keywords_executions ON v2_test_keywords(current_executions, max_executions);

-- v2_execution_logs
CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
CREATE INDEX idx_v2_exec_session ON v2_execution_logs(session_id);
CREATE INDEX idx_v2_exec_started ON v2_execution_logs(started_at);
CREATE INDEX idx_v2_exec_agent ON v2_execution_logs(agent);
CREATE INDEX idx_v2_exec_search_mode ON v2_execution_logs(search_mode);
CREATE INDEX idx_v2_exec_product_found ON v2_execution_logs(product_found);
CREATE INDEX idx_v2_exec_success ON v2_execution_logs(success);
CREATE INDEX idx_v2_exec_final_status ON v2_execution_logs(final_status);

-- v2_product_tracking
CREATE INDEX idx_v2_product_tracking_execution ON v2_product_tracking(execution_id);
CREATE INDEX idx_v2_product_tracking_found ON v2_product_tracking(target_found);

-- v2_action_logs
CREATE INDEX idx_v2_action_execution ON v2_action_logs(execution_id);
CREATE INDEX idx_v2_action_session ON v2_action_logs(session_id);
CREATE INDEX idx_v2_action_type ON v2_action_logs(action_type);
CREATE INDEX idx_v2_action_process_step ON v2_action_logs(process_step);

-- v2_network_logs
CREATE INDEX idx_v2_network_execution ON v2_network_logs(execution_id);
CREATE INDEX idx_v2_network_action ON v2_network_logs(action_id);
CREATE INDEX idx_v2_network_session ON v2_network_logs(session_id);
CREATE INDEX idx_v2_network_domain ON v2_network_logs(domain);
CREATE INDEX idx_v2_network_blocked ON v2_network_logs(was_blocked);
CREATE INDEX idx_v2_network_type ON v2_network_logs(request_type);

-- v2_error_logs
CREATE INDEX idx_v2_error_execution ON v2_error_logs(execution_id);
CREATE INDEX idx_v2_error_session ON v2_error_logs(session_id);
CREATE INDEX idx_v2_error_level ON v2_error_logs(error_level);
CREATE INDEX idx_v2_error_code ON v2_error_logs(error_code);
CREATE INDEX idx_v2_error_occurred ON v2_error_logs(occurred_at);

-- =====================================================
-- 분석 뷰
-- =====================================================

-- 실행별 트래픽 분석
CREATE OR REPLACE VIEW v2_traffic_analysis AS
SELECT 
    e.keyword_id,
    k.keyword,
    e.agent,
    COUNT(e.id) as executions,
    AVG(e.total_traffic_mb) as avg_traffic_mb,
    MAX(e.total_traffic_mb) as max_traffic_mb,
    MIN(e.total_traffic_mb) as min_traffic_mb,
    AVG(e.cached_traffic_mb) as avg_cached_mb,
    AVG(e.blocked_requests_count) as avg_blocked,
    AVG(e.allowed_requests_count) as avg_allowed,
    ROUND(AVG(e.cached_traffic_bytes::NUMERIC / NULLIF(e.total_traffic_bytes, 0) * 100), 2) as cache_hit_rate
FROM v2_execution_logs e
JOIN v2_test_keywords k ON e.keyword_id = k.id
WHERE e.total_traffic_bytes > 0
GROUP BY e.keyword_id, k.keyword, e.agent;

-- 단계별 성공률 분석
CREATE OR REPLACE VIEW v2_stage_success_analysis AS
SELECT 
    k.id as keyword_id,
    k.keyword,
    k.product_code,
    COUNT(e.id) as total_executions,
    COUNT(CASE WHEN e.page_reached THEN 1 END) as page_reached,
    COUNT(CASE WHEN e.product_found THEN 1 END) as product_found,
    COUNT(CASE WHEN e.product_click_success THEN 1 END) as click_success,
    COUNT(CASE WHEN e.product_page_fully_loaded THEN 1 END) as page_loaded,
    COUNT(CASE WHEN e.cart_button_visible THEN 1 END) as cart_visible,
    COUNT(CASE WHEN e.cart_click_success THEN 1 END) as cart_success,
    COUNT(CASE WHEN e.partial_success THEN 1 END) as partial_success,
    ROUND(COUNT(CASE WHEN e.product_found THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as find_rate,
    ROUND(COUNT(CASE WHEN e.product_click_success THEN 1 END)::NUMERIC / NULLIF(COUNT(CASE WHEN e.product_found THEN 1 END), 0) * 100, 2) as click_conversion
FROM v2_test_keywords k
LEFT JOIN v2_execution_logs e ON k.id = e.keyword_id
GROUP BY k.id, k.keyword, k.product_code;

-- =====================================================
-- 샘플 데이터
-- =====================================================

INSERT INTO v2_test_keywords (keyword, suffix, product_code, agent, coupang_main_allow, notes) 
VALUES 
    ('노트북', NULL, '76174145', 'default', NULL, '기본 최적화 설정'),
    ('노트북', '게이밍', '87654321', 'win11', '["document"]', 'document만 허용'),
    ('맥북', 'M2', '11111111', 'u24', '["document", "xhr", "fetch"]', 'API 포함');

-- =====================================================
-- 코멘트
-- =====================================================

COMMENT ON TABLE v2_execution_logs IS 'V2 실행 로그 - 단계별 추적 및 네트워크 트래픽 포함';
COMMENT ON COLUMN v2_execution_logs.total_traffic_bytes IS '총 다운로드 바이트 (오류 시에도 현재까지 값)';
COMMENT ON COLUMN v2_execution_logs.traffic_by_domain IS '도메인별 트래픽 JSON - {"coupang.com": 1234567, ...}';
COMMENT ON COLUMN v2_execution_logs.partial_success IS '부분적 성공 - 클릭은 했지만 페이지 로딩 미완료 등';

SELECT '✅ V2 테이블 생성 완료!' as status;