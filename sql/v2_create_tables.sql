-- v2 테이블 생성 스크립트
-- Chrome 전용 쿠팡 자동화 프로젝트

-- 기존 테이블 삭제 (있는 경우)
DROP TABLE IF EXISTS v2_execution_logs CASCADE;
DROP TABLE IF EXISTS v2_error_logs CASCADE;
DROP TABLE IF EXISTS v2_test_keywords CASCADE;

-- v2_test_keywords 테이블
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
    use_persistent BOOLEAN DEFAULT true,
    clear_session BOOLEAN DEFAULT false,
    gpu_disabled BOOLEAN DEFAULT false,
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
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
    pages_searched INTEGER,
    cart_clicked BOOLEAN DEFAULT false,
    cart_click_count INTEGER DEFAULT 0,
    error_message TEXT,
    duration_ms INTEGER,
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    final_url TEXT,
    search_query VARCHAR(200)
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

CREATE INDEX idx_v2_error_date ON v2_error_logs(occurred_at);
CREATE INDEX idx_v2_error_keyword ON v2_error_logs(keyword_id);
CREATE INDEX idx_v2_error_code ON v2_error_logs(error_code);
CREATE INDEX idx_v2_error_agent ON v2_error_logs(agent);

-- 샘플 데이터 입력
INSERT INTO v2_test_keywords (keyword, suffix, product_code, agent, use_persistent, clear_session) 
VALUES 
    ('노트북', NULL, '76174145', 'default', true, false),
    ('노트북', '게이밍', '87654321', 'default', true, false),
    ('노트북', '업무용', '12345678', 'default', true, false);

-- 통계 뷰 생성
CREATE OR REPLACE VIEW v2_keyword_stats AS
SELECT 
    k.id,
    k.keyword,
    k.suffix,
    k.product_code,
    k.agent,
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
    COUNT(DISTINCT keyword_id) as affected_keywords
FROM v2_error_logs
GROUP BY error_code
ORDER BY error_count DESC;