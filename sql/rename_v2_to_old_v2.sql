-- 기존 V2 테이블을 OLD-V2로 이름 변경
-- 실행 전 반드시 백업하세요!

-- 1. 뷰 먼저 삭제 (의존성 때문에)
DROP VIEW IF EXISTS v2_keyword_stats;
DROP VIEW IF EXISTS v2_error_summary;
DROP VIEW IF EXISTS v2_execution_performance;
DROP VIEW IF EXISTS v2_optimize_performance;
DROP VIEW IF EXISTS v2_domain_block_analysis;
DROP VIEW IF EXISTS v2_search_mode_analysis;
DROP VIEW IF EXISTS v2_page_load_summary;
DROP VIEW IF EXISTS v2_search_mode_effectiveness;

-- 2. 외래키 제약조건 임시 해제
ALTER TABLE v2_execution_logs DROP CONSTRAINT IF EXISTS v2_execution_logs_keyword_id_fkey;
ALTER TABLE v2_error_logs DROP CONSTRAINT IF EXISTS v2_error_logs_keyword_id_fkey;
ALTER TABLE v2_page_load_metrics DROP CONSTRAINT IF EXISTS v2_page_load_metrics_execution_id_fkey;
ALTER TABLE v2_page_load_metrics DROP CONSTRAINT IF EXISTS v2_page_load_metrics_keyword_id_fkey;

-- 3. 테이블 이름 변경
ALTER TABLE IF EXISTS v2_test_keywords RENAME TO old_v2_test_keywords;
ALTER TABLE IF EXISTS v2_execution_logs RENAME TO old_v2_execution_logs;
ALTER TABLE IF EXISTS v2_error_logs RENAME TO old_v2_error_logs;
ALTER TABLE IF EXISTS v2_search_mode_status RENAME TO old_v2_search_mode_status;
ALTER TABLE IF EXISTS v2_search_mode_history RENAME TO old_v2_search_mode_history;
ALTER TABLE IF EXISTS v2_page_load_metrics RENAME TO old_v2_page_load_metrics;
ALTER TABLE IF EXISTS v2_config_log RENAME TO old_v2_config_log;

-- 4. 시퀀스 이름 변경
ALTER SEQUENCE IF EXISTS v2_test_keywords_id_seq RENAME TO old_v2_test_keywords_id_seq;
ALTER SEQUENCE IF EXISTS v2_execution_logs_id_seq RENAME TO old_v2_execution_logs_id_seq;
ALTER SEQUENCE IF EXISTS v2_error_logs_id_seq RENAME TO old_v2_error_logs_id_seq;
ALTER SEQUENCE IF EXISTS v2_search_mode_history_id_seq RENAME TO old_v2_search_mode_history_id_seq;
ALTER SEQUENCE IF EXISTS v2_page_load_metrics_id_seq RENAME TO old_v2_page_load_metrics_id_seq;
ALTER SEQUENCE IF EXISTS v2_config_log_id_seq RENAME TO old_v2_config_log_id_seq;

-- 5. 인덱스 이름 변경
ALTER INDEX IF EXISTS idx_v2_keywords_date RENAME TO idx_old_v2_keywords_date;
ALTER INDEX IF EXISTS idx_v2_keywords_agent RENAME TO idx_old_v2_keywords_agent;
ALTER INDEX IF EXISTS idx_v2_keywords_code RENAME TO idx_old_v2_keywords_code;
ALTER INDEX IF EXISTS idx_v2_keywords_executions RENAME TO idx_old_v2_keywords_executions;
ALTER INDEX IF EXISTS idx_v2_keywords_optimize RENAME TO idx_old_v2_keywords_optimize;

ALTER INDEX IF EXISTS idx_v2_exec_keyword RENAME TO idx_old_v2_exec_keyword;
ALTER INDEX IF EXISTS idx_v2_exec_date RENAME TO idx_old_v2_exec_date;
ALTER INDEX IF EXISTS idx_v2_exec_success RENAME TO idx_old_v2_exec_success;
ALTER INDEX IF EXISTS idx_v2_exec_agent RENAME TO idx_old_v2_exec_agent;
ALTER INDEX IF EXISTS idx_v2_exec_blocked RENAME TO idx_old_v2_exec_blocked;
ALTER INDEX IF EXISTS idx_v2_exec_search_mode RENAME TO idx_old_v2_exec_search_mode;

ALTER INDEX IF EXISTS idx_v2_error_date RENAME TO idx_old_v2_error_date;
ALTER INDEX IF EXISTS idx_v2_error_keyword RENAME TO idx_old_v2_error_keyword;
ALTER INDEX IF EXISTS idx_v2_error_code RENAME TO idx_old_v2_error_code;
ALTER INDEX IF EXISTS idx_v2_error_agent RENAME TO idx_old_v2_error_agent;

ALTER INDEX IF EXISTS idx_search_mode_status_updated RENAME TO idx_old_search_mode_status_updated;
ALTER INDEX IF EXISTS idx_mode_history_agent RENAME TO idx_old_mode_history_agent;
ALTER INDEX IF EXISTS idx_mode_history_switched RENAME TO idx_old_mode_history_switched;

ALTER INDEX IF EXISTS idx_page_load_execution RENAME TO idx_old_page_load_execution;
ALTER INDEX IF EXISTS idx_page_load_keyword RENAME TO idx_old_page_load_keyword;
ALTER INDEX IF EXISTS idx_page_load_agent RENAME TO idx_old_page_load_agent;
ALTER INDEX IF EXISTS idx_page_load_error_type RENAME TO idx_old_page_load_error_type;
ALTER INDEX IF EXISTS idx_page_load_created RENAME TO idx_old_page_load_created;

-- 6. 외래키 다시 생성 (old 테이블 참조)
ALTER TABLE old_v2_execution_logs 
ADD CONSTRAINT old_v2_execution_logs_keyword_id_fkey 
FOREIGN KEY (keyword_id) REFERENCES old_v2_test_keywords(id);

ALTER TABLE old_v2_error_logs 
ADD CONSTRAINT old_v2_error_logs_keyword_id_fkey 
FOREIGN KEY (keyword_id) REFERENCES old_v2_test_keywords(id);

ALTER TABLE old_v2_page_load_metrics 
ADD CONSTRAINT old_v2_page_load_metrics_execution_id_fkey 
FOREIGN KEY (execution_id) REFERENCES old_v2_execution_logs(id);

ALTER TABLE old_v2_page_load_metrics 
ADD CONSTRAINT old_v2_page_load_metrics_keyword_id_fkey 
FOREIGN KEY (keyword_id) REFERENCES old_v2_test_keywords(id);

-- 7. 확인
SELECT 
    'old_v2 테이블로 이름 변경 완료' as status,
    COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'old_v2_%';

-- 테이블 목록 확인
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'old_v2_%'
ORDER BY table_name;