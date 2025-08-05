-- v1_keywords 테이블에 search 컬럼 추가
-- --search CLI 옵션을 DB 기반으로 전환

-- search 컬럼 추가 (기본값: false)
ALTER TABLE v1_keywords 
ADD COLUMN IF NOT EXISTS search BOOLEAN DEFAULT false;

-- 기존 데이터에 대한 기본값 설정 (필요시)
UPDATE v1_keywords 
SET search = false 
WHERE search IS NULL;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_v1_keywords_search ON v1_keywords(search);

-- 설정 확인
SELECT 
    id,
    keyword,
    agent,
    search,
    optimize,
    date
FROM v1_keywords 
ORDER BY id
LIMIT 10;

-- 컬럼 정보 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'v1_keywords' 
  AND column_name = 'search';