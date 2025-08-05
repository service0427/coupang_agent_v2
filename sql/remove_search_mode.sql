-- v1_agent_config 테이블에서 search_mode 컬럼 제거
-- v1_keywords.search 컬럼으로 이관됨에 따라 중복 제거

-- 컬럼 제거 전 현재 데이터 확인
SELECT 
    agent, 
    search_mode,
    test_name
FROM v1_agent_config 
WHERE search_mode = true;

-- search_mode 컬럼 제거
ALTER TABLE v1_agent_config 
DROP COLUMN IF EXISTS search_mode;

-- 변경 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'v1_agent_config' 
ORDER BY ordinal_position;

-- 최종 테이블 구조 확인
SELECT 
    agent,
    coupang_main_allow,
    front_cdn_allow,
    test_name,
    notes
FROM v1_agent_config 
ORDER BY agent;