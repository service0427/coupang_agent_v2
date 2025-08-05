-- v1_agent_config 분석 쿼리 모음
-- 패턴 탐지 분석을 위한 각종 통계 쿼리

-- 1. 전체 에이전트 설정 현황
SELECT 
    agent,
    test_name,
    search_mode,
    COALESCE(coupang_main_allow, 'DEFAULT') as coupang_main_allow,
    COALESCE(front_cdn_allow, 'DEFAULT') as front_cdn_allow,
    COALESCE(coupang_main_block_patterns, 'NONE') as block_patterns,
    notes,
    updated_at
FROM v1_agent_config 
ORDER BY agent;

-- 2. 최근 1시간 테스트 그룹별 성공률 분석
SELECT 
    ac.test_name,
    COUNT(DISTINCT ac.agent) as 에이전트수,
    COUNT(el.id) as 총실행,
    SUM(CASE WHEN el.success THEN 1 ELSE 0 END) as 성공,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률,
    ROUND(AVG(el.duration), 2) as 평균실행시간초,
    string_agg(DISTINCT ac.agent, ', ' ORDER BY ac.agent) as 에이전트목록
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '1 hour'
GROUP BY ac.test_name
ORDER BY 성공률 DESC NULLS LAST;

-- 3. 에이전트별 상세 성능 분석 (최근 1시간)
SELECT 
    ac.agent,
    ac.test_name,
    COALESCE(ac.coupang_main_allow, 'DEFAULT') as 설정,
    ac.search_mode as search모드,
    COUNT(el.id) as 실행수,
    SUM(CASE WHEN el.success THEN 1 ELSE 0 END) as 성공수,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률,
    ROUND(AVG(el.duration), 2) as 평균시간,
    ROUND(AVG(el.actual_traffic_mb), 2) as 평균트래픽MB
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '1 hour'
GROUP BY ac.agent, ac.test_name, ac.coupang_main_allow, ac.search_mode
ORDER BY ac.agent;

-- 4. 설정별 성공률 비교 (coupang_main_allow 기준)
SELECT 
    COALESCE(coupang_main_allow, 'DEFAULT') as 쿠팡메인설정,
    COUNT(DISTINCT ac.agent) as 에이전트수,
    COUNT(el.id) as 총실행,
    SUM(CASE WHEN el.success THEN 1 ELSE 0 END) as 성공,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '1 hour'
GROUP BY ac.coupang_main_allow
ORDER BY 성공률 DESC NULLS LAST;

-- 5. search_mode별 성능 비교
SELECT 
    search_mode as search모드,
    COUNT(DISTINCT ac.agent) as 에이전트수,
    COUNT(el.id) as 총실행,
    SUM(CASE WHEN el.success THEN 1 ELSE 0 END) as 성공,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률,
    ROUND(AVG(el.actual_traffic_mb), 2) as 평균트래픽MB
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '1 hour'
GROUP BY ac.search_mode
ORDER BY 성공률 DESC;

-- 6. 시간대별 성공률 추이 (최근 6시간, 30분 단위)
SELECT 
    DATE_TRUNC('hour', el.created_at) + 
    INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM el.created_at) / 30) as 시간대,
    ac.test_name,
    COUNT(el.id) as 실행수,
    SUM(CASE WHEN el.success THEN 1 ELSE 0 END) as 성공수,
    ROUND(AVG(CASE WHEN el.success THEN 1 ELSE 0 END) * 100, 2) as 성공률
FROM v1_agent_config ac
LEFT JOIN v1_execution_logs el ON ac.agent = el.agent 
    AND el.created_at > NOW() - INTERVAL '6 hours'
WHERE el.id IS NOT NULL
GROUP BY 시간대, ac.test_name
ORDER BY 시간대 DESC, ac.test_name;

-- 7. 오류 패턴 분석
SELECT 
    ac.test_name,
    COALESCE(ac.coupang_main_allow, 'DEFAULT') as 설정,
    el.error_message,
    COUNT(*) as 오류발생수,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY ac.test_name), 2) as 비율
FROM v1_agent_config ac
JOIN v1_execution_logs el ON ac.agent = el.agent 
WHERE el.success = false 
    AND el.created_at > NOW() - INTERVAL '2 hours'
    AND el.error_message IS NOT NULL
GROUP BY ac.test_name, ac.coupang_main_allow, el.error_message
HAVING COUNT(*) >= 2
ORDER BY ac.test_name, 오류발생수 DESC;

-- 8. 실험 설정 변경을 위한 템플릿 쿼리들

-- 특정 에이전트 설정 변경 예시
/*
-- 전체 허용으로 변경
UPDATE v1_agent_config 
SET coupang_main_allow = '["*"]',
    front_cdn_allow = '["*"]',
    test_name = 'full_allow_test',
    notes = '모든 리소스 허용 테스트',
    updated_at = NOW()
WHERE agent = 'win11';

-- blockPatterns 테스트
UPDATE v1_agent_config 
SET coupang_main_allow = '["document", "xhr", "fetch"]',
    coupang_main_block_patterns = '["/9U6eUwCw/", "/akam/"]',
    test_name = 'block_patterns_test',
    notes = 'blockPatterns로 특정 URL 차단 테스트',
    updated_at = NOW()
WHERE agent = 'u24';

-- search 모드 토글
UPDATE v1_agent_config 
SET search_mode = NOT search_mode,
    updated_at = NOW()
WHERE agent = 'local';

-- 원래대로 되돌리기 (NULL = 기본값)
UPDATE v1_agent_config 
SET coupang_main_allow = NULL,
    front_cdn_allow = NULL,
    coupang_main_block_patterns = NULL,
    search_mode = false,
    test_name = 'back_to_baseline',
    notes = '기본 설정으로 복원',
    updated_at = NOW()
WHERE agent = 'win11';
*/