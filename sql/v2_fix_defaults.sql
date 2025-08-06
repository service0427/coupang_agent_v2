-- v2_test_keywords 기본값 수정
-- 사용자 설명에 따른 올바른 기본값 설정

-- 1. userdata 기본값은 true여야 함 (삭제하지 않는다 = persistent 사용)
ALTER TABLE v2_test_keywords ALTER COLUMN userdata SET DEFAULT true;

-- 2. clear_cache 기본값은 false여야 함 (캐시는 유지하고 session만 삭제)
ALTER TABLE v2_test_keywords ALTER COLUMN clear_cache SET DEFAULT false;

-- 3. 기존 데이터의 clear_cache를 올바른 값으로 수정
-- cache는 유지해야 하므로 clear_cache = false
UPDATE v2_test_keywords SET clear_cache = false;

-- 4. 샘플 데이터 재입력 (올바른 기본값으로)
DELETE FROM v2_test_keywords;

INSERT INTO v2_test_keywords (
    keyword, product_code, agent, 
    userdata, clear_cache, 
    search, optimize, cart_click_enabled
) VALUES 
    -- 기본 설정: userdata=true (프로필 유지), clear_cache=false (캐시 유지)
    ('노트북', '76174145', 'test', true, false, false, true, false),
    ('노트북게이밍', '87654321', 'test', true, false, false, true, false),
    ('노트북업무용', '12345678', 'test', true, false, true, true, true);

-- 5. 결과 확인
SELECT '✅ userdata 기본값 true (프로필 유지)로 설정' as status;
SELECT '✅ clear_cache 기본값 false (캐시 유지)로 설정' as status;

-- 6. 변경된 기본값 확인
SELECT 
    column_name, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'v2_test_keywords' 
  AND table_schema = 'public'
  AND column_name IN ('userdata', 'clear_cache')
ORDER BY column_name;

-- 7. 샘플 데이터 확인
SELECT 
    id, 
    keyword, 
    product_code, 
    userdata,
    clear_cache,
    search,
    optimize,
    cart_click_enabled,
    tracking_key,
    CASE 
        WHEN userdata THEN '프로필 유지' 
        ELSE '프로필 삭제' 
    END as userdata_meaning,
    CASE 
        WHEN clear_cache THEN '캐시 삭제' 
        ELSE '캐시 유지' 
    END as clear_cache_meaning
FROM v2_test_keywords 
ORDER BY id;