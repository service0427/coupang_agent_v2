/**
 * 차단된 키워드 강제 SEARCH 모드 전환
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function forceModeSwitch() {
  try {
    console.log('🔄 차단된 키워드 강제 SEARCH 모드 전환\n');
    
    // 5회 이상 연속 차단된 키워드 찾기
    const result = await dbServiceV2.query(`
      SELECT id, keyword, consecutive_blocks, current_mode
      FROM v2_test_keywords 
      WHERE consecutive_blocks >= 5 AND current_mode = 'goto'
      ORDER BY consecutive_blocks DESC
    `);
    
    console.log(`📋 전환 대상: ${result.rows.length}개 키워드`);
    
    if (result.rows.length === 0) {
      console.log('✅ 전환할 키워드가 없습니다.');
      return;
    }
    
    // 각 키워드를 SEARCH 모드로 전환
    for (const row of result.rows) {
      console.log(`🔄 [ID:${row.id}] ${row.keyword} - ${row.consecutive_blocks}회 차단 → SEARCH 모드 전환`);
      
      await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET current_mode = 'search',
            mode_execution_count = 0,
            consecutive_blocks = 0,
            last_mode_change = CURRENT_TIMESTAMP,
            mode_switch_reason = 'manual_force_switch'
        WHERE id = $1
      `, [row.id]);
      
      console.log(`   ✅ 전환 완료`);
    }
    
    // 전환 후 상태 확인
    const afterResult = await dbServiceV2.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN current_mode = 'goto' THEN 1 END) as goto_count,
        COUNT(CASE WHEN current_mode = 'search' THEN 1 END) as search_count
      FROM v2_test_keywords
    `);
    
    const stats = afterResult.rows[0];
    
    console.log('\n📊 전환 후 현황:');
    console.log(`   전체 키워드: ${stats.total}개`);
    console.log(`   GOTO 모드: ${stats.goto_count}개`);
    console.log(`   SEARCH 모드: ${stats.search_count}개`);
    
    console.log('\n🧪 다음 실행에서 SEARCH 모드로 작동할 것입니다.');
    
  } catch (error) {
    console.error('❌ 모드 전환 실패:', error.message);
  } finally {
    process.exit(0);
  }
}

forceModeSwitch();