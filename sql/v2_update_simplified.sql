-- V2 테이블 단순화 업데이트 스크립트
-- execution_logs 테이블을 4단계 중심 구조로 변경

-- 백업 생성 (기존 데이터가 있는 경우)
CREATE TABLE IF NOT EXISTS v2_execution_logs_backup AS SELECT * FROM v2_execution_logs WHERE 1=2;

-- 기존 데이터 백업 (있다면)
INSERT INTO v2_execution_logs_backup SELECT * FROM v2_execution_logs;

-- 기존 테이블 삭제
DROP TABLE IF EXISTS v2_execution_logs CASCADE;

-- 새로운 단순화된 구조로 재생성
CREATE TABLE v2_execution_logs (
    id SERIAL PRIMARY KEY,
    session_id UUID DEFAULT gen_random_uuid(),
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    -- 추적 강화: 키워드와 상품코드 모두 기록
    keyword VARCHAR(100) NOT NULL,
    product_code VARCHAR(20) NOT NULL,
    tracking_key VARCHAR(150),
    
    -- 실행 시간 정보
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- 검색 모드 및 설정
    search_mode VARCHAR(20) DEFAULT 'goto', -- 'search' 또는 'goto'
    search_query VARCHAR(200),
    optimize_config_applied TEXT, -- JSON 형태
    
    -- 1단계: 상품 검색/이동 (search or goto)
    stage1_search_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    stage1_completed_at TIMESTAMP,
    stage1_duration_ms INTEGER,
    stage1_error_message TEXT,
    
    -- 2단계: 상품 찾기 (1~10페이지)
    stage2_find_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    stage2_completed_at TIMESTAMP,
    stage2_duration_ms INTEGER,
    stage2_pages_searched INTEGER DEFAULT 1,
    stage2_product_found_page INTEGER, -- 몇 페이지에서 찾았는지
    stage2_product_rank INTEGER, -- 페이지 내 순위
    stage2_total_products INTEGER, -- 검색된 총 상품 수
    stage2_error_message TEXT,
    
    -- 3단계: 상품 클릭
    stage3_click_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    stage3_completed_at TIMESTAMP,
    stage3_duration_ms INTEGER,
    stage3_click_attempts INTEGER DEFAULT 0,
    stage3_final_url TEXT, -- 클릭 후 최종 URL
    stage3_error_message TEXT,
    
    -- 4단계: 장바구니 클릭 (선택적)
    stage4_cart_status VARCHAR(20) DEFAULT 'not_required', -- not_required, pending, success, failed
    stage4_completed_at TIMESTAMP,
    stage4_duration_ms INTEGER,
    stage4_click_attempts INTEGER DEFAULT 0,
    stage4_error_message TEXT,
    
    -- 최종 결과
    final_status VARCHAR(30) NOT NULL, -- success, stage1_failed, stage2_failed, stage3_failed, stage4_failed
    overall_success BOOLEAN NOT NULL DEFAULT false,
    last_successful_stage INTEGER DEFAULT 0, -- 0=시작전, 1=검색완료, 2=상품발견, 3=클릭완료, 4=장바구니완료
    
    -- 오류 및 경고
    critical_error_message TEXT, -- 치명적 오류 (실행 중단)
    warning_messages TEXT[], -- 경고 메시지 배열
    
    -- 네트워크 및 프록시 정보
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    item_id BIGINT,
    vendor_item_id BIGINT,
    
    -- 네트워크 트래픽 통계 (요약)
    total_traffic_bytes BIGINT DEFAULT 0,
    total_traffic_mb NUMERIC(10,2) DEFAULT 0,
    blocked_requests_count INTEGER DEFAULT 0,
    traffic_summary TEXT -- JSON 형태 (간소화된 트래픽 정보)
);

-- 인덱스 재생성
CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id);
CREATE INDEX idx_v2_exec_tracking ON v2_execution_logs(tracking_key);
CREATE INDEX idx_v2_exec_date ON v2_execution_logs(started_at);
CREATE INDEX idx_v2_exec_success ON v2_execution_logs(overall_success);
CREATE INDEX idx_v2_exec_agent ON v2_execution_logs(agent);
CREATE INDEX idx_v2_exec_session ON v2_execution_logs(session_id);
CREATE INDEX idx_v2_exec_status ON v2_execution_logs(final_status);

-- 단계별 조회를 위한 인덱스
CREATE INDEX idx_v2_exec_stage1 ON v2_execution_logs(stage1_search_status);
CREATE INDEX idx_v2_exec_stage2 ON v2_execution_logs(stage2_find_status);
CREATE INDEX idx_v2_exec_stage3 ON v2_execution_logs(stage3_click_status);
CREATE INDEX idx_v2_exec_stage4 ON v2_execution_logs(stage4_cart_status);
CREATE INDEX idx_v2_exec_last_stage ON v2_execution_logs(last_successful_stage);

-- tracking_key 자동 생성 트리거 재적용
CREATE TRIGGER trigger_update_execution_tracking_key
    BEFORE INSERT OR UPDATE ON v2_execution_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_execution_tracking_key();

-- 뷰 재생성
DROP VIEW IF EXISTS v2_performance_stats CASCADE;
DROP VIEW IF EXISTS v2_stage_failure_analysis CASCADE;

-- 성능 통계 뷰 (단순화된 버전)
CREATE OR REPLACE VIEW v2_performance_stats AS
SELECT 
    tracking_key,
    agent,
    COUNT(*) as total_executions,
    AVG(duration_ms) as avg_duration_ms,
    AVG(stage1_duration_ms) as avg_search_ms,
    AVG(stage2_duration_ms) as avg_find_ms, 
    AVG(stage3_duration_ms) as avg_click_ms,
    AVG(stage4_duration_ms) as avg_cart_ms,
    AVG(total_traffic_mb) as avg_traffic_mb,
    AVG(CASE WHEN overall_success THEN 1.0 ELSE 0.0 END * 100) as success_rate,
    AVG(last_successful_stage) as avg_completion_stage,
    COUNT(CASE WHEN final_status = 'success' THEN 1 END) as full_success_count,
    COUNT(CASE WHEN final_status LIKE '%_failed' THEN 1 END) as failed_count,
    MAX(started_at) as last_execution
FROM v2_execution_logs
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY tracking_key, agent
ORDER BY total_executions DESC;

-- 단계별 실패 분석 뷰
CREATE OR REPLACE VIEW v2_stage_failure_analysis AS
SELECT 
    tracking_key,
    agent,
    COUNT(*) as total_attempts,
    -- 각 단계별 성공률
    AVG(CASE WHEN stage1_search_status = 'success' THEN 1.0 ELSE 0.0 END * 100) as stage1_success_rate,
    AVG(CASE WHEN stage2_find_status = 'success' THEN 1.0 ELSE 0.0 END * 100) as stage2_success_rate,
    AVG(CASE WHEN stage3_click_status = 'success' THEN 1.0 ELSE 0.0 END * 100) as stage3_success_rate,
    AVG(CASE WHEN stage4_cart_status IN ('success', 'not_required') THEN 1.0 ELSE 0.0 END * 100) as stage4_success_rate,
    -- 각 단계에서 실패한 횟수
    COUNT(CASE WHEN final_status = 'stage1_failed' THEN 1 END) as stage1_failures,
    COUNT(CASE WHEN final_status = 'stage2_failed' THEN 1 END) as stage2_failures,
    COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END) as stage3_failures,
    COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END) as stage4_failures,
    -- 상품 발견 페이지 분석
    AVG(stage2_product_found_page) as avg_found_page,
    MAX(stage2_product_found_page) as max_found_page,
    AVG(stage2_pages_searched) as avg_pages_searched,
    -- 가장 많이 실패하는 단계
    CASE 
        WHEN COUNT(CASE WHEN final_status = 'stage1_failed' THEN 1 END) >= 
             GREATEST(
                 COUNT(CASE WHEN final_status = 'stage2_failed' THEN 1 END),
                 COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END), 
                 COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END)
             ) THEN 'stage1_search'
        WHEN COUNT(CASE WHEN final_status = 'stage2_failed' THEN 1 END) >= 
             GREATEST(
                 COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END),
                 COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END)
             ) THEN 'stage2_find'
        WHEN COUNT(CASE WHEN final_status = 'stage3_failed' THEN 1 END) >= 
             COUNT(CASE WHEN final_status = 'stage4_failed' THEN 1 END) THEN 'stage3_click'
        ELSE 'stage4_cart'
    END as most_failed_stage
FROM v2_execution_logs
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY tracking_key, agent
ORDER BY total_attempts DESC;

-- 완료 메시지
SELECT '✅ V2 execution_logs 테이블 단순화 완료' as status;
SELECT '📊 4단계 중심 구조로 변경 완료 (search->find->click->cart)' as info;
SELECT '📈 단계별 실패 분석 뷰 추가됨' as info;