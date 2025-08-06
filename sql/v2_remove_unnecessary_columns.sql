-- v2_test_keywords에서 불필요한 컬럼 제거
-- optimize: 무조건 활성화되고 컬럼에서 디테일 설정
-- search: 유동적으로 변경되므로 컬럼 불필요

-- 1. optimize 컬럼 제거 (무조건 활성화)
ALTER TABLE v2_test_keywords DROP COLUMN optimize;

-- 2. search 컬럼 제거 (유동적 변경)
ALTER TABLE v2_test_keywords DROP COLUMN search;

-- 3. 샘플 데이터 재입력 (optimize, search 제거)
DELETE FROM v2_test_keywords;

INSERT INTO v2_test_keywords (
    keyword, product_code, agent, 
    userdata, clear_cache, cart_click_enabled
) VALUES 
    -- 단순화된 설정: userdata=true (프로필 유지), clear_cache=false (캐시 유지)
    ('노트북', '76174145', 'test', true, false, false),
    ('노트북게이밍', '87654321', 'test', true, false, false),
    ('노트북업무용', '12345678', 'test', true, false, true);

-- 4. 결과 확인
SELECT '✅ optimize 컬럼 제거 완료 (무조건 활성화)' as status;
SELECT '✅ search 컬럼 제거 완료 (유동적 변경)' as status;

-- 5. 제거 후 테이블 구조 확인
SELECT 
    column_name, 
    data_type, 
    column_default, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'v2_test_keywords' 
  AND table_schema = 'public'
  AND column_name IN ('userdata', 'clear_cache', 'cart_click_enabled', 'optimize', 'search')
ORDER BY column_name;

-- 6. 최종 데이터 확인
SELECT 
    id, 
    keyword, 
    product_code, 
    userdata,
    clear_cache,
    cart_click_enabled,
    tracking_key,
    '(optimize는 무조건 활성화)' as optimize_info,
    '(search는 goto→search 유동적 변경)' as search_info
FROM v2_test_keywords 
ORDER BY id;