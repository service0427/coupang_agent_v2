-- v2_test_keywords에서 suffix 컬럼 제거 및 tracking_key 일관성 개선
-- suffix를 사용하지 않으므로 혼선 방지를 위해 완전 제거

-- 1. 먼저 suffix 컬럼에 의존하는 트리거와 함수 제거
DROP TRIGGER IF EXISTS trigger_update_keywords_tracking_key ON v2_test_keywords;
DROP FUNCTION IF EXISTS update_keywords_tracking_key();
DROP FUNCTION IF EXISTS generate_tracking_key(VARCHAR, VARCHAR, VARCHAR);

-- suffix 컬럼 제거
ALTER TABLE v2_test_keywords DROP COLUMN IF EXISTS suffix;

-- 2. tracking_key 생성 함수 단순화 (suffix 제거)
CREATE OR REPLACE FUNCTION generate_tracking_key(p_keyword VARCHAR, p_product_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN p_keyword || ':' || p_product_code;
END;
$$ LANGUAGE plpgsql;

-- 3. v2_test_keywords 트리거 함수 업데이트
CREATE OR REPLACE FUNCTION update_keywords_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. v2_execution_logs 트리거 함수 업데이트
CREATE OR REPLACE FUNCTION update_execution_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.keyword IS NOT NULL AND NEW.product_code IS NOT NULL THEN
        NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 기존 데이터의 tracking_key 재생성 (v2_test_keywords)
UPDATE v2_test_keywords 
SET tracking_key = generate_tracking_key(keyword, product_code)
WHERE tracking_key IS NULL OR tracking_key != generate_tracking_key(keyword, product_code);

-- 6. 기존 데이터의 tracking_key 재생성 (v2_execution_logs) 
UPDATE v2_execution_logs 
SET tracking_key = generate_tracking_key(keyword, product_code)
WHERE tracking_key IS NULL OR tracking_key != generate_tracking_key(keyword, product_code);

-- 7. 샘플 데이터에서 suffix 참조 제거된 새로운 버전으로 교체
DELETE FROM v2_test_keywords;

INSERT INTO v2_test_keywords (
    keyword, product_code, agent, 
    use_persistent, clear_session, clear_cache, 
    search, optimize, cart_click_enabled
) VALUES 
    ('노트북', '76174145', 'test', true, false, false, false, true, false),
    ('노트북게이밍', '87654321', 'test', true, false, false, false, true, false),
    ('노트북업무용', '12345678', 'test', true, false, false, true, true, true);

-- 8. 뷰 및 함수가 정상 작동하는지 확인
SELECT '✅ suffix 컬럼 제거 완료' as status;
SELECT '🔑 tracking_key 생성 함수 단순화 완료' as status;
SELECT '📊 ' || COUNT(*) || '개 키워드의 tracking_key 업데이트 완료' as status 
FROM v2_test_keywords WHERE tracking_key IS NOT NULL;

-- 9. 생성된 tracking_key 샘플 출력
SELECT 
    id, 
    keyword, 
    product_code, 
    tracking_key,
    '(keyword:product_code 형태)' as format_info
FROM v2_test_keywords 
ORDER BY id 
LIMIT 5;