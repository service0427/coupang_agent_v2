-- v1_agent_config 테이블 생성
-- 에이전트별 동적 설정 관리 (패턴 탐지 분석용)
CREATE TABLE IF NOT EXISTS v1_agent_config (
    id SERIAL PRIMARY KEY,
    agent VARCHAR(50) UNIQUE NOT NULL,
    
    -- 주요 도메인별 allow 설정 (JSON 배열 문자열 또는 NULL)
    -- NULL = 하드코딩된 기본값 사용
    coupang_main_allow TEXT,           -- www.coupang.com
    mercury_allow TEXT,                -- mercury.coupang.com  
    ljc_allow TEXT,                    -- ljc.coupang.com
    assets_cdn_allow TEXT,             -- assets.coupangcdn.com
    front_cdn_allow TEXT,              -- front.coupangcdn.com
    image_cdn_allow TEXT,              -- image*.coupangcdn.com
    static_cdn_allow TEXT,             -- static.coupangcdn.com
    img1a_cdn_allow TEXT,              -- img1a.coupangcdn.com
    thumbnail_cdn_allow TEXT,          -- thumbnail*.coupangcdn.com
    
    -- blockPatterns (JSON 배열 문자열 또는 NULL)
    coupang_main_block_patterns TEXT,  -- www.coupang.com blockPatterns
    
    -- 메모 및 실험 관리
    test_name VARCHAR(100),
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_agent_config_agent ON v1_agent_config(agent);
CREATE INDEX IF NOT EXISTS idx_agent_config_test_name ON v1_agent_config(test_name);

-- 기본 데이터 삽입 (현재 사용 중인 6개 에이전트)
-- 모든 설정값 NULL = 하드코딩된 기본값 사용
INSERT INTO v1_agent_config (agent, test_name, notes) VALUES
('win11', 'baseline_test', 'Windows 11 환경 - 기본 설정값 사용'),
('u24', 'baseline_test', 'Ubuntu 24 환경 - 기본 설정값 사용'),
('u22', 'baseline_test', 'Ubuntu 22 환경 - 기본 설정값 사용'),
('r10', 'baseline_test', 'Rocky 10 환경 - 기본 설정값 사용'),
('vm', 'baseline_test', 'VM 환경 - 기본 설정값 사용'),
('local', 'baseline_test', '로컬 환경 - 기본 설정값 사용')
ON CONFLICT (agent) DO NOTHING;

-- 실험 그룹별 설정 적용
-- 그룹 1: 최소 리소스만 (document만) - 패턴 탐지 최소화 테스트
UPDATE v1_agent_config 
SET test_name = 'minimal_document_only',
    coupang_main_allow = '["document"]',
    notes = 'www.coupang.com에서 document만 허용 - 최소 리소스 테스트'
WHERE agent IN ('win11', 'u24');

-- 그룹 2: API까지 허용 (document + xhr + fetch) - 기존 하드코딩 설정과 동일
UPDATE v1_agent_config 
SET test_name = 'document_api_allowed',
    coupang_main_allow = '["document", "xhr", "fetch"]',
    notes = 'www.coupang.com에서 document, xhr, fetch 허용 - 기본 설정 테스트'
WHERE agent IN ('u22', 'r10');

-- 그룹 3: 전체 허용 테스트 - 최대 허용 테스트
UPDATE v1_agent_config 
SET test_name = 'full_allow_test',
    coupang_main_allow = '["*"]',
    front_cdn_allow = '["script", "stylesheet"]',
    notes = 'www.coupang.com 전체 허용 + front CDN script,css 허용'
WHERE agent IN ('vm', 'local');

-- 설정 확인 쿼리
SELECT 
    agent,
    test_name,
    coupang_main_allow,
    front_cdn_allow,
    notes
FROM v1_agent_config 
ORDER BY agent;