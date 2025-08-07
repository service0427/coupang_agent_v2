/**
 * 키워드별 모드 상태 확인 도구
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkKeywordMode(keywordId = null) {
  try {
    let query, params;
    
    if (keywordId) {
      query = `
        SELECT id, keyword, product_code, current_mode, consecutive_blocks, 
               mode_execution_count, total_blocks, last_mode_change, mode_switch_reason
        FROM v2_test_keywords 
        WHERE id = $1
      `;
      params = [keywordId];
    } else {
      query = `
        SELECT id, keyword, product_code, current_mode, consecutive_blocks, 
               mode_execution_count, total_blocks, last_mode_change, mode_switch_reason
        FROM v2_test_keywords 
        ORDER BY id
      `;
      params = [];
    }
    
    const result = await dbServiceV2.query(query, params);
    
    if (result.rows.length === 0) {
      console.log('❌ 키워드를 찾을 수 없습니다.');
      return;
    }
    
    console.log('🔍 키워드 모드 상태 확인\n');
    console.log('ID  | 키워드                   | 상품코드      | 모드   | 연속차단 | 모드실행 | 총차단 | 마지막변경');
    console.log('----+------------------------+-------------+-------+--------+--------+------+------------------');
    
    for (const row of result.rows) {
      const modeDisplay = row.current_mode === 'search' ? '🔍 검색' : '🔗 직접';
      const lastChange = row.last_mode_change ? new Date(row.last_mode_change).toLocaleDateString('ko-KR') : '-';
      
      console.log(
        `${row.id.toString().padStart(3)} | ${row.keyword.padEnd(22)} | ${(row.product_code || '').padEnd(11)} | ${modeDisplay} | ${row.consecutive_blocks.toString().padStart(6)} | ${row.mode_execution_count.toString().padStart(6)} | ${row.total_blocks.toString().padStart(4)} | ${lastChange}`
      );
    }
    
    // 모드별 통계
    const modeStats = await dbServiceV2.query(`
      SELECT current_mode, COUNT(*) as count, 
             AVG(consecutive_blocks) as avg_blocks,
             AVG(mode_execution_count) as avg_execution,
             SUM(total_blocks) as total_blocks
      FROM v2_test_keywords 
      GROUP BY current_mode
    `);
    
    console.log('\n📊 모드별 통계:');
    for (const stat of modeStats.rows) {
      const modeDisplay = stat.current_mode === 'search' ? '🔍 검색모드' : '🔗 직접모드';
      console.log(`${modeDisplay}: ${stat.count}개 키워드, 평균 연속차단 ${parseFloat(stat.avg_blocks).toFixed(1)}회, 평균 모드실행 ${parseFloat(stat.avg_execution).toFixed(1)}회, 총 차단 ${stat.total_blocks}회`);
    }
    
    // 특정 키워드의 모드 전환 예측
    if (keywordId && result.rows.length > 0) {
      const keyword = result.rows[0];
      console.log(`\n🔮 키워드 ID ${keywordId} 모드 전환 예측:`);
      
      if (keyword.current_mode === 'search') {
        const remaining = 20 - keyword.mode_execution_count;
        if (remaining > 0) {
          console.log(`   - 현재 검색모드에서 ${remaining}번 더 실행하면 직접모드로 전환됩니다.`);
        } else {
          console.log(`   - 이미 20회 이상 실행하여 다음 실행에서 직접모드로 전환될 수 있습니다.`);
        }
      } else {
        const remaining = 5 - keyword.consecutive_blocks;
        if (remaining > 0) {
          console.log(`   - 현재 직접모드에서 ${remaining}번 더 연속 차단되면 검색모드로 전환됩니다.`);
        } else {
          console.log(`   - 이미 5회 이상 연속 차단되어 다음 실행에서 검색모드로 전환될 수 있습니다.`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 키워드 모드 확인 실패:', error.message);
  }
}

// 명령행 인자 처리
const keywordId = process.argv[2] ? parseInt(process.argv[2]) : null;
checkKeywordMode(keywordId).then(() => process.exit(0));