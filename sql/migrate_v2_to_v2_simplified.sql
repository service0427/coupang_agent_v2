-- V2 기존 테이블에서 V2 간소화 테이블로 마이그레이션
-- 
-- 변경사항:
-- 1. use_persistent, clear_session, clear_cache 컬럼 제거 (기본값으로 고정)
-- 2. optimize 컬럼을 optimize_level로 변경
-- 3. search_mode 관련 컬럼 추가

-- 1. 백업 테이블 생성
CREATE TABLE v2_test_keywords_backup AS SELECT * FROM v2_test_keywords;
CREATE TABLE v2_execution_logs_backup AS SELECT * FROM v2_execution_logs;

-- 2. 새로운 테이블로 데이터 마이그레이션

-- 임시 테이블 생성
CREATE TEMP TABLE v2_test_keywords_new AS
SELECT 
    id,
    date,
    keyword,
    suffix,
    product_code,
    agent,
    profile_name,
    proxy_server,
    ip_change_mode,
    cart_click_enabled,
    gpu_disabled,
    -- optimize 값에 따른 optimize_level 설정
    CASE 
        WHEN optimize = false THEN 'minimal'
        ELSE 'balanced'
    END as optimize_level,
    -- 기본 search_mode는 auto로 설정
    'auto'::VARCHAR(20) as search_mode,
    max_executions,
    current_executions,
    success_count,
    fail_count,
    last_executed_at,
    created_at
FROM v2_test_keywords;

-- 기존 테이블 제약조건 제거
ALTER TABLE v2_execution_logs DROP CONSTRAINT IF EXISTS v2_execution_logs_keyword_id_fkey;
ALTER TABLE v2_error_logs DROP CONSTRAINT IF EXISTS v2_error_logs_keyword_id_fkey;

-- 기존 테이블 삭제 및 새 테이블로 교체
DROP TABLE v2_test_keywords CASCADE;

-- 새 구조의 테이블 생성
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
    optimize_level VARCHAR(20) DEFAULT 'balanced' CHECK (optimize_level IN ('minimal', 'balanced', 'maximum')),
    search_mode VARCHAR(20) DEFAULT 'goto' CHECK (search_mode IN ('goto', 'search', 'auto')),
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 데이터 복사
INSERT INTO v2_test_keywords 
SELECT * FROM v2_test_keywords_new;

-- 시퀀스 동기화
SELECT setval('v2_test_keywords_id_seq', (SELECT MAX(id) FROM v2_test_keywords));

-- 3. v2_execution_logs 테이블 업데이트
ALTER TABLE v2_execution_logs 
DROP COLUMN IF EXISTS optimize_enabled,
DROP COLUMN IF EXISTS use_persistent,
DROP COLUMN IF EXISTS clear_session,
DROP COLUMN IF EXISTS clear_cache,
ADD COLUMN IF NOT EXISTS search_mode VARCHAR(20),
ADD COLUMN IF NOT EXISTS search_mode_reason VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS optimize_level VARCHAR(20),
ADD COLUMN IF NOT EXISTS traffic_mb NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS cached_mb NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS blocked_requests INTEGER,
ADD COLUMN IF NOT EXISTS real_rank INTEGER,
ADD COLUMN IF NOT EXISTS item_id BIGINT,
ADD COLUMN IF NOT EXISTS vendor_item_id BIGINT;

-- 외래키 다시 생성
ALTER TABLE v2_execution_logs 
ADD CONSTRAINT v2_execution_logs_keyword_id_fkey 
FOREIGN KEY (keyword_id) REFERENCES v2_test_keywords(id);

ALTER TABLE v2_error_logs 
ADD CONSTRAINT v2_error_logs_keyword_id_fkey 
FOREIGN KEY (keyword_id) REFERENCES v2_test_keywords(id);

-- 4. 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_v2_keywords_date ON v2_test_keywords(date);
CREATE INDEX IF NOT EXISTS idx_v2_keywords_agent ON v2_test_keywords(agent);
CREATE INDEX IF NOT EXISTS idx_v2_keywords_code ON v2_test_keywords(product_code);
CREATE INDEX IF NOT EXISTS idx_v2_keywords_executions ON v2_test_keywords(current_executions, max_executions);

CREATE INDEX IF NOT EXISTS idx_v2_exec_blocked ON v2_execution_logs(is_blocked);
CREATE INDEX IF NOT EXISTS idx_v2_exec_search_mode ON v2_execution_logs(search_mode);

-- 5. 코멘트 추가
COMMENT ON TABLE v2_test_keywords IS 'V2 키워드 테이블 - 간소화된 구조 (기본 정책: userdata=true, session=false, cache=true)';
COMMENT ON COLUMN v2_test_keywords.optimize_level IS '최적화 레벨 - V2에서는 항상 활성화, 레벨만 조정';
COMMENT ON COLUMN v2_test_keywords.search_mode IS '검색 모드 - goto(URL직접), search(검색창), auto(자동전환)';

-- 6. 마이그레이션 확인
SELECT 
    'Keywords' as table_name,
    COUNT(*) as row_count
FROM v2_test_keywords
UNION ALL
SELECT 
    'Executions' as table_name,
    COUNT(*) as row_count
FROM v2_execution_logs
UNION ALL
SELECT 
    'Errors' as table_name,
    COUNT(*) as row_count
FROM v2_error_logs;

-- 7. 새로운 뷰 생성
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

-- 마이그레이션 완료 메시지
SELECT '✅ V2 테이블 간소화 마이그레이션 완료!' as status,
       '기본 정책: userdata=true, session=false, cache=true' as policy,
       '백업 테이블: v2_test_keywords_backup, v2_execution_logs_backup' as backup_info;