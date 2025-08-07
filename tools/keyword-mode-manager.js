/**
 * 키워드별 검색 모드 관리 도구
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function manageKeywordModes() {
  try {
    console.log('🔧 키워드별 검색 모드 관리');
    console.log('─'.repeat(60));
    
    // 현재 test1 키워드들의 모드 상태 확인
    const result = await dbServiceV2.query(`
      SELECT id, keyword, current_mode, consecutive_blocks, mode_execution_count, 
             total_blocks, last_mode_change, mode_switch_reason
      FROM v2_test_keywords 
      WHERE agent = 'test1' 
      ORDER BY id
    `);
    
    if (result.rows.length > 0) {
      console.log('📋 현재 키워드별 모드 상태:');
      console.log('');
      
      result.rows.forEach(row => {
        const mode = (row.current_mode || 'goto').toUpperCase();
        const lastChange = row.last_mode_change ? 
          new Date(row.last_mode_change).toLocaleString('ko-KR') : '없음';
        
        console.log(`🔹 ID:${row.id} | ${row.keyword}`);
        console.log(`   현재 모드: ${mode} | 연속차단: ${row.consecutive_blocks}회 | 모드실행: ${row.mode_execution_count}회`);
        console.log(`   총 차단: ${row.total_blocks}회 | 마지막 변경: ${lastChange}`);
        console.log(`   변경 사유: ${row.mode_switch_reason || '없음'}`);
        console.log('');
      });
      
      // 모드 분포 통계
      const searchCount = result.rows.filter(row => row.current_mode === 'search').length;
      const gotoCount = result.rows.filter(row => (row.current_mode || 'goto') === 'goto').length;
      
      console.log('📊 모드 분포:');
      console.log(`   SEARCH 모드: ${searchCount}개`);
      console.log(`   GOTO 모드: ${gotoCount}개`);
      
      // 차단이 많은 키워드 확인
      const blockedKeywords = result.rows.filter(row => row.consecutive_blocks >= 3);
      if (blockedKeywords.length > 0) {
        console.log('\n⚠️ 차단 위험 키워드 (연속차단 3회 이상):');
        blockedKeywords.forEach(row => {
          console.log(`   ID:${row.id} | ${row.keyword} | ${row.consecutive_blocks}회`);
        });
      }
      
      console.log('\n🛠️ 모드 변경 명령어 예시:');
      console.log('──────────────────────────────────────');
      console.log('특정 키워드를 SEARCH 모드로 변경:');
      console.log(`UPDATE v2_test_keywords SET current_mode = 'search', consecutive_blocks = 0, mode_execution_count = 0 WHERE id = 20;`);
      console.log('');
      console.log('특정 키워드를 GOTO 모드로 변경:');
      console.log(`UPDATE v2_test_keywords SET current_mode = 'goto', consecutive_blocks = 0, mode_execution_count = 0 WHERE id = 20;`);
      console.log('');
      console.log('모든 test1 키워드를 GOTO 모드로 초기화:');
      console.log(`UPDATE v2_test_keywords SET current_mode = 'goto', consecutive_blocks = 0, mode_execution_count = 0 WHERE agent = 'test1';`);
      console.log('');
      console.log('모든 test1 키워드를 SEARCH 모드로 변경:');
      console.log(`UPDATE v2_test_keywords SET current_mode = 'search', consecutive_blocks = 0, mode_execution_count = 0 WHERE agent = 'test1';`);
      
    } else {
      console.log('test1 에이전트의 키워드가 없습니다.');
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

manageKeywordModes();