-- v2_test_keywords에서 기본값 고정 컬럼들 제거
-- userdata: 항상 true (프로필 유지) - 고정값이므로 컬럼 불필요
-- clear_cache: 항상 false (캐시 유지, session만 삭제) - 고정값이므로 컬럼 불필요

-- 1. userdata 컬럼 제거 (항상 true)
ALTER TABLE v2_test_keywords DROP COLUMN userdata;

-- 2. clear_cache 컬럼 제거 (항상 false)  
ALTER TABLE v2_test_keywords DROP COLUMN clear_cache;

-- 3. 샘플 데이터 재입력 (핵심 컬럼만)
DELETE FROM v2_test_keywords;

INSERT INTO v2_test_keywords (
    keyword, product_code, agent, cart_click_enabled
) VALUES 
    -- 최소한의 설정: cart_click_enabled만 남김
    -- userdata=true, clear_cache=false는 코드에서 하드코딩
    ('노트북', '76174145', 'test', false),
    ('노트북게이밍', '87654321', 'test', false),
    ('노트북업무용', '12345678', 'test', true);

-- 4. 결과 확인
SELECT '✅ userdata 컬럼 제거 완료 (하드코딩: true)' as status;
SELECT '✅ clear_cache 컬럼 제거 완료 (하드코딩: false)' as status;

-- 5. 최종 테이블 구조 확인 (핵심 컬럼만)
SELECT 
    column_name, 
    data_type, 
    column_default, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'v2_test_keywords' 
  AND table_schema = 'public'
  AND column_name IN ('keyword', 'product_code', 'agent', 'cart_click_enabled', 'tracking_key', 'userdata', 'clear_cache')
ORDER BY column_name;

-- 6. 최종 초심플 데이터 확인
SELECT 
    id, 
    keyword, 
    product_code, 
    agent,
    cart_click_enabled,
    tracking_key,
    '(userdata=true 하드코딩)' as userdata_info,
    '(clear_cache=false 하드코딩)' as clear_cache_info
FROM v2_test_keywords 
ORDER BY id;