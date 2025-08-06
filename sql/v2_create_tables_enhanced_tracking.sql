-- V2 테이블 생성 스크립트 (강화된 추적 버전)
-- 상품 검색/발견/클릭/장바구니 각 단계를 명확히 분리
-- 
-- 문제 해결 포인트:
-- 1. product_found vs success 명확한 구분
-- 2. 각 단계별 성공/실패 추적
-- 3. 실패 이유 상세 기록

-- 기존 테이블 삭제
DROP TABLE IF EXISTS v2_product_tracking CASCADE;
DROP TABLE IF EXISTS v2_action_logs CASCADE;
DROP TABLE IF EXISTS v2_network_logs CASCADE;
DROP TABLE IF EXISTS v2_execution_logs CASCADE;
DROP TABLE IF EXISTS v2_error_logs CASCADE;
DROP TABLE IF EXISTS v2_test_keywords CASCADE;

-- =====================================================
-- 1. v2_test_keywords 테이블 (동일)
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
    
    -- 도메인별 allow 설정
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
-- 2. v2_execution_logs 테이블 (강화된 추적)
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
    
    -- 각 단계별 명확한 구분
    -- 1단계: 페이지 도달
    page_reached BOOLEAN DEFAULT false,  -- 검색 결과 페이지 도달 여부
    page_reached_at TIMESTAMP,
    page_load_ms INTEGER,
    
    -- 2단계: 상품 검색
    product_searched BOOLEAN DEFAULT false,  -- 상품 목록 추출 시도
    product_list_count INTEGER DEFAULT 0,   -- 페이지의 전체 상품 수
    pages_searched INTEGER DEFAULT 0,       -- 검색한 페이지 수
    
    -- 3단계: 상품 발견 (핵심!)
    product_found BOOLEAN DEFAULT false,    -- 타겟 상품 발견 여부
    product_found_at TIMESTAMP,
    product_found_page INTEGER,             -- 몇 페이지에서 발견했는지
    product_rank INTEGER,                   -- 전체 순위
    product_rank_in_page INTEGER,           -- 페이지 내 순위
    url_rank INTEGER,
    real_rank INTEGER,
    
    -- 4단계: 상품 클릭
    product_click_attempted BOOLEAN DEFAULT false,  -- 클릭 시도 여부
    product_click_success BOOLEAN DEFAULT false,    -- 클릭 성공 여부
    product_click_at TIMESTAMP,
    product_click_ms INTEGER,
    product_page_reached BOOLEAN DEFAULT false,     -- 상품 상세 페이지 도달
    
    -- 4-1단계: 상품 페이지 로딩 상태 (세분화)
    product_page_url_changed BOOLEAN DEFAULT false, -- URL이 상품 페이지로 변경됨
    product_page_dom_loaded BOOLEAN DEFAULT false,  -- DOMContentLoaded 이벤트 발생
    product_page_fully_loaded BOOLEAN DEFAULT false,-- Load 이벤트 발생
    product_title_loaded BOOLEAN DEFAULT false,     -- 상품명 요소 로드됨
    cart_button_visible BOOLEAN DEFAULT false,      -- 장바구니 버튼 표시됨
    cart_button_enabled BOOLEAN DEFAULT false,      -- 장바구니 버튼 클릭 가능
    page_load_timeout BOOLEAN DEFAULT false,        -- 페이지 로딩 타임아웃
    
    -- 5단계: 장바구니
    cart_click_attempted BOOLEAN DEFAULT false,     -- 장바구니 시도 여부
    cart_click_success BOOLEAN DEFAULT false,       -- 장바구니 성공 여부
    cart_click_at TIMESTAMP,
    cart_click_count INTEGER DEFAULT 0,
    
    -- 최종 결과 (이제 명확한 기준)
    success BOOLEAN DEFAULT false,  -- 전체 프로세스 성공 (상품 클릭까지)
    success_level VARCHAR(20),      -- 'page_reached', 'product_found', 'page_navigated', 'page_loaded', 'cart_ready', 'cart_clicked'
    partial_success BOOLEAN DEFAULT false,  -- 부분적 성공 (예: 클릭은 했지만 페이지 로딩 미완료)
    
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
    final_status VARCHAR(50),  -- 'success', 'partial_success', 'product_not_found', 'click_failed', 'page_load_incomplete', 'blocked', 'timeout', 'error'
    error_message TEXT,
    error_step VARCHAR(50),    -- 어느 단계에서 실패했는지
    warning_messages TEXT[]     -- 경고 메시지들 (부분 성공 시)
    
    -- 최적화 설정
    optimize_config_applied TEXT,
    
    -- 네트워크 트래픽 총계 (오류 발생 시에도 현재까지의 값)
    total_traffic_bytes BIGINT DEFAULT 0,      -- 총 다운로드 바이트
    total_traffic_mb NUMERIC(10,2),           -- MB 단위
    cached_traffic_bytes BIGINT DEFAULT 0,     -- 캐시에서 로드된 바이트
    cached_traffic_mb NUMERIC(10,2),          -- 캐시 MB
    blocked_requests_count INTEGER DEFAULT 0,  -- 차단된 요청 수
    allowed_requests_count INTEGER DEFAULT 0,  -- 허용된 요청 수
    
    -- 도메인별 트래픽 요약 (JSON)
    traffic_by_domain TEXT,                    -- {"coupang.com": 1234567, ...}
    traffic_by_type TEXT                       -- {"document": 123456, "image": 789012, ...}
);

-- =====================================================
-- 3. v2_product_tracking 테이블 (상품 검색 상세)
-- =====================================================
CREATE TABLE v2_product_tracking (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    
    -- 페이지 정보
    page_number INTEGER,
    page_url TEXT,
    
    -- 상품 목록 정보
    products_in_page INTEGER,           -- 해당 페이지의 상품 수
    products_with_rank INTEGER,         -- rank 파라미터가 있는 상품 수
    
    -- 타겟 상품 검색
    target_product_code VARCHAR(20),
    target_found BOOLEAN DEFAULT false,
    target_position INTEGER,            -- 페이지 내 위치 (1-60)
    
    -- 페이지 상태
    page_load_success BOOLEAN,
    product_list_found BOOLEAN,         -- 상품 목록 요소 발견 여부
    error_message TEXT,
    
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. v2_action_logs 테이블 (기존과 동일하지만 step 추가)
-- =====================================================
CREATE TABLE v2_action_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    
    -- 액션 정보
    action_seq INTEGER,
    action_type VARCHAR(50),
    action_target VARCHAR(200),
    action_detail TEXT,
    
    -- 프로세스 단계
    process_step VARCHAR(50),  -- 'search', 'find_product', 'click_product', 'add_cart'
    
    -- 타이밍
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 결과
    success BOOLEAN DEFAULT false,
    error_type VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- 페이지 상태
    current_url TEXT,
    page_title VARCHAR(500),
    
    -- 성능 메트릭
    dom_ready_ms INTEGER,
    load_complete_ms INTEGER,
    
    -- UI 상태
    element_visible BOOLEAN,
    element_clickable BOOLEAN,
    element_selector VARCHAR(500),
    element_text TEXT,
    
    -- 디버깅
    screenshot_path TEXT,
    dom_snapshot TEXT
);

-- =====================================================
-- 5. 기타 테이블은 이전과 동일
-- =====================================================

-- v2_network_logs (동일)
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

-- v2_error_logs (동일)
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

-- 기존 인덱스 + 추가 인덱스
CREATE INDEX idx_v2_exec_product_found ON v2_execution_logs(product_found);
CREATE INDEX idx_v2_exec_product_click_success ON v2_execution_logs(product_click_success);
CREATE INDEX idx_v2_exec_success_level ON v2_execution_logs(success_level);
CREATE INDEX idx_v2_exec_final_status ON v2_execution_logs(final_status);
CREATE INDEX idx_v2_exec_error_step ON v2_execution_logs(error_step);

CREATE INDEX idx_v2_product_tracking_execution ON v2_product_tracking(execution_id);
CREATE INDEX idx_v2_product_tracking_found ON v2_product_tracking(target_found);

CREATE INDEX idx_v2_action_process_step ON v2_action_logs(process_step);

-- 기존 인덱스들...
CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date);
CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent);
CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code);
CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
CREATE INDEX idx_v2_exec_session ON v2_execution_logs(session_id);
CREATE INDEX idx_v2_exec_started ON v2_execution_logs(started_at);
CREATE INDEX idx_v2_action_execution ON v2_action_logs(execution_id);
CREATE INDEX idx_v2_network_execution ON v2_network_logs(execution_id);
CREATE INDEX idx_v2_error_execution ON v2_error_logs(execution_id);

-- =====================================================
-- 분석 뷰
-- =====================================================

-- 페이지 로딩 상태별 분석
CREATE OR REPLACE VIEW v2_page_load_status_analysis AS
SELECT 
    keyword_id,
    COUNT(*) as total_clicks,
    COUNT(CASE WHEN product_page_url_changed THEN 1 END) as url_changed,
    COUNT(CASE WHEN product_page_dom_loaded THEN 1 END) as dom_loaded,
    COUNT(CASE WHEN product_page_fully_loaded THEN 1 END) as fully_loaded,
    COUNT(CASE WHEN product_title_loaded THEN 1 END) as title_loaded,
    COUNT(CASE WHEN cart_button_visible THEN 1 END) as cart_visible,
    COUNT(CASE WHEN cart_button_enabled THEN 1 END) as cart_enabled,
    COUNT(CASE WHEN page_load_timeout THEN 1 END) as timeout_count,
    -- 부분적 성공 케이스
    COUNT(CASE WHEN product_page_url_changed = true 
               AND cart_button_visible = true 
               AND product_page_fully_loaded = false THEN 1 END) as partial_load_cases,
    -- 성공률
    ROUND(COUNT(CASE WHEN product_page_fully_loaded THEN 1 END)::NUMERIC / 
          NULLIF(COUNT(CASE WHEN product_click_attempted THEN 1 END), 0) * 100, 2) as full_load_rate
FROM v2_execution_logs
WHERE product_click_attempted = true
GROUP BY keyword_id;

-- 부분적 성공 상세 분석
CREATE OR REPLACE VIEW v2_partial_success_analysis AS
SELECT 
    e.keyword_id,
    k.keyword,
    e.session_id,
    e.started_at,
    e.product_page_url_changed,
    e.product_page_dom_loaded,
    e.product_page_fully_loaded,
    e.cart_button_visible,
    e.cart_button_enabled,
    e.page_load_timeout,
    e.partial_success,
    e.success_level,
    e.final_status,
    e.warning_messages
FROM v2_execution_logs e
JOIN v2_test_keywords k ON e.keyword_id = k.id
WHERE e.partial_success = true
   OR (e.product_page_url_changed = true AND e.product_page_fully_loaded = false)
ORDER BY e.started_at DESC;

-- =====================================================

-- 단계별 성공률 분석
CREATE OR REPLACE VIEW v2_stage_success_analysis AS
SELECT 
    k.id as keyword_id,
    k.keyword,
    k.product_code,
    COUNT(e.id) as total_executions,
    -- 각 단계별 성공률
    COUNT(CASE WHEN e.page_reached THEN 1 END) as page_reached_count,
    COUNT(CASE WHEN e.product_searched THEN 1 END) as product_searched_count,
    COUNT(CASE WHEN e.product_found THEN 1 END) as product_found_count,
    COUNT(CASE WHEN e.product_click_attempted THEN 1 END) as click_attempted_count,
    COUNT(CASE WHEN e.product_click_success THEN 1 END) as click_success_count,
    COUNT(CASE WHEN e.cart_click_attempted THEN 1 END) as cart_attempted_count,
    COUNT(CASE WHEN e.cart_click_success THEN 1 END) as cart_success_count,
    COUNT(CASE WHEN e.success THEN 1 END) as overall_success_count,
    -- 단계별 전환율
    ROUND(COUNT(CASE WHEN e.product_found THEN 1 END)::NUMERIC / NULLIF(COUNT(CASE WHEN e.product_searched THEN 1 END), 0) * 100, 2) as find_rate,
    ROUND(COUNT(CASE WHEN e.product_click_success THEN 1 END)::NUMERIC / NULLIF(COUNT(CASE WHEN e.product_found THEN 1 END), 0) * 100, 2) as click_rate,
    ROUND(COUNT(CASE WHEN e.cart_click_success THEN 1 END)::NUMERIC / NULLIF(COUNT(CASE WHEN e.product_click_success THEN 1 END), 0) * 100, 2) as cart_rate
FROM v2_test_keywords k
LEFT JOIN v2_execution_logs e ON k.id = e.keyword_id
GROUP BY k.id, k.keyword, k.product_code
ORDER BY k.id;

-- 실패 원인 분석
CREATE OR REPLACE VIEW v2_failure_analysis AS
SELECT 
    final_status,
    error_step,
    COUNT(*) as occurrence_count,
    COUNT(DISTINCT keyword_id) as affected_keywords,
    COUNT(DISTINCT agent) as affected_agents,
    ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM v2_execution_logs) * 100, 2) as percentage
FROM v2_execution_logs
WHERE success = false
GROUP BY final_status, error_step
ORDER BY occurrence_count DESC;

-- product_found vs success 불일치 분석
CREATE OR REPLACE VIEW v2_found_success_mismatch AS
SELECT 
    keyword_id,
    COUNT(*) as total_executions,
    COUNT(CASE WHEN product_found = true AND success = true THEN 1 END) as both_true,
    COUNT(CASE WHEN product_found = true AND success = false THEN 1 END) as found_but_failed,
    COUNT(CASE WHEN product_found = false AND success = true THEN 1 END) as not_found_but_success,
    COUNT(CASE WHEN product_found = false AND success = false THEN 1 END) as both_false
FROM v2_execution_logs
GROUP BY keyword_id
HAVING COUNT(CASE WHEN product_found = false AND success = true THEN 1 END) > 0
   OR COUNT(CASE WHEN product_found = true AND success = false THEN 1 END) > 0
ORDER BY keyword_id;

-- =====================================================
-- 코멘트
-- =====================================================

COMMENT ON COLUMN v2_execution_logs.product_found IS '타겟 상품 발견 여부 - 상품 목록에서 찾았는지';
COMMENT ON COLUMN v2_execution_logs.product_click_success IS '상품 클릭 성공 여부 - 상세 페이지 진입';
COMMENT ON COLUMN v2_execution_logs.product_page_url_changed IS 'URL이 상품 페이지로 변경되었는지';
COMMENT ON COLUMN v2_execution_logs.cart_button_visible IS '장바구니 버튼이 화면에 표시되었는지';
COMMENT ON COLUMN v2_execution_logs.product_page_fully_loaded IS '페이지가 완전히 로드되었는지 (load 이벤트)';
COMMENT ON COLUMN v2_execution_logs.partial_success IS '부분적 성공 - 클릭은 했지만 페이지 로딩 미완료 등';
COMMENT ON COLUMN v2_execution_logs.success IS '전체 프로세스 성공 - 최소 상품 클릭 + 페이지 로드까지';
COMMENT ON COLUMN v2_execution_logs.success_level IS '도달한 최고 수준';
COMMENT ON COLUMN v2_execution_logs.error_step IS '실패한 단계 - search/find/click/load/cart';