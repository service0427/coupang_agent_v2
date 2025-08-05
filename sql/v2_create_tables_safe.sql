-- v2 테이블 생성 스크립트 (안전 버전)
-- 기존 테이블이 있어도 오류 없이 실행되도록 IF NOT EXISTS 추가

-- v2_test_keywords 테이블
CREATE TABLE IF NOT EXISTS v2_test_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword VARCHAR(100) NOT NULL,
    suffix VARCHAR(100),
    product_code VARCHAR(20) NOT NULL,
    agent VARCHAR(50),
    profile_name VARCHAR(50),
    proxy_server VARCHAR(255),
    ip_change_enabled BOOLEAN DEFAULT false,
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
CREATE TABLE IF NOT EXISTS v2_execution_logs (
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
CREATE TABLE IF NOT EXISTS v2_error_logs (
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

-- 인덱스 생성 (IF NOT EXISTS 지원 안함, 에러 무시)
DO $$
BEGIN
    -- v2_test_keywords 인덱스
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_keywords_date') THEN
        CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_keywords_agent') THEN
        CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_keywords_code') THEN
        CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_keywords_executions') THEN
        CREATE INDEX idx_v2_keywords_executions ON v2_test_keywords(current_executions, max_executions);
    END IF;
    
    -- v2_execution_logs 인덱스
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_exec_keyword') THEN
        CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_exec_date') THEN
        CREATE INDEX idx_v2_exec_date ON v2_execution_logs(executed_at);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_exec_success') THEN
        CREATE INDEX idx_v2_exec_success ON v2_execution_logs(success);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_exec_agent') THEN
        CREATE INDEX idx_v2_exec_agent ON v2_execution_logs(agent);
    END IF;
    
    -- v2_error_logs 인덱스
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_error_date') THEN
        CREATE INDEX idx_v2_error_date ON v2_error_logs(occurred_at);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_error_keyword') THEN
        CREATE INDEX idx_v2_error_keyword ON v2_error_logs(keyword_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_error_code') THEN
        CREATE INDEX idx_v2_error_code ON v2_error_logs(error_code);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_v2_error_agent') THEN
        CREATE INDEX idx_v2_error_agent ON v2_error_logs(agent);
    END IF;
END $$;

-- 통계 뷰 생성 또는 교체
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

-- 테이블 생성 확인
SELECT 'v2_test_keywords' as table_name, COUNT(*) as record_count FROM v2_test_keywords
UNION ALL
SELECT 'v2_execution_logs', COUNT(*) FROM v2_execution_logs
UNION ALL
SELECT 'v2_error_logs', COUNT(*) FROM v2_error_logs;