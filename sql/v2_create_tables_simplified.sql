-- V2 테이블 생성 스크립트 (간소화 버전)
-- Chrome 전용 쿠팡 자동화 프로젝트
-- 
-- 정책 변경사항:
-- - userdata=true, session=false, cache=true 가 기본값이므로 제거
-- - 불필요한 옵션 제거하여 더 간결한 구조

-- 기존 테이블 삭제 (있는 경우)
DROP TABLE IF EXISTS v2_execution_logs CASCADE;
DROP TABLE IF EXISTS v2_error_logs CASCADE;
DROP TABLE IF EXISTS v2_test_keywords CASCADE;

-- v2_test_keywords 테이블 (간소화)
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
    -- 최적화 설정 (V2에서는 항상 켜짐, 레벨만 조정)
    optimize_level VARCHAR(20) DEFAULT 'balanced' CHECK (optimize_level IN ('minimal', 'balanced', 'maximum')),
    -- 검색 모드 설정
    search_mode VARCHAR(20) DEFAULT 'goto' CHECK (search_mode IN ('goto', 'search', 'auto')),
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 제거된 컬럼들 (기본 정책으로 고정):
    -- use_persistent (항상 true)
    -- clear_session (항상 false = session 유지)
    -- clear_cache (항상 false = cache 유지)
);

-- v2_execution_logs 테이블 (간소화)
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
    -- 최적화 레벨
    optimize_level VARCHAR(20),
    -- 네트워크 메트릭
    traffic_mb NUMERIC(10, 2),
    cached_mb NUMERIC(10, 2),
    blocked_requests INTEGER
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
COMMENT ON TABLE v2_test_keywords IS 'V2 키워드 테이블 - 간소화된 구조 (기본 정책: userdata=true, session=false, cache=true)';
COMMENT ON COLUMN v2_test_keywords.optimize_level IS '최적화 레벨 - V2에서는 항상 활성화, 레벨만 조정';
COMMENT ON COLUMN v2_test_keywords.search_mode IS '검색 모드 - goto(URL직접), search(검색창), auto(자동전환)';

COMMENT ON TABLE v2_execution_logs IS 'V2 실행 로그 - 상세 메트릭 포함';
COMMENT ON COLUMN v2_execution_logs.search_mode_reason IS '검색 모드 선택/전환 이유';
COMMENT ON COLUMN v2_execution_logs.traffic_mb IS '실제 네트워크 트래픽 (MB)';
COMMENT ON COLUMN v2_execution_logs.cached_mb IS '캐시에서 로드된 용량 (MB)';

-- 샘플 데이터 입력 (간소화된 구조)
INSERT INTO v2_test_keywords (keyword, suffix, product_code, agent, optimize_level, search_mode) 
VALUES 
    ('노트북', NULL, '76174145', 'default', 'balanced', 'auto'),
    ('노트북', '게이밍', '87654321', 'default', 'maximum', 'goto'),
    ('노트북', '업무용', '12345678', 'default', 'minimal', 'search');

-- 통계 뷰 생성
CREATE OR REPLACE VIEW v2_keyword_stats AS
SELECT 
    k.id,
    k.keyword,
    k.suffix,
    k.product_code,
    k.agent,
    k.optimize_level,
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

CREATE OR REPLACE VIEW v2_error_summary AS
SELECT 
    error_code,
    COUNT(*) as error_count,
    MAX(occurred_at) as last_occurred,
    COUNT(DISTINCT keyword_id) as affected_keywords,
    COUNT(DISTINCT agent) as affected_agents
FROM v2_error_logs
GROUP BY error_code
ORDER BY error_count DESC;

-- 실행 성능 요약 뷰
CREATE OR REPLACE VIEW v2_execution_performance AS
SELECT 
    agent,
    search_mode,
    optimize_level,
    COUNT(*) as total_executions,
    COUNT(CASE WHEN success = true THEN 1 END) as success_count,
    COUNT(CASE WHEN is_blocked = true THEN 1 END) as blocked_count,
    ROUND(AVG(duration_ms), 0) as avg_duration_ms,
    ROUND(AVG(traffic_mb), 2) as avg_traffic_mb,
    ROUND(AVG(cached_mb), 2) as avg_cached_mb,
    ROUND(AVG(blocked_requests), 0) as avg_blocked_requests
FROM v2_execution_logs
WHERE executed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
GROUP BY agent, search_mode, optimize_level
ORDER BY agent, search_mode, optimize_level;