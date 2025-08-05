-- v2에서 v1으로 데이터 마이그레이션 스크립트
-- 작성일: 2025-08-05
-- 주의: 실제 서비스에 적용 전 반드시 백업 필요

-- =====================================================
-- 0. 마이그레이션 전 데이터 확인
-- =====================================================
-- v2 테이블 데이터 건수 확인
SELECT 'v2_test_keywords' as table_name, COUNT(*) as row_count FROM v2_test_keywords
UNION ALL
SELECT 'v2_execution_logs', COUNT(*) FROM v2_execution_logs
UNION ALL
SELECT 'v2_error_logs', COUNT(*) FROM v2_error_logs;

-- =====================================================
-- 1. v2_test_keywords → v1_keywords 마이그레이션
-- =====================================================
-- 주의: boolean 값 반전 처리
-- clear_session=true → session=false (반전)
-- clear_cache=true → cache=false (반전)
-- gpu_disabled=true → gpu=false (반전)

INSERT INTO v1_keywords (
    id,
    date,
    keyword,
    code,           -- product_code → code
    agent,
    proxy,          -- proxy_server → proxy
    cart,           -- cart_click_enabled
    userdata,       -- use_persistent
    session,        -- NOT clear_session (반전)
    cache,          -- NOT clear_cache (반전)
    gpu,            -- NOT gpu_disabled (반전)
    optimize,
    max_runs,       -- max_executions
    runs,           -- current_executions
    succ,           -- success_count
    fail,           -- fail_count
    last_run,       -- last_executed_at
    created         -- created_at
)
SELECT 
    id,
    date,
    CASE 
        WHEN suffix IS NOT NULL AND suffix != '' 
        THEN keyword || ' ' || suffix  -- keyword와 suffix를 합침
        ELSE keyword
    END as keyword,
    product_code,  -- code로 매핑
    COALESCE(agent, 'default'),
    proxy_server,  -- proxy로 매핑
    COALESCE(cart_click_enabled, false),
    COALESCE(use_persistent, true),
    NOT COALESCE(clear_session, true),    -- 반전: clear_session=true → session=false
    NOT COALESCE(clear_cache, false),      -- 반전: clear_cache=true → cache=false  
    NOT COALESCE(gpu_disabled, false),     -- 반전: gpu_disabled=true → gpu=false
    COALESCE(optimize, false),
    COALESCE(max_executions, 100),
    COALESCE(current_executions, 0),
    COALESCE(success_count, 0),
    COALESCE(fail_count, 0),
    last_executed_at,
    created_at
FROM v2_test_keywords;

-- 시퀀스 동기화
SELECT setval('v1_keywords_id_seq', (SELECT MAX(id) FROM v1_keywords));

-- =====================================================
-- 2. v2_execution_logs → v1_executions 마이그레이션
-- =====================================================
INSERT INTO v1_executions (
    id,
    keyword_id,
    agent,
    executed,       -- executed_at
    success,
    error,          -- error_message
    duration,       -- duration_ms
    query,          -- search_query (suffix 통합)
    found,          -- product_found
    rank,           -- product_rank
    url_rank,
    real_rank,      -- NULL (새로운 필드)
    pages,          -- pages_searched
    cart,           -- cart_clicked
    proxy,          -- proxy_used
    ip,             -- actual_ip
    traffic,        -- actual_traffic_mb
    url,            -- final_url
    item_id,        -- NULL (새로운 필드)
    vendor_item_id, -- NULL (새로운 필드)
    optimize,       -- optimize_enabled
    session,        -- NOT clear_session (반전)
    cache,          -- NOT clear_cache (반전)
    userdata,       -- use_persistent
    gpu             -- NOT gpu_disabled (반전)
)
SELECT 
    e.id,
    e.keyword_id,
    e.agent,
    e.executed_at,
    e.success,
    e.error_message,
    e.duration_ms,
    e.search_query,     -- suffix가 이미 포함된 전체 검색어
    e.product_found,
    e.product_rank,
    e.url_rank,
    NULL,  -- real_rank (새로운 필드)
    e.pages_searched,
    COALESCE(e.cart_clicked, false),
    e.proxy_used,
    e.actual_ip,
    e.actual_traffic_mb,
    e.final_url,
    NULL,  -- item_id (새로운 필드)
    NULL,  -- vendor_item_id (새로운 필드)
    COALESCE(e.optimize_enabled, false),
    NOT COALESCE(e.clear_session, true),    -- 반전
    NOT COALESCE(e.clear_cache, false),      -- 반전
    COALESCE(e.use_persistent, true),
    NOT COALESCE(e.gpu_disabled, false)      -- 반전
FROM v2_execution_logs e;

-- 시퀀스 동기화
SELECT setval('v1_executions_id_seq', (SELECT MAX(id) FROM v1_executions));

-- =====================================================
-- 3. v2_error_logs → v1_errors 마이그레이션
-- =====================================================
INSERT INTO v1_errors (
    id,
    code,           -- error_code
    message,        -- error_message
    occurred,       -- occurred_at
    url,            -- page_url
    proxy,          -- proxy_used
    ip,             -- actual_ip
    keyword_id,
    agent
)
SELECT 
    id,
    error_code,
    error_message,
    occurred_at,
    page_url,
    proxy_used,
    actual_ip,
    keyword_id,
    agent
FROM v2_error_logs;

-- 시퀀스 동기화
SELECT setval('v1_errors_id_seq', (SELECT MAX(id) FROM v1_errors));

-- =====================================================
-- 4. 마이그레이션 후 데이터 검증
-- =====================================================
-- 데이터 건수 비교
SELECT 
    'Migration Summary' as status,
    (SELECT COUNT(*) FROM v2_test_keywords) as v2_keywords,
    (SELECT COUNT(*) FROM v1_keywords) as v1_keywords,
    (SELECT COUNT(*) FROM v2_execution_logs) as v2_executions,
    (SELECT COUNT(*) FROM v1_executions) as v1_executions,
    (SELECT COUNT(*) FROM v2_error_logs) as v2_errors,
    (SELECT COUNT(*) FROM v1_errors) as v1_errors;

-- Boolean 값 반전 확인 (샘플 5개)
SELECT 
    'Boolean Conversion Check' as check_type,
    v2.id,
    v2.clear_session as v2_clear_session,
    v1.session as v1_session,
    v2.clear_cache as v2_clear_cache,
    v1.cache as v1_cache,
    v2.gpu_disabled as v2_gpu_disabled,
    v1.gpu as v1_gpu
FROM v2_test_keywords v2
JOIN v1_keywords v1 ON v2.id = v1.id
LIMIT 5;

-- =====================================================
-- 5. 기존 테이블 삭제 (주의: 백업 필수!)
-- =====================================================
-- 아래 명령은 데이터 검증 후 수동으로 실행할 것을 권장

-- 기존 v1 테이블 삭제
-- DROP TABLE IF EXISTS error_logs CASCADE;
-- DROP TABLE IF EXISTS execution_logs CASCADE;
-- DROP TABLE IF EXISTS test_keywords CASCADE;
-- DROP TABLE IF EXISTS v1_click_logs CASCADE;
-- DROP TABLE IF EXISTS v1_products CASCADE;

-- v2 테이블 삭제 (마이그레이션 완료 후)
-- DROP TABLE IF EXISTS v2_error_logs CASCADE;
-- DROP TABLE IF EXISTS v2_execution_logs CASCADE;
-- DROP TABLE IF EXISTS v2_test_keywords CASCADE;