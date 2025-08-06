-- v2_test_keywords 컬럼명 및 기본값 수정
-- 사용자 요구사항에 따른 컬럼 조정

-- 1. use_persistent → userdata로 컬럼명 변경
ALTER TABLE v2_test_keywords RENAME COLUMN use_persistent TO userdata;

-- 2. clear_session 컬럼 제거 (기본값이 false였으므로 사용 안함)
ALTER TABLE v2_test_keywords DROP COLUMN clear_session;

-- 3. clear_cache 기본값을 true로 변경
ALTER TABLE v2_test_keywords ALTER COLUMN clear_cache SET DEFAULT true;

-- 4. 기존 clear_cache 값들을 true로 업데이트 (NULL인 경우)
UPDATE v2_test_keywords SET clear_cache = true WHERE clear_cache IS NULL;

-- 5. 샘플 데이터 재입력 (새로운 구조에 맞게)
DELETE FROM v2_test_keywords;

INSERT INTO v2_test_keywords (
    keyword, product_code, agent, 
    userdata, clear_cache, 
    search, optimize, cart_click_enabled
) VALUES 
    ('노트북', '76174145', 'test', true, true, false, true, false),
    ('노트북게이밍', '87654321', 'test', true, true, false, true, false),
    ('노트북업무용', '12345678', 'test', true, true, true, true, true);

-- 6. 결과 확인
SELECT '✅ 컬럼명 변경 완료: use_persistent → userdata' as status;
SELECT '✅ clear_session 컬럼 제거 완료' as status;
SELECT '✅ clear_cache 기본값 true로 변경 완료' as status;

-- 7. 변경된 구조 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'v2_test_keywords' 
  AND table_schema = 'public'
  AND column_name IN ('userdata', 'clear_cache', 'search', 'optimize')
ORDER BY column_name;

-- 8. 샘플 데이터 확인
SELECT 
    id, 
    keyword, 
    product_code, 
    userdata,
    clear_cache,
    search,
    optimize,
    cart_click_enabled,
    tracking_key
FROM v2_test_keywords 
ORDER BY id;