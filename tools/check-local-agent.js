/**
 * local 에이전트 키워드 현황 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkLocalAgent() {
  try {
    const result = await dbServiceV2.query(`
      SELECT id, keyword, agent, current_mode, consecutive_blocks, total_blocks,
             current_executions, success_count, fail_count
      FROM v2_test_keywords 
      WHERE agent = 'local'
      ORDER BY id
    `);
    
    console.log('🔍 local 에이전트 키워드 현황:\n');
    console.log('ID\t키워드\t\t\t모드\t연속차단\t총차단\t실행\t성공\t실패');
    console.log('='.repeat(80));
    
    if (result.rows.length === 0) {
      console.log('❌ local 에이전트 키워드가 없습니다.');
      
      // 전체 에이전트 목록 확인
      const allAgents = await dbServiceV2.query(`
        SELECT DISTINCT agent, COUNT(*) as count
        FROM v2_test_keywords 
        GROUP BY agent
        ORDER BY agent
      `);
      
      console.log('\n📋 사용 가능한 에이전트:');
      allAgents.rows.forEach(row => {
        console.log(`   ${row.agent}: ${row.count}개 키워드`);
      });
      
    } else {
      result.rows.forEach(row => {
        const keyword = row.keyword.length > 15 ? row.keyword.substring(0,15) + '...' : row.keyword;
        console.log(`${row.id}\t${keyword.padEnd(18)}\t${row.current_mode}\t${row.consecutive_blocks}\t\t${row.total_blocks}\t${row.current_executions}\t${row.success_count}\t${row.fail_count}`);
      });
      
      // 차단이 많은 키워드 확인
      const blockedKeywords = result.rows.filter(row => row.consecutive_blocks >= 4);
      
      if (blockedKeywords.length > 0) {
        console.log('\n⚠️ 차단 위험 키워드:');
        blockedKeywords.forEach(row => {
          console.log(`   ID:${row.id} ${row.keyword} - ${row.consecutive_blocks}회 연속 차단`);
        });
      }
    }
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    process.exit(0);
  }
}

checkLocalAgent();