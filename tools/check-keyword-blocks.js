/**
 * 키워드별 차단 현황 확인 도구
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkKeywordBlocks() {
  try {
    console.log('🔍 키워드별 차단 현황 확인\n');
    
    // 차단 기록이 있는 키워드 조회
    const result = await dbServiceV2.query(`
      SELECT id, keyword, current_mode, consecutive_blocks, total_blocks, mode_execution_count,
             last_mode_change, mode_switch_reason
      FROM v2_test_keywords 
      WHERE consecutive_blocks > 0 OR total_blocks > 0
      ORDER BY consecutive_blocks DESC, total_blocks DESC
      LIMIT 20
    `);
    
    console.log('📊 차단 기록이 있는 키워드들:');
    console.log('ID\t키워드\t\t모드\t연속차단\t총차단\t실행수\t마지막변경');
    console.log('='.repeat(80));
    
    if (result.rows.length === 0) {
      console.log('❌ 차단 기록이 있는 키워드가 없습니다.');
      console.log('   → 차단 감지 로직이 작동하지 않을 수 있습니다.');
    } else {
      result.rows.forEach(row => {
        const lastChange = row.last_mode_change 
          ? new Date(row.last_mode_change).toLocaleString('ko-KR').split(' ')[0]
          : 'N/A';
        const keyword = row.keyword.length > 10 ? row.keyword.substring(0,10) + '...' : row.keyword;
        
        console.log(`${row.id}\t${keyword.padEnd(12)}\t${row.current_mode}\t${row.consecutive_blocks}\t\t${row.total_blocks}\t${row.mode_execution_count}\t${lastChange}`);
        
        // 5회 이상 연속 차단된 키워드 강조
        if (row.consecutive_blocks >= 5) {
          console.log(`   ⚠️  [ID:${row.id}] ${row.consecutive_blocks}회 연속 차단 - SEARCH 모드로 전환되어야 함!`);
        }
      });
    }
    
    // 전체 통계
    const statsResult = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total_keywords,
        COUNT(CASE WHEN current_mode = 'goto' THEN 1 END) as goto_count,
        COUNT(CASE WHEN current_mode = 'search' THEN 1 END) as search_count,
        COUNT(CASE WHEN consecutive_blocks >= 5 THEN 1 END) as should_switch_count,
        MAX(consecutive_blocks) as max_consecutive_blocks,
        SUM(total_blocks) as total_all_blocks
      FROM v2_test_keywords
    `);
    
    const stats = statsResult.rows[0];
    
    console.log('\n📈 전체 통계:');
    console.log(`   전체 키워드: ${stats.total_keywords}개`);
    console.log(`   GOTO 모드: ${stats.goto_count}개`);
    console.log(`   SEARCH 모드: ${stats.search_count}개`);
    console.log(`   전환 대상 (연속차단 5회+): ${stats.should_switch_count}개`);
    console.log(`   최대 연속 차단: ${stats.max_consecutive_blocks}회`);
    console.log(`   전체 차단 횟수: ${stats.total_all_blocks}회`);
    
    // 문제 진단
    console.log('\n🩺 문제 진단:');
    if (stats.should_switch_count > 0 && stats.search_count === 0) {
      console.log('❌ 모드 전환 로직 문제: 5회+ 차단된 키워드가 있지만 SEARCH 모드로 전환되지 않음');
      console.log('   → getSearchMode() 함수에서 전환 로직 확인 필요');
    } else if (stats.total_all_blocks === 0 || stats.total_all_blocks === null) {
      console.log('❌ 차단 감지 문제: 차단 기록이 전혀 없음');  
      console.log('   → recordKeywordBlock() 호출 여부 확인 필요');
    } else if (stats.search_count > 0) {
      console.log('✅ 모드 전환 시스템 정상 작동 중');
    } else {
      console.log('⚠️  차단은 기록되지만 아직 5회+ 연속 차단된 키워드 없음');
    }
    
  } catch (error) {
    console.error('❌ 확인 중 오류:', error.message);
  } finally {
    process.exit(0);
  }
}

checkKeywordBlocks();