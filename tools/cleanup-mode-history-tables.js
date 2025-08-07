/**
 * 불필요한 모드 히스토리 테이블들 정리
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function cleanupModeHistoryTables() {
  try {
    console.log('🧹 불필요한 모드 히스토리 테이블 정리');
    console.log('─'.repeat(50));
    
    // 1. 현재 상황 확인
    console.log('1️⃣ 정리 대상 테이블 확인:');
    
    try {
      const historyCount = await dbServiceV2.query('SELECT COUNT(*) as count FROM v2_search_mode_history');
      console.log(`   📋 v2_search_mode_history: ${historyCount.rows[0].count}개 레코드`);
    } catch (error) {
      console.log('   📋 v2_search_mode_history: 테이블 없음');
    }
    
    try {
      const backupCount = await dbServiceV2.query('SELECT COUNT(*) as count FROM v2_search_mode_status_backup');
      console.log(`   📋 v2_search_mode_status_backup: ${backupCount.rows[0].count}개 레코드`);
    } catch (error) {
      console.log('   📋 v2_search_mode_status_backup: 테이블 없음');
    }
    
    // 2. 현재 시스템에서 사용되는 로그들 확인
    console.log('\n2️⃣ 현재 시스템의 로그 현황:');
    
    // v2_execution_logs에서 search_mode 정보 확인 (boolean으로 수정)
    try {
      const execLogs = await dbServiceV2.query(`
        SELECT COUNT(*) as total_count, 
               COUNT(CASE WHEN search_mode = true THEN 1 END) as search_count
        FROM v2_execution_logs 
        WHERE agent = 'test1' AND started_at >= NOW() - INTERVAL '1 day'
      `);
      const exec = execLogs.rows[0];
      const gotoCount = exec.total_count - exec.search_count;
      console.log(`   ✅ v2_execution_logs (최근 1일):`);
      console.log(`      - 총 실행: ${exec.total_count}개`);
      console.log(`      - SEARCH 모드: ${exec.search_count}개`);
      console.log(`      - GOTO 모드: ${gotoCount}개`);
    } catch (error) {
      console.log('   ❌ v2_execution_logs 확인 실패:', error.message);
    }
    
    // v2_error_logs에서 차단 관련 정보 확인
    try {
      const errorLogs = await dbServiceV2.query(`
        SELECT COUNT(*) as block_count
        FROM v2_error_logs 
        WHERE agent = 'test1' 
          AND error_code = 'ERR_HTTP2_PROTOCOL_ERROR' 
          AND occurred_at >= NOW() - INTERVAL '1 day'
      `);
      console.log(`   ✅ v2_error_logs (최근 1일 차단): ${errorLogs.rows[0].block_count}개`);
    } catch (error) {
      console.log('   ❌ v2_error_logs 확인 실패:', error.message);
    }
    
    // v2_test_keywords의 키워드별 통계 확인
    try {
      const keywordStats = await dbServiceV2.query(`
        SELECT COUNT(*) as keyword_count,
               SUM(consecutive_blocks) as total_consecutive,
               SUM(total_blocks) as total_blocks_sum,
               COUNT(CASE WHEN current_mode = 'search' THEN 1 END) as search_mode_count
        FROM v2_test_keywords 
        WHERE agent = 'test1'
      `);
      const stats = keywordStats.rows[0];
      console.log(`   ✅ v2_test_keywords (키워드별 통계):`);
      console.log(`      - 총 키워드: ${stats.keyword_count}개`);
      console.log(`      - SEARCH 모드: ${stats.search_mode_count}개`);
      console.log(`      - 현재 연속차단 합계: ${stats.total_consecutive}회`);
      console.log(`      - 총 차단 합계: ${stats.total_blocks_sum}회`);
    } catch (error) {
      console.log('   ❌ v2_test_keywords 통계 확인 실패:', error.message);
    }
    
    // 3. 사용자 확인 후 테이블 제거
    console.log('\n3️⃣ 테이블 제거 결정:');
    console.log('📋 정리 사유:');
    console.log('   - v2_execution_logs에 모든 실행의 search_mode 정보 기록됨');
    console.log('   - v2_error_logs에 차단 정보 상세히 기록됨');
    console.log('   - v2_test_keywords에 키워드별 모드와 통계 보관됨');
    console.log('   - 히스토리는 위 3개 테이블 조인으로 충분히 분석 가능');
    
    console.log('\n4️⃣ 테이블 제거 실행:');
    
    // v2_search_mode_history 제거
    try {
      await dbServiceV2.query('DROP TABLE IF EXISTS v2_search_mode_history CASCADE');
      console.log('   ✅ v2_search_mode_history 테이블 제거 완료');
    } catch (error) {
      console.log('   ❌ v2_search_mode_history 제거 실패:', error.message);
    }
    
    // v2_search_mode_status_backup 제거
    try {
      await dbServiceV2.query('DROP TABLE IF EXISTS v2_search_mode_status_backup CASCADE');
      console.log('   ✅ v2_search_mode_status_backup 테이블 제거 완료');
    } catch (error) {
      console.log('   ❌ v2_search_mode_status_backup 제거 실패:', error.message);
    }
    
    console.log('\n✅ 모드 히스토리 테이블 정리 완료!');
    console.log('\n📊 앞으로 모드 관련 정보는 다음 테이블에서 확인:');
    console.log('   - v2_test_keywords: 키워드별 현재 모드와 통계');
    console.log('   - v2_execution_logs: 실행별 모드 기록');
    console.log('   - v2_error_logs: 차단/에러 상세 기록');
    
  } catch (error) {
    console.error('❌ 정리 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

cleanupModeHistoryTables();