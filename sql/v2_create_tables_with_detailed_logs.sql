-- V2 테이블 생성 스크립트 (상세 로그 포함)
-- Chrome 전용 쿠팡 자동화 프로젝트
-- 
-- 특징:
-- 1. 매우 상세한 단계별 로그 구조
-- 2. 네트워크, 성능, UI 상태 등 모든 메트릭 추적
-- 3. 디버깅과 분석에 최적화

-- 기존 테이블 삭제 (있는 경우)
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
    
    -- 메모
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. v2_execution_logs 테이블 (메인 실행 로그)
-- =====================================================
CREATE TABLE v2_execution_logs (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    session_id UUID DEFAULT gen_random_uuid(),  -- 세션별 그룹핑용
    
    -- 실행 시작/종료
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 실행 결과
    success BOOLEAN DEFAULT false,
    product_found BOOLEAN,
    product_clicked BOOLEAN,
    cart_clicked BOOLEAN,
    
    -- 상품 정보
    product_rank INTEGER,
    url_rank INTEGER,
    real_rank INTEGER,
    item_id BIGINT,
    vendor_item_id BIGINT,
    pages_searched INTEGER,
    
    -- 검색 모드 (자동 전환)
    search_mode VARCHAR(20),  -- 'goto' or 'search'
    search_mode_reason VARCHAR(50),
    search_query VARCHAR(200),
    
    -- 네트워크 환경
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    
    -- 최종 상태
    final_url TEXT,
    final_status VARCHAR(50),  -- 'success', 'blocked', 'timeout', 'error'
    error_message TEXT,
    
    -- 최적화 설정 스냅샷
    optimize_config_applied TEXT  -- 실제 적용된 도메인 규칙 (JSON)
);

-- =====================================================
-- 3. v2_action_logs 테이블 (상세 액션 로그)
-- =====================================================
CREATE TABLE v2_action_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    
    -- 액션 정보
    action_seq INTEGER,  -- 액션 순서
    action_type VARCHAR(50),  -- 'navigate', 'search_input', 'click', 'wait', 'scroll', 'cart_click'
    action_target VARCHAR(200),  -- 대상 (URL, 선택자, 검색어 등)
    action_detail TEXT,  -- 상세 정보 (JSON)
    
    -- 타이밍
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 결과
    success BOOLEAN DEFAULT false,
    error_type VARCHAR(50),  -- 'timeout', 'not_found', 'click_failed', 'navigation_failed'
    error_message TEXT,
    
    -- 페이지 상태
    current_url TEXT,
    page_title VARCHAR(500),
    
    -- 성능 메트릭
    dom_ready_ms INTEGER,
    load_complete_ms INTEGER,
    
    -- UI 상태
    element_visible BOOLEAN,
    element_clickable BOOLEAN,
    viewport_screenshot TEXT  -- base64 또는 파일 경로 (디버깅용)
);

-- =====================================================
-- 4. v2_network_logs 테이블 (네트워크 상세 로그)
-- =====================================================
CREATE TABLE v2_network_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    action_id INTEGER REFERENCES v2_action_logs(id),
    session_id UUID,
    
    -- 요청 정보
    request_id VARCHAR(100),
    request_url TEXT,
    request_method VARCHAR(10),
    request_type VARCHAR(50),  -- 'document', 'xhr', 'fetch', 'script', 'stylesheet', 'image', 'font'
    request_headers TEXT,  -- JSON
    
    -- 응답 정보
    response_status INTEGER,
    response_headers TEXT,  -- JSON
    response_size_bytes INTEGER,
    response_body_size INTEGER,
    
    -- 타이밍 (밀리초)
    started_at TIMESTAMP,
    dns_lookup_ms NUMERIC(10,2),
    initial_connection_ms NUMERIC(10,2),
    ssl_ms NUMERIC(10,2),
    request_sent_ms NUMERIC(10,2),
    waiting_ms NUMERIC(10,2),
    content_download_ms NUMERIC(10,2),
    total_time_ms NUMERIC(10,2),
    
    -- 차단/캐시
    was_blocked BOOLEAN DEFAULT false,
    block_reason VARCHAR(100),
    from_cache BOOLEAN DEFAULT false,
    
    -- 도메인 분석
    domain VARCHAR(255),
    is_third_party BOOLEAN,
    
    -- 컨텐츠 분석
    content_type VARCHAR(100),
    content_encoding VARCHAR(50)
);

-- =====================================================
-- 5. v2_error_logs 테이블 (에러 상세)
-- =====================================================
CREATE TABLE v2_error_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    action_id INTEGER REFERENCES v2_action_logs(id),
    session_id UUID,
    
    -- 에러 정보
    error_level VARCHAR(20),  -- 'fatal', 'error', 'warning', 'info'
    error_code VARCHAR(100),
    error_message TEXT,
    error_stack TEXT,
    
    -- 발생 컨텍스트
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(50),
    page_url TEXT,
    
    -- 환경 정보
    browser VARCHAR(20) DEFAULT 'chrome',
    agent VARCHAR(50),
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    
    -- 추가 컨텍스트
    dom_state TEXT,  -- 에러 발생 시점의 DOM 스냅샷
    console_logs TEXT,  -- 최근 콘솔 로그
    network_state TEXT  -- 진행 중이던 네트워크 요청
);

-- =====================================================
-- 인덱스 생성
-- =====================================================

-- v2_test_keywords 인덱스
CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date);
CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent);
CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code);
CREATE INDEX idx_v2_keywords_executions ON v2_test_keywords(current_executions, max_executions);

-- v2_execution_logs 인덱스
CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
CREATE INDEX idx_v2_exec_session ON v2_execution_logs(session_id);
CREATE INDEX idx_v2_exec_started ON v2_execution_logs(started_at);
CREATE INDEX idx_v2_exec_agent ON v2_execution_logs(agent);
CREATE INDEX idx_v2_exec_search_mode ON v2_execution_logs(search_mode);
CREATE INDEX idx_v2_exec_final_status ON v2_execution_logs(final_status);

-- v2_action_logs 인덱스
CREATE INDEX idx_v2_action_execution ON v2_action_logs(execution_id);
CREATE INDEX idx_v2_action_session ON v2_action_logs(session_id);
CREATE INDEX idx_v2_action_type ON v2_action_logs(action_type);
CREATE INDEX idx_v2_action_started ON v2_action_logs(started_at);
CREATE INDEX idx_v2_action_success ON v2_action_logs(success);

-- v2_network_logs 인덱스
CREATE INDEX idx_v2_network_execution ON v2_network_logs(execution_id);
CREATE INDEX idx_v2_network_action ON v2_network_logs(action_id);
CREATE INDEX idx_v2_network_session ON v2_network_logs(session_id);
CREATE INDEX idx_v2_network_domain ON v2_network_logs(domain);
CREATE INDEX idx_v2_network_blocked ON v2_network_logs(was_blocked);
CREATE INDEX idx_v2_network_type ON v2_network_logs(request_type);

-- v2_error_logs 인덱스
CREATE INDEX idx_v2_error_execution ON v2_error_logs(execution_id);
CREATE INDEX idx_v2_error_action ON v2_error_logs(action_id);
CREATE INDEX idx_v2_error_session ON v2_error_logs(session_id);
CREATE INDEX idx_v2_error_level ON v2_error_logs(error_level);
CREATE INDEX idx_v2_error_code ON v2_error_logs(error_code);
CREATE INDEX idx_v2_error_occurred ON v2_error_logs(occurred_at);

-- =====================================================
-- 코멘트 추가
-- =====================================================

COMMENT ON TABLE v2_test_keywords IS 'V2 키워드 테이블 - v1_agent_config 스타일 도메인 설정';
COMMENT ON TABLE v2_execution_logs IS 'V2 메인 실행 로그 - 세션별 실행 요약';
COMMENT ON TABLE v2_action_logs IS 'V2 액션 로그 - 모든 브라우저 액션 상세 기록';
COMMENT ON TABLE v2_network_logs IS 'V2 네트워크 로그 - 모든 HTTP 요청/응답 상세';
COMMENT ON TABLE v2_error_logs IS 'V2 에러 로그 - 에러 발생 시 전체 컨텍스트';

COMMENT ON COLUMN v2_execution_logs.session_id IS '실행 세션 고유 ID - 관련 로그 그룹핑용';
COMMENT ON COLUMN v2_action_logs.action_seq IS '세션 내 액션 순서 번호';
COMMENT ON COLUMN v2_action_logs.viewport_screenshot IS '액션 실행 시점 스크린샷 (디버깅용)';
COMMENT ON COLUMN v2_network_logs.total_time_ms IS '요청 시작부터 응답 완료까지 전체 시간';
COMMENT ON COLUMN v2_error_logs.dom_state IS '에러 발생 시점의 DOM 구조 스냅샷';

-- =====================================================
-- 분석용 뷰
-- =====================================================

-- 실행별 액션 타임라인 뷰
CREATE OR REPLACE VIEW v2_execution_timeline AS
SELECT 
    e.id as execution_id,
    e.keyword_id,
    k.keyword,
    e.session_id,
    a.action_seq,
    a.action_type,
    a.action_target,
    a.started_at,
    a.duration_ms,
    a.success,
    a.error_type,
    EXTRACT(EPOCH FROM (a.started_at - e.started_at)) * 1000 as time_from_start_ms
FROM v2_execution_logs e
JOIN v2_test_keywords k ON e.keyword_id = k.id
JOIN v2_action_logs a ON e.id = a.execution_id
ORDER BY e.id, a.action_seq;

-- 네트워크 트래픽 분석 뷰
CREATE OR REPLACE VIEW v2_network_analysis AS
SELECT 
    n.execution_id,
    n.domain,
    n.request_type,
    COUNT(*) as request_count,
    SUM(CASE WHEN n.was_blocked THEN 1 ELSE 0 END) as blocked_count,
    SUM(CASE WHEN n.from_cache THEN 1 ELSE 0 END) as cached_count,
    SUM(n.response_body_size) as total_bytes,
    AVG(n.total_time_ms) as avg_response_time,
    MAX(n.total_time_ms) as max_response_time
FROM v2_network_logs n
GROUP BY n.execution_id, n.domain, n.request_type
ORDER BY total_bytes DESC;

-- 에러 패턴 분석 뷰
CREATE OR REPLACE VIEW v2_error_patterns AS
SELECT 
    e.error_code,
    e.error_level,
    e.action_type,
    COUNT(*) as occurrence_count,
    COUNT(DISTINCT e.execution_id) as affected_executions,
    COUNT(DISTINCT e.session_id) as affected_sessions,
    MIN(e.occurred_at) as first_seen,
    MAX(e.occurred_at) as last_seen
FROM v2_error_logs e
GROUP BY e.error_code, e.error_level, e.action_type
ORDER BY occurrence_count DESC;