/**
 * 샘플 테스트용 DB 서비스
 */

const pool = require('./pool');

/**
 * 사용 가능한 프록시 선택 (랜덤)
 * - last_sync_at이 90초 이내
 * - last_toggle_at이 240초 이내
 */
async function getAvailableProxy() {
    try {
        const query = `
            SELECT 
                id,
                server_ip,
                port,
                external_ip,
                last_sync_at,
                last_toggle_at
            FROM proxy_servers
            WHERE 
                last_sync_at >= NOW() - INTERVAL '90 seconds'
                AND last_toggle_at >= NOW() - INTERVAL '240 seconds'
                AND status = 'active'
                AND is_active = true
            ORDER BY RANDOM()
            LIMIT 1
        `;
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
            console.log('⚠️ 사용 가능한 프록시가 없습니다');
            return null;
        }
        
        const proxy = result.rows[0];
        const proxyUrl = `socks5://${proxy.server_ip}:${proxy.port}`;
        console.log(`✅ 프록시 선택: ID ${proxy.id} - ${proxyUrl} (외부IP: ${proxy.external_ip})`);
        
        return {
            id: proxy.id,
            server: proxyUrl,
            username: null,  // 인증 없는 SOCKS5
            password: null
        };
    } catch (error) {
        console.error('❌ 프록시 조회 실패:', error.message);
        return null;
    }
}

/**
 * 샘플 로그 테이블 생성 (없으면)
 */
async function createSampleLogTable() {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS sample_logs (
                id SERIAL PRIMARY KEY,
                proxy_id INT,
                keyword VARCHAR(255),
                product_id VARCHAR(100),
                product_name TEXT,
                cart_added BOOLEAN DEFAULT FALSE,
                success BOOLEAN,
                error_message TEXT,
                execution_time_ms INT,
                actual_ip VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `;
        
        await pool.query(createTableQuery);
        console.log('✅ 샘플 로그 테이블 준비 완료');
    } catch (error) {
        console.error('❌ 테이블 생성 실패:', error.message);
    }
}

/**
 * 샘플 실행 시작 로그
 */
async function logSampleStart(proxyId, keyword) {
    try {
        const query = `
            INSERT INTO sample_logs (proxy_id, keyword, success, created_at)
            VALUES ($1, $2, NULL, NOW())
            RETURNING id
        `;
        
        const result = await pool.query(query, [proxyId, keyword]);
        const logId = result.rows[0].id;
        console.log(`📝 로그 시작: ID ${logId}`);
        return logId;
    } catch (error) {
        console.error('❌ 시작 로그 실패:', error.message);
        return null;
    }
}

/**
 * 샘플 실행 완료 로그 업데이트
 */
async function logSampleComplete(logId, data) {
    try {
        const {
            productId,
            productName,
            cartAdded,
            success,
            errorMessage,
            executionTime,
            actualIp
        } = data;
        
        const query = `
            UPDATE sample_logs 
            SET 
                product_id = $2,
                product_name = $3,
                cart_added = $4,
                success = $5,
                error_message = $6,
                execution_time_ms = $7,
                actual_ip = $8
            WHERE id = $1
        `;
        
        await pool.query(query, [
            logId,
            productId,
            productName,
            cartAdded || false,
            success,
            errorMessage,
            executionTime,
            actualIp
        ]);
        
        console.log(`📝 로그 완료: ID ${logId} - ${success ? '성공' : '실패'}`);
    } catch (error) {
        console.error('❌ 완료 로그 실패:', error.message);
    }
}

/**
 * 실행 통계 조회
 */
async function getSampleStats() {
    try {
        const query = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN success = true THEN 1 END) as success_count,
                COUNT(CASE WHEN success = false THEN 1 END) as fail_count,
                AVG(execution_time_ms)::INT as avg_time_ms
            FROM sample_logs
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `;
        
        const result = await pool.query(query);
        const stats = result.rows[0];
        
        console.log('📊 최근 24시간 통계:');
        console.log(`   총 실행: ${stats.total}회`);
        console.log(`   성공: ${stats.success_count}회`);
        console.log(`   실패: ${stats.fail_count}회`);
        console.log(`   평균 시간: ${stats.avg_time_ms}ms`);
        
        return stats;
    } catch (error) {
        console.error('❌ 통계 조회 실패:', error.message);
        return null;
    }
}

module.exports = {
    getAvailableProxy,
    createSampleLogTable,
    logSampleStart,
    logSampleComplete,
    getSampleStats
};