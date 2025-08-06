-- V2 검색 모드 관리 및 페이지 로딩 분석 테이블
-- 검색 모드 동적 전환 및 상세 로깅을 위한 스키마

-- 1. 검색 모드 상태 관리 테이블
CREATE TABLE IF NOT EXISTS v2_search_mode_status (
    agent VARCHAR(50) PRIMARY KEY,
    current_mode VARCHAR(20) DEFAULT 'goto' CHECK (current_mode IN ('goto', 'search')),
    goto_consecutive_blocks INTEGER DEFAULT 0,
    search_execution_count INTEGER DEFAULT 0,
    last_mode_change TIMESTAMP,
    total_goto_executions INTEGER DEFAULT 0,
    total_search_executions INTEGER DEFAULT 0,
    total_goto_blocks INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_search_mode_status_updated ON v2_search_mode_status(updated_at);

-- 2. 페이지 로딩 메트릭 테이블
CREATE TABLE IF NOT EXISTS v2_page_load_metrics (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES v2_execution_logs(id),
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    
    -- 클릭 단계
    click_attempted TIMESTAMP,
    click_success BOOLEAN DEFAULT false,
    click_method VARCHAR(20), -- 'human_click', 'fallback_click'
    click_error TEXT,
    click_duration_ms INTEGER,
    
    -- DOM 로딩 단계
    domcontentloaded_start TIMESTAMP,
    domcontentloaded_end TIMESTAMP,
    domcontentloaded_duration_ms INTEGER,
    domcontentloaded_success BOOLEAN DEFAULT false,
    domcontentloaded_timeout BOOLEAN DEFAULT false,
    
    -- 전체 로딩 단계
    load_start TIMESTAMP,
    load_end TIMESTAMP,
    load_duration_ms INTEGER,
    load_success BOOLEAN DEFAULT false,
    load_timeout BOOLEAN DEFAULT false,
    
    -- URL 전환 확인
    initial_url TEXT,
    final_url TEXT,
    url_changed BOOLEAN DEFAULT false,
    is_product_page BOOLEAN DEFAULT false,
    
    -- 핵심 요소 로딩 확인
    product_title_found BOOLEAN DEFAULT false,
    product_title_load_ms INTEGER,
    cart_button_found BOOLEAN DEFAULT false,
    cart_button_load_ms INTEGER,
    
    -- 에러 및 차단 감지
    error_type VARCHAR(50), -- 'timeout', 'blocked', 'network_error', 'click_error'
    error_message TEXT,
    is_blocked BOOLEAN DEFAULT false,
    
    -- 프록시 정보
    proxy_used VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_page_load_execution ON v2_page_load_metrics(execution_id);
CREATE INDEX idx_page_load_keyword ON v2_page_load_metrics(keyword_id);
CREATE INDEX idx_page_load_agent ON v2_page_load_metrics(agent);
CREATE INDEX idx_page_load_error_type ON v2_page_load_metrics(error_type);
CREATE INDEX idx_page_load_created ON v2_page_load_metrics(created_at);

-- 3. 기존 테이블 확장
-- v2_execution_logs 테이블에 검색 모드 관련 컬럼 추가
ALTER TABLE v2_execution_logs 
ADD COLUMN IF NOT EXISTS search_mode VARCHAR(20) DEFAULT 'goto',
ADD COLUMN IF NOT EXISTS search_mode_reason VARCHAR(50), -- 'initial', 'auto_switch_blocked', 'auto_switch_rotation'
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- 4. 검색 모드 전환 이력 테이블
CREATE TABLE IF NOT EXISTS v2_search_mode_history (
    id SERIAL PRIMARY KEY,
    agent VARCHAR(50),
    from_mode VARCHAR(20),
    to_mode VARCHAR(20),
    switch_reason VARCHAR(50),
    goto_blocks_before_switch INTEGER,
    search_executions_before_switch INTEGER,
    switched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_mode_history_agent ON v2_search_mode_history(agent);
CREATE INDEX idx_mode_history_switched ON v2_search_mode_history(switched_at);

-- 5. 분석용 뷰 생성

-- 페이지 로딩 성능 요약 뷰
CREATE OR REPLACE VIEW v2_page_load_summary AS
SELECT 
    agent,
    COUNT(*) as total_loads,
    COUNT(CASE WHEN click_success = true THEN 1 END) as click_success_count,
    COUNT(CASE WHEN domcontentloaded_success = true THEN 1 END) as dom_success_count,
    COUNT(CASE WHEN load_success = true THEN 1 END) as load_success_count,
    COUNT(CASE WHEN is_blocked = true THEN 1 END) as blocked_count,
    COUNT(CASE WHEN domcontentloaded_timeout = true THEN 1 END) as dom_timeout_count,
    COUNT(CASE WHEN load_timeout = true THEN 1 END) as load_timeout_count,
    AVG(CASE WHEN domcontentloaded_duration_ms > 0 THEN domcontentloaded_duration_ms END) as avg_dom_load_ms,
    AVG(CASE WHEN load_duration_ms > 0 THEN load_duration_ms END) as avg_full_load_ms,
    AVG(CASE WHEN product_title_load_ms > 0 THEN product_title_load_ms END) as avg_title_load_ms,
    MAX(created_at) as last_execution
FROM v2_page_load_metrics
GROUP BY agent;

-- 검색 모드 효과성 뷰
CREATE OR REPLACE VIEW v2_search_mode_effectiveness AS
SELECT 
    e.agent,
    e.search_mode,
    COUNT(*) as execution_count,
    COUNT(CASE WHEN e.success = true THEN 1 END) as success_count,
    COUNT(CASE WHEN e.is_blocked = true THEN 1 END) as blocked_count,
    ROUND(COUNT(CASE WHEN e.success = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as success_rate,
    ROUND(COUNT(CASE WHEN e.is_blocked = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as block_rate,
    AVG(e.duration_ms) as avg_duration_ms
FROM v2_execution_logs e
WHERE e.search_mode IS NOT NULL
GROUP BY e.agent, e.search_mode
ORDER BY e.agent, e.search_mode;

-- 초기 에이전트 상태 데이터 삽입
INSERT INTO v2_search_mode_status (agent)
SELECT DISTINCT agent FROM v1_agent_config
ON CONFLICT (agent) DO NOTHING;

-- 기본 에이전트 추가 (없는 경우)
INSERT INTO v2_search_mode_status (agent) VALUES 
('win11'), ('u24'), ('u22'), ('r10'), ('vm'), ('local'), ('default')
ON CONFLICT (agent) DO NOTHING;