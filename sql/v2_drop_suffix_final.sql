-- suffix 컬럼 완전 제거 (강제 삭제)
-- 의존성이 있어도 CASCADE로 제거

-- 1. 모든 관련 트리거와 함수 제거
DROP TRIGGER IF EXISTS trigger_update_keywords_tracking_key ON v2_test_keywords CASCADE;
DROP FUNCTION IF EXISTS update_keywords_tracking_key() CASCADE;
DROP FUNCTION IF EXISTS generate_tracking_key(VARCHAR, VARCHAR, VARCHAR) CASCADE;

-- 2. 뷰도 제거 (suffix 참조 가능성)
DROP VIEW IF EXISTS v2_keyword_stats CASCADE;

-- 3. suffix 컬럼 강제 삭제
ALTER TABLE v2_test_keywords DROP COLUMN suffix CASCADE;

-- 4. 새로운 단순화된 함수들 생성
-- tracking_key 생성 함수 (2개 파라미터만)
CREATE OR REPLACE FUNCTION generate_tracking_key(p_keyword VARCHAR, p_product_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN p_keyword || ':' || p_product_code;
END;
$$ LANGUAGE plpgsql;

-- 5. v2_test_keywords 트리거 함수 재생성 (suffix 없이)
CREATE OR REPLACE FUNCTION update_keywords_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 트리거 재생성
CREATE TRIGGER trigger_update_keywords_tracking_key
    BEFORE INSERT OR UPDATE ON v2_test_keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_keywords_tracking_key();

-- 7. v2_execution_logs 트리거도 업데이트
CREATE OR REPLACE FUNCTION update_execution_tracking_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.keyword IS NOT NULL AND NEW.product_code IS NOT NULL THEN
        NEW.tracking_key := generate_tracking_key(NEW.keyword, NEW.product_code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. 뷰 재생성 (suffix 없이)
CREATE OR REPLACE VIEW v2_keyword_stats AS
SELECT 
    k.id,
    k.keyword,
    k.product_code,
    k.tracking_key,
    k.agent,
    k.current_executions,
    k.max_executions,
    k.success_count,
    k.fail_count,
    k.block_count,
    CASE 
        WHEN (k.success_count + k.fail_count) > 0 
        THEN ROUND((k.success_count::NUMERIC / (k.success_count + k.fail_count)) * 100, 2)
        ELSE 0 
    END as success_rate,
    k.last_executed_at,
    k.last_blocked_at
FROM v2_test_keywords k
ORDER BY k.id;

-- 9. 모든 tracking_key 재생성
UPDATE v2_test_keywords 
SET tracking_key = generate_tracking_key(keyword, product_code);

UPDATE v2_execution_logs 
SET tracking_key = generate_tracking_key(keyword, product_code)
WHERE keyword IS NOT NULL AND product_code IS NOT NULL;

-- 10. 완료 메시지
SELECT '✅ suffix 컬럼 완전 제거 완료' as status;
SELECT '🔧 단순화된 함수 및 트리거 재생성 완료' as status;

-- 11. 테이블 구조 확인
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'v2_test_keywords' 
  AND table_schema = 'public'
  AND column_name IN ('keyword', 'product_code', 'tracking_key')
ORDER BY column_name;