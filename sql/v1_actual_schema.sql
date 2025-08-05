-- 실제 데이터베이스 구조 기반 v1 테이블 생성 스크립트
-- 작성일: 2025-08-05
-- 목적: 실제 운영 중인 데이터베이스 구조 반영

-- =====================================================
-- 1. v1_keywords 테이블 (실제 구조)
-- =====================================================
DROP TABLE IF EXISTS v1_keywords CASCADE;

CREATE TABLE v1_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword VARCHAR(200) NOT NULL,
    code VARCHAR(20),                       -- NULL 허용 (실제 DB 구조)
    agent VARCHAR(50) DEFAULT 'default',
    proxy VARCHAR(255),
    
    -- 실행 옵션
    cart BOOLEAN DEFAULT true,              -- 실제 DB 기본값
    userdata BOOLEAN DEFAULT true,          -- 실제 DB 기본값
    session BOOLEAN DEFAULT false,          -- 실제 DB 기본값
    cache BOOLEAN DEFAULT true,             -- 실제 DB 기본값
    gpu BOOLEAN DEFAULT false,              -- 실제 DB 기본값
    optimize BOOLEAN DEFAULT true,          -- 실제 DB 기본값
    
    -- 실행 통계
    max_runs INTEGER DEFAULT 100,
    runs INTEGER DEFAULT 0,
    succ INTEGER DEFAULT 0,
    fail INTEGER DEFAULT 0,
    
    -- 시간 정보
    last_run TIMESTAMP,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. v1_executions 테이블 (실제 구조)
-- =====================================================
DROP TABLE IF EXISTS v1_executions CASCADE;

CREATE TABLE v1_executions (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER,                     -- FK 제약조건 없음 (실제 구조)
    agent VARCHAR(50),
    executed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 실행 결과
    success BOOLEAN NOT NULL,
    error TEXT,
    duration INTEGER,                       -- 밀리초 단위
    
    -- 검색 정보
    query VARCHAR(200),
    found BOOLEAN,
    rank INTEGER,
    url_rank INTEGER,
    pages INTEGER,
    
    -- 클릭 정보
    cart BOOLEAN DEFAULT false,
    
    -- 네트워크 정보
    proxy VARCHAR(255),
    ip VARCHAR(50),
    traffic NUMERIC,                        -- DECIMAL 대신 NUMERIC 사용
    url TEXT,
    
    -- 실행 당시 설정값
    optimize BOOLEAN,
    session BOOLEAN,
    cache BOOLEAN,
    userdata BOOLEAN,
    gpu BOOLEAN,
    
    -- URL 파싱 정보
    item_id BIGINT,
    vendor_item_id BIGINT,
    real_rank INTEGER                       -- 실제 구조에 존재
);

-- =====================================================
-- 3. v1_errors 테이블 (실제 구조)
-- =====================================================
DROP TABLE IF EXISTS v1_errors CASCADE;

CREATE TABLE v1_errors (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100),
    message TEXT NOT NULL,
    occurred TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url TEXT,
    proxy VARCHAR(255),
    ip VARCHAR(50),
    keyword_id INTEGER,                     -- FK 제약조건 없음
    agent VARCHAR(50)
);

-- =====================================================
-- 인덱스 생성 (실제 존재하는 인덱스만)
-- =====================================================
-- v1_keywords 인덱스
CREATE INDEX idx_v1_keywords_agent ON v1_keywords(agent);
CREATE INDEX idx_v1_keywords_code ON v1_keywords(code);

-- v1_executions 인덱스
CREATE INDEX idx_v1_exec_agent ON v1_executions(agent);
CREATE INDEX idx_v1_exec_date ON v1_executions(executed);
CREATE INDEX idx_v1_exec_success ON v1_executions(success);
CREATE INDEX idx_v1_exec_traffic ON v1_executions(traffic);

-- v1_errors 인덱스
CREATE INDEX idx_v1_error_agent ON v1_errors(agent);
CREATE INDEX idx_v1_error_code ON v1_errors(code);
CREATE INDEX idx_v1_error_keyword ON v1_errors(keyword_id);

-- =====================================================
-- 통계 뷰 생성 (실제 존재하는 뷰들)
-- =====================================================
CREATE OR REPLACE VIEW v1_keyword_stats AS
SELECT 
    k.id,
    k.keyword,
    k.code,
    k.agent,
    k.runs as current_runs,
    k.max_runs,
    k.succ as success_count,
    k.fail as fail_count,
    CASE 
        WHEN (k.succ + k.fail) > 0 
        THEN ROUND((k.succ::NUMERIC / (k.succ + k.fail)) * 100, 2)
        ELSE 0 
    END as success_rate,
    k.last_run
FROM v1_keywords k
ORDER BY k.id;

CREATE OR REPLACE VIEW v1_execution_stats AS
SELECT 
    DATE(executed) as date,
    agent,
    COUNT(*) as total_runs,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as fail_count,
    ROUND(AVG(duration)/1000.0, 2) as avg_duration_sec,
    SUM(CASE WHEN cart THEN 1 ELSE 0 END) as cart_clicks,
    ROUND(AVG(traffic), 2) as avg_traffic_mb,
    SUM(traffic) as total_traffic_mb
FROM v1_executions
GROUP BY DATE(executed), agent
ORDER BY date DESC, agent;

CREATE OR REPLACE VIEW v1_error_summary AS
SELECT 
    code as error_code,
    COUNT(*) as error_count,
    MAX(occurred) as last_occurred,
    COUNT(DISTINCT keyword_id) as affected_keywords
FROM v1_errors
GROUP BY code
ORDER BY error_count DESC;

-- =====================================================
-- 컬럼 코멘트 추가
-- =====================================================
COMMENT ON TABLE v1_keywords IS '키워드 설정 테이블 (v1 스키마)';
COMMENT ON COLUMN v1_keywords.keyword IS '검색 키워드 (suffix 통합)';
COMMENT ON COLUMN v1_keywords.code IS '상품 코드 (NULL 허용)';
COMMENT ON COLUMN v1_keywords.cart IS '장바구니 클릭 여부';
COMMENT ON COLUMN v1_keywords.userdata IS '영구 프로필 사용 여부';
COMMENT ON COLUMN v1_keywords.session IS '세션 유지 여부';
COMMENT ON COLUMN v1_keywords.cache IS '캐시 유지 여부';
COMMENT ON COLUMN v1_keywords.gpu IS 'GPU 사용 여부';
COMMENT ON COLUMN v1_keywords.optimize IS '최적화 활성화 여부';

COMMENT ON TABLE v1_executions IS '실행 로그 테이블 (v1 스키마)';
COMMENT ON COLUMN v1_executions.duration IS '작업 실행 시간 (밀리초 단위)';
COMMENT ON COLUMN v1_executions.success IS '작업 성공 여부';
COMMENT ON COLUMN v1_executions.found IS '상품 발견 여부';
COMMENT ON COLUMN v1_executions.rank IS '상품 순위';
COMMENT ON COLUMN v1_executions.real_rank IS '실제 순위 (광고 제외)';
COMMENT ON COLUMN v1_executions.pages IS '검색한 페이지 수';
COMMENT ON COLUMN v1_executions.cart IS '장바구니 클릭 여부';
COMMENT ON COLUMN v1_executions.error IS '에러 메시지';
COMMENT ON COLUMN v1_executions.traffic IS '사용 트래픽 (MB)';
COMMENT ON COLUMN v1_executions.ip IS '실제 접속 IP';

COMMENT ON TABLE v1_errors IS '에러 로그 테이블 (v1 스키마)';
COMMENT ON COLUMN v1_errors.code IS '에러 코드';
COMMENT ON COLUMN v1_errors.message IS '에러 메시지';
COMMENT ON COLUMN v1_errors.occurred IS '발생 시간';