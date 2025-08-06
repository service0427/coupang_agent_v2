const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkSearchModeStatus() {
  console.log('=== SearchMode 상태 확인 ===\n');
  
  try {
    // 에이전트 상태
    const statusResult = await dbServiceV2.query(`
      SELECT * FROM v2_search_mode_status ORDER BY agent
    `);
    
    console.log('📊 에이전트별 검색 모드 상태:');
    if (statusResult.rows.length === 0) {
      console.log('  등록된 에이전트가 없습니다.');
    } else {
      statusResult.rows.forEach(row => {
        console.log(`  ${row.agent}:`);
        console.log(`    현재 모드: ${row.current_mode}`);
        console.log(`    goto 연속 차단: ${row.goto_consecutive_blocks}회`);
        console.log(`    search 실행 카운트: ${row.search_execution_count}회`);
        console.log(`    총 goto 실행: ${row.total_goto_executions}회`);
        console.log(`    총 search 실행: ${row.total_search_executions}회`);
        console.log(`    총 goto 차단: ${row.total_goto_blocks}회`);
        console.log(`    마지막 전환: ${row.last_mode_change || '없음'}`);
        console.log('');
      });
    }
    
    // 전환 이력
    const historyResult = await dbServiceV2.query(`
      SELECT * FROM v2_search_mode_history ORDER BY switched_at DESC LIMIT 10
    `);
    
    console.log('📋 최근 검색 모드 전환 이력 (10개):');
    if (historyResult.rows.length === 0) {
      console.log('  전환 이력이 없습니다.');
    } else {
      historyResult.rows.forEach(row => {
        const date = new Date(row.switched_at).toLocaleString('ko-KR');
        console.log(`  ${row.agent}: ${row.from_mode} → ${row.to_mode}`);
        console.log(`    이유: ${row.switch_reason}`);
        console.log(`    전환 전 차단: ${row.goto_blocks_before_switch}회`);
        console.log(`    전환 전 search 실행: ${row.search_executions_before_switch}회`);
        console.log(`    시간: ${date}\n`);
      });
    }
    
  } catch (error) {
    console.error('에러:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkSearchModeStatus();