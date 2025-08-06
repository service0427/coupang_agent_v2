-- v2_test_keywords suffix 컬럼 일관성 수정
-- suffix를 사용하지 않으므로 모든 관련 로직을 NULL로 처리

-- 1. 기존 suffix 데이터를 NULL로 정리
UPDATE v2_test_keywords SET suffix = NULL;

-- 2. tracking_key 생성 함수를 suffix 없이 작동하도록 수정
CREATE OR REPLACE FUNCTION generate_tracking_key(p_keyword VARCHAR, p_suffix VARCHAR, p_product_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    -- suffix는 항상 무시하고 keyword:product_code 형태로 생성
    RETURN p_keyword || ':' || p_product_code;
END;
$$ LANGUAGE plpgsql;

-- 3. 단순화된 버전 (2개 인자)도 생성
CREATE OR REPLACE FUNCTION generate_tracking_key(p_keyword VARCHAR, p_product_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN p_keyword || ':' || p_product_code;
END;
$$ LANGUAGE plpgsql;

-- 4. v2_test_keywords 트리거 함수 업데이트 (suffix는 무시)
CREATE OR REPLACE FUNCTION update_keywords_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. v2_execution_logs 트리거 함수도 동일하게 업데이트
CREATE OR REPLACE FUNCTION update_execution_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.keyword IS NOT NULL AND NEW.product_code IS NOT NULL THEN
        NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 모든 기존 tracking_key 재생성
UPDATE v2_test_keywords 
SET tracking_key = generate_tracking_key(keyword, product_code)
WHERE keyword IS NOT NULL AND product_code IS NOT NULL;

UPDATE v2_execution_logs 
SET tracking_key = generate_tracking_key(keyword, product_code)
WHERE keyword IS NOT NULL AND product_code IS NOT NULL;

-- 7. 샘플 데이터를 suffix 없이 재생성
DELETE FROM v2_test_keywords;

INSERT INTO v2_test_keywords (
    keyword, product_code, agent, 
    use_persistent, clear_session, clear_cache, 
    search, optimize, cart_click_enabled
) VALUES 
    ('노트북', '76174145', 'test', true, false, false, false, true, false),
    ('노트북게이밍', '87654321', 'test', true, false, false, false, true, false),
    ('노트북업무용', '12345678', 'test', true, false, false, true, true, true);

-- 8. 결과 확인
SELECT '✅ suffix 데이터 NULL로 정리 완료' as status;
SELECT '🔑 tracking_key 생성 로직 일관성 확보' as status;
SELECT '📊 ' || COUNT(*) || '개 키워드의 tracking_key 업데이트 완료' as status 
FROM v2_test_keywords WHERE tracking_key IS NOT NULL;

-- 9. 생성된 tracking_key 샘플 출력  
SELECT 
    id, 
    keyword, 
    suffix,  -- NULL이어야 함
    product_code, 
    tracking_key,
    '(suffix는 무시되고 keyword:product_code 형태)' as info
FROM v2_test_keywords 
ORDER BY id;