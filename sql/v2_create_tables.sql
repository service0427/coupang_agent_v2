-- v2 테이블 생성 스크립트
-- Chrome 전용 쿠팡 자동화 프로젝트

-- 기존 테이블 삭제 (있는 경우)
DROP TABLE IF EXISTS v2_product_tracking CASCADE;
DROP TABLE IF EXISTS v2_network_logs CASCADE;
DROP TABLE IF EXISTS v2_action_logs CASCADE;
DROP TABLE IF EXISTS v2_error_logs CASCADE;
DROP TABLE IF EXISTS v2_execution_logs CASCADE;
DROP TABLE IF EXISTS v2_test_keywords CASCADE;

-- v2_test_keywords 테이블 (초심플 버전 - 핵심 컬럼만)
CREATE TABLE v2_test_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword VARCHAR(100) NOT NULL,
    product_code VARCHAR(20) NOT NULL,
    agent VARCHAR(50),
    proxy_server VARCHAR(255),
    cart_click_enabled BOOLEAN DEFAULT false,
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    block_count INTEGER DEFAULT 0,
    last_blocked_at TIMESTAMP,
    last_executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- V2 추적 강화: 키워드+코드 조합 추적 (수동 업데이트)
    tracking_key VARCHAR(150),
    -- 최적화 설정 컬럼들 (JSON 형태)
    coupang_main_allow TEXT DEFAULT '["document"]',
    mercury_allow TEXT,
    ljc_allow TEXT,
    assets_cdn_allow TEXT,
    front_cdn_allow TEXT,
    image_cdn_allow TEXT,
    static_cdn_allow TEXT,
    img1a_cdn_allow TEXT,
    thumbnail_cdn_allow TEXT,
    coupang_main_block_patterns TEXT
);

-- v2_execution_logs 테이블 (단순화된 버전 - 4단계 중심)
CREATE TABLE v2_execution_logs (
    id SERIAL PRIMARY KEY,
    session_id UUID DEFAULT gen_random_uuid(),
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    -- 추적 강화: 키워드와 상품코드 모두 기록
    keyword VARCHAR(100) NOT NULL,
    product_code VARCHAR(20) NOT NULL,
    tracking_key VARCHAR(150),
    
    -- 실행 시간 정보
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 검색 모드 및 설정
    search_mode VARCHAR(20) DEFAULT 'goto', -- 'search' 또는 'goto'
    search_query VARCHAR(200),
    optimize_config_applied TEXT, -- JSON 형태
    
    -- 1단계: 상품 검색/이동 (search or goto)
    stage1_search_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    stage1_completed_at TIMESTAMP,
    stage1_duration_ms INTEGER,
    stage1_error_message TEXT,
    
    -- 2단계: 상품 찾기 (1~10페이지)
    stage2_find_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    stage2_completed_at TIMESTAMP,
    stage2_duration_ms INTEGER,
    stage2_pages_searched INTEGER DEFAULT 1,
    stage2_product_found_page INTEGER, -- 몇 페이지에서 찾았는지
    stage2_product_rank INTEGER, -- 페이지 내 순위
    stage2_total_products INTEGER, -- 검색된 총 상품 수
    stage2_error_message TEXT,
    
    -- 3단계: 상품 클릭
    stage3_click_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    stage3_completed_at TIMESTAMP,
    stage3_duration_ms INTEGER,
    stage3_click_attempts INTEGER DEFAULT 0,
    stage3_final_url TEXT, -- 클릭 후 최종 URL
    stage3_error_message TEXT,
    
    -- 4단계: 장바구니 클릭 (선택적)
    stage4_cart_status VARCHAR(20) DEFAULT 'not_required', -- not_required, pending, success, failed
    stage4_completed_at TIMESTAMP,
    stage4_duration_ms INTEGER,
    stage4_click_attempts INTEGER DEFAULT 0,
    stage4_error_message TEXT,
    
    -- 최종 결과
    final_status VARCHAR(30) NOT NULL, -- success, stage1_failed, stage2_failed, stage3_failed, stage4_failed
    overall_success BOOLEAN NOT NULL DEFAULT false,
    last_successful_stage INTEGER DEFAULT 0, -- 0=시작전, 1=검색완료, 2=상품발견, 3=클릭완료, 4=장바구니완료
    
    -- 오류 및 경고
    critical_error_message TEXT, -- 치명적 오류 (실행 중단)
    warning_messages TEXT[], -- 경고 메시지 배열
    
    -- 네트워크 및 프록시 정보
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    item_id BIGINT,
    vendor_item_id BIGINT,
    
    -- 네트워크 트래픽 통계 (요약)
    total_traffic_bytes BIGINT DEFAULT 0,
    total_traffic_mb NUMERIC(10,2) DEFAULT 0,
    blocked_requests_count INTEGER DEFAULT 0,
    traffic_summary TEXT -- JSON 형태 (간소화된 트래픽 정보)
);

-- v2_action_logs 테이블 (새로운 액션 로깅)
CREATE TABLE v2_action_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    action_seq INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_target VARCHAR(200) NOT NULL,
    action_detail TEXT, -- JSON 형태
    process_step VARCHAR(50),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 액션 결과
    success BOOLEAN DEFAULT false,
    error_type VARCHAR(50),
    error_message TEXT,
    
    -- 페이지 정보
    current_url TEXT,
    page_title VARCHAR(200),
    
    -- 성능 메트릭
    dom_ready_ms INTEGER,
    load_complete_ms INTEGER,
    
    -- 요소 상태
    element_visible BOOLEAN,
    element_clickable BOOLEAN,
    element_selector VARCHAR(500),
    element_text VARCHAR(200),
    
    -- 디버깅 정보
    screenshot_path VARCHAR(500),
    dom_snapshot TEXT
);

-- v2_network_logs 테이블 (네트워크 로깅)
CREATE TABLE v2_network_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    action_id INTEGER REFERENCES v2_action_logs(id),
    session_id UUID,
    request_id VARCHAR(100),
    request_url TEXT NOT NULL,
    request_method VARCHAR(10) DEFAULT 'GET',
    request_type VARCHAR(50), -- document, stylesheet, image, script, etc.
    request_headers TEXT, -- JSON 형태
    response_status INTEGER,
    response_headers TEXT, -- JSON 형태
    response_size_bytes INTEGER DEFAULT 0,
    response_body_size INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 성능 메트릭 (밀리초 단위)
    dns_lookup_ms NUMERIC(10,3) DEFAULT 0,
    initial_connection_ms NUMERIC(10,3) DEFAULT 0,
    ssl_ms NUMERIC(10,3) DEFAULT 0,
    request_sent_ms NUMERIC(10,3) DEFAULT 0,
    waiting_ms NUMERIC(10,3) DEFAULT 0,
    content_download_ms NUMERIC(10,3) DEFAULT 0,
    total_time_ms NUMERIC(10,3) DEFAULT 0,
    
    -- 차단 및 캐시 정보
    was_blocked BOOLEAN DEFAULT false,
    block_reason VARCHAR(100),
    from_cache BOOLEAN DEFAULT false,
    domain VARCHAR(100),
    is_third_party BOOLEAN DEFAULT false,
    content_type VARCHAR(100),
    content_encoding VARCHAR(50)
);

-- v2_error_logs 테이블 (개선된 버전)
CREATE TABLE v2_error_logs (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    action_id INTEGER REFERENCES v2_action_logs(id),
    session_id UUID,
    error_level VARCHAR(20) DEFAULT 'error', -- info, warning, error, critical
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    error_stack TEXT,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 컴텍스트 정보 - 추적 강화
    action_type VARCHAR(50),
    keyword VARCHAR(100), -- 추가: 단독 추적
    product_code VARCHAR(20), -- 추가: 단독 추적
    tracking_key VARCHAR(150), -- 추가: 단독 추적
    page_url TEXT,
    agent VARCHAR(50),
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    
    -- 디버깅 정보
    dom_state TEXT, -- JSON 형태
    console_logs TEXT, -- JSON 형태
    network_state TEXT -- JSON 형태
);

-- v2_product_tracking 테이블 (상품 추적 강화)
CREATE TABLE v2_product_tracking (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    session_id UUID,
    page_number INTEGER NOT NULL,
    page_url TEXT NOT NULL,
    products_in_page INTEGER DEFAULT 0,
    products_with_rank INTEGER DEFAULT 0,
    target_product_code VARCHAR(20),
    target_found BOOLEAN DEFAULT false,
    target_position INTEGER,
    page_load_success BOOLEAN DEFAULT true,
    product_list_found BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
-- v2_test_keywords 인덱스
CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date);
CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent);
CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code);
CREATE INDEX idx_v2_keywords_tracking ON v2_test_keywords(tracking_key); -- 추적 강화
CREATE INDEX idx_v2_keywords_executions ON v2_test_keywords(current_executions, max_executions);
CREATE INDEX idx_v2_keywords_blocks ON v2_test_keywords(block_count, last_blocked_at); -- 차단 추적

-- v2_execution_logs 인덱스
CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
CREATE INDEX idx_v2_exec_tracking ON v2_execution_logs(tracking_key); -- 추적 강화
CREATE INDEX idx_v2_exec_date ON v2_execution_logs(started_at);
CREATE INDEX idx_v2_exec_success ON v2_execution_logs(success);
CREATE INDEX idx_v2_exec_agent ON v2_execution_logs(agent);
CREATE INDEX idx_v2_exec_session ON v2_execution_logs(session_id);
CREATE INDEX idx_v2_exec_status ON v2_execution_logs(final_status);

-- v2_action_logs 인덱스
CREATE INDEX idx_v2_action_exec ON v2_action_logs(execution_id);
CREATE INDEX idx_v2_action_session ON v2_action_logs(session_id);
CREATE INDEX idx_v2_action_type ON v2_action_logs(action_type);
CREATE INDEX idx_v2_action_date ON v2_action_logs(started_at);
CREATE INDEX idx_v2_action_success ON v2_action_logs(success);

-- v2_network_logs 인덱스
CREATE INDEX idx_v2_network_exec ON v2_network_logs(execution_id);
CREATE INDEX idx_v2_network_session ON v2_network_logs(session_id);
CREATE INDEX idx_v2_network_domain ON v2_network_logs(domain);
CREATE INDEX idx_v2_network_blocked ON v2_network_logs(was_blocked);
CREATE INDEX idx_v2_network_cache ON v2_network_logs(from_cache);

-- v2_error_logs 인덱스
CREATE INDEX idx_v2_error_date ON v2_error_logs(occurred_at);
CREATE INDEX idx_v2_error_exec ON v2_error_logs(execution_id);
CREATE INDEX idx_v2_error_tracking ON v2_error_logs(tracking_key); -- 추적 강화
CREATE INDEX idx_v2_error_code ON v2_error_logs(error_code);
CREATE INDEX idx_v2_error_level ON v2_error_logs(error_level);
CREATE INDEX idx_v2_error_agent ON v2_error_logs(agent);

-- v2_product_tracking 인덱스
CREATE INDEX idx_v2_product_exec ON v2_product_tracking(execution_id);
CREATE INDEX idx_v2_product_session ON v2_product_tracking(session_id);
CREATE INDEX idx_v2_product_code ON v2_product_tracking(target_product_code);

-- 샘플 데이터 입력 (초심플 버전)
INSERT INTO v2_test_keywords (
    keyword, product_code, agent, cart_click_enabled
) VALUES 
    -- 하드코딩 값들:
    -- userdata=true (영구 프로필 사용)
    -- clear_cache=false (캐시 유지, session만 삭제)
    -- optimize=true (무조건 활성화)
    -- search=동적 (goto 기본, 차단 시 search 모드)
    ('노트북', '76174145', 'test', false),
    ('노트북게이밍', '87654321', 'test', false),
    ('노트북업무용', '12345678', 'test', true);

-- 통계 뷰 생성 (개선된 버전 - suffix 제거)
CREATE OR REPLACE VIEW v2_keyword_stats AS
SELECT 
    k.id,
    k.keyword,
    k.product_code,
    k.tracking_key, -- 추적 강화
    k.agent,
    k.current_executions,
    k.max_executions,
    k.success_count,
    k.fail_count,
    k.block_count, -- 차단 횟수 추가
    CASE 
        WHEN (k.success_count + k.fail_count) > 0 
        THEN ROUND((k.success_count::NUMERIC / (k.success_count + k.fail_count)) * 100, 2)
        ELSE 0 
    END as success_rate,
    k.last_executed_at,
    k.last_blocked_at -- 마지막 차단 시각
FROM v2_test_keywords k
ORDER BY k.id;

-- 동시 차단 감지 뷰
CREATE OR REPLACE VIEW v2_concurrent_blocks AS
SELECT 
    DATE_TRUNC('minute', occurred_at) as block_minute,
    COUNT(DISTINCT agent) as blocked_agents,
    COUNT(*) as total_blocks,
    string_agg(DISTINCT agent, ', ') as affected_agents,
    MAX(occurred_at) as latest_block
FROM v2_error_logs 
WHERE error_code IN ('ERR_HTTP2_PROTOCOL_ERROR', 'BLOCKED', 'ACCESS_DENIED')
  AND occurred_at >= NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', occurred_at)
HAVING COUNT(DISTINCT agent) >= 2 -- 2개 이상 에이전트가 동시에 차단
ORDER BY block_minute DESC;

-- 에러 요약 뷰 (개선된 버전)
CREATE OR REPLACE VIEW v2_error_summary AS
SELECT 
    error_code,
    error_level,
    COUNT(*) as error_count,
    MAX(occurred_at) as last_occurred,
    COUNT(DISTINCT tracking_key) as affected_tracking_keys, -- 추적 강화
    COUNT(DISTINCT agent) as affected_agents,
    -- 최근 1시간 내 발생 횟수
    COUNT(CASE WHEN occurred_at >= NOW() - INTERVAL '1 hour' THEN 1 END) as recent_count
FROM v2_error_logs
GROUP BY error_code, error_level
ORDER BY error_count DESC;

-- 성능 통계 뷰 (단순화된 버전)
CREATE OR REPLACE VIEW v2_performance_stats AS
SELECT 
    tracking_key,
    agent,
    COUNT(*) as total_executions,
    AVG(duration_ms) as avg_duration_ms,
    AVG(stage1_duration_ms) as avg_search_ms,
    AVG(stage2_duration_ms) as avg_find_ms, 
    AVG(stage3_duration_ms) as avg_click_ms,
    AVG(stage4_duration_ms) as avg_cart_ms,
    AVG(total_traffic_mb) as avg_traffic_mb,
    AVG(CASE WHEN overall_success THEN 1.0 ELSE 0.0 END * 100) as success_rate,
    AVG(last_successful_stage) as avg_completion_stage,
    COUNT(CASE WHEN final_status = 'success' THEN 1 END) as full_success_count,
    COUNT(CASE WHEN final_status LIKE '%_failed' THEN 1 END) as failed_count,
    MAX(started_at) as last_execution
FROM v2_execution_logs
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY tracking_key, agent
ORDER BY total_executions DESC;

-- 단계별 실패 분석 뷰
CREATE OR REPLACE VIEW v2_stage_failure_analysis AS
SELECT 
    tracking_key,
    agent,
    COUNT(*) as total_attempts,
    -- 각 단계별 성공률
    AVG(CASE WHEN stage1_search_status = 'success' THEN 1.0 ELSE 0.0 END * 100) as stage1_success_rate,
    AVG(CASE WHEN stage2_find_status = 'success' THEN 1.0 ELSE 0.0 END * 100) as stage2_success_rate,
    AVG(CASE WHEN stage3_click_status = 'success' THEN 1.0 ELSE 0.0 END * 100) as stage3_success_rate,
    AVG(CASE WHEN stage4_cart_status IN ('success', 'not_required') THEN 1.0 ELSE 0.0 END * 100) as stage4_success_rate,
    -- 각 단계에서 실패한 횟수
    COUNT(CASE WHEN final_status = 'stage1_failed' THEN 1 END) as stage1_failures,
    COUNT(CASE WHEN final_status = 'stage2_failed' THEN 1 END) as stage2_failures,
    COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END) as stage3_failures,
    COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END) as stage4_failures,
    -- 상품 발견 페이지 분석
    AVG(stage2_product_found_page) as avg_found_page,
    MAX(stage2_product_found_page) as max_found_page,
    AVG(stage2_pages_searched) as avg_pages_searched,
    -- 가장 많이 실패하는 단계
    CASE 
        WHEN COUNT(CASE WHEN final_status = 'stage1_failed' THEN 1 END) >= 
             GREATEST(
                 COUNT(CASE WHEN final_status = 'stage2_failed' THEN 1 END),
                 COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END), 
                 COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END)
             ) THEN 'stage1_search'
        WHEN COUNT(CASE WHEN final_status = 'stage2_failed' THEN 1 END) >= 
             GREATEST(
                 COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END),
                 COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END)
             ) THEN 'stage2_find'
        WHEN COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END) >= 
             COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END) THEN 'stage3_click'
        ELSE 'stage4_cart'
    END as most_failed_stage
FROM v2_execution_logs
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY tracking_key, agent
ORDER BY total_attempts DESC;

-- tracking_key 자동 생성 함수 (suffix 제거)
CREATE OR REPLACE FUNCTION generate_tracking_key(p_keyword VARCHAR, p_product_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN p_keyword || ':' || p_product_code;
END;
$$ LANGUAGE plpgsql;

-- v2_test_keywords tracking_key 자동 생성 트리거
CREATE OR REPLACE FUNCTION update_keywords_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_keywords_tracking_key
    BEFORE INSERT OR UPDATE ON v2_test_keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_keywords_tracking_key();

-- v2_execution_logs tracking_key 자동 생성 트리거
CREATE OR REPLACE FUNCTION update_execution_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.keyword IS NOT NULL AND NEW.product_code IS NOT NULL THEN
        NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_execution_tracking_key
    BEFORE INSERT OR UPDATE ON v2_execution_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_execution_tracking_key();