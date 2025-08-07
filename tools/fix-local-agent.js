/**
 * local 에이전트 키워드 SEARCH 모드 전환
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function fixLocalAgent() {
  try {
    console.log('🔄 local 에이전트 키워드를 SEARCH 모드로 전환...');
    
    // ID 16 노트북 키워드를 SEARCH 모드로 강제 전환
    await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET current_mode = 'search',
          consecutive_blocks = 0,
          mode_execution_count = 0,
          last_mode_change = CURRENT_TIMESTAMP,
          mode_switch_reason = 'manual_local_fix'
      WHERE id = 16 AND agent = 'local'
    `);
    
    console.log('✅ [ID:16] 노트북 키워드를 SEARCH 모드로 전환 완료');
    
    // 확인
    const result = await dbServiceV2.query(`
      SELECT id, keyword, current_mode, consecutive_blocks, agent
      FROM v2_test_keywords 
      WHERE id = 16
    `);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`📋 현재 상태: ID:${row.id} ${row.keyword} - ${row.current_mode.toUpperCase()} 모드 (${row.agent})`);
      console.log(`   연속 차단: ${row.consecutive_blocks}회 (리셋됨)`);
    }
    
    console.log('\n🧪 이제 다음 명령어로 SEARCH 모드로 실행됩니다:');
    console.log('   node index.js --agent local --once --monitor --check-cookies');
    
  } catch (error) {
    console.error('❌ 전환 실패:', error.message);
  } finally {
    process.exit(0);
  }
}

fixLocalAgent();