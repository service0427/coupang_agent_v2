/**
 * 세션별 상세 실행 로그 조회 도구
 * - 특정 세션의 전체 실행 흐름
 * - 키워드별 세션 히스토리
 * - 세션 간 성공률 비교
 */

const dbService = require('../lib/services/db-service');

async function viewSessionDetails(options = {}) {
  const {
    sessionId = null,
    keywordId = null,
    limit = 20,
    showErrors = true,
    showMetrics = true
  } = options;

  console.log('📋 세션별 상세 실행 로그');
  console.log('='.repeat(150));

  try {
    // 1. 특정 세션 상세 조회
    if (sessionId) {
      console.log(`\n🔍 세션 ID: ${sessionId} 상세 정보`);
      console.log('─'.repeat(150));
      
      const sessionQuery = `
        SELECT 
          el.id,
          tk.keyword,
          el.status,
          el.execution_time,
          el.created_at,
          el.updated_at,
          el.browser_id,
          el.proxy_used,
          el.page_load_time,
          el.total_network_size,
          el.blocked_resources_count
        FROM v2_execution_logs el
        JOIN v2_test_keywords tk ON el.keyword_id = tk.id
        WHERE el.session_id = $1
        ORDER BY el.created_at
      `;
      
      const sessionResult = await dbService.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0) {
        console.log('해당 세션을 찾을 수 없습니다.');
        return;
      }
      
      // 세션 요약
      const totalTime = sessionResult.rows.reduce((sum, r) => sum + (r.execution_time || 0), 0);
      const successCount = sessionResult.rows.filter(r => r.status === 'completed').length;
      const errorCount = sessionResult.rows.filter(r => r.status === 'error').length;
      
      console.log(`\n📊 세션 요약:`);
      console.log(`  - 실행 키워드 수: ${sessionResult.rows.length}개`);
      console.log(`  - 성공: ${successCount}개 (${(successCount/sessionResult.rows.length*100).toFixed(1)}%)`);
      console.log(`  - 실패: ${errorCount}개`);
      console.log(`  - 총 실행 시간: ${totalTime.toFixed(2)}초`);
      console.log(`  - 평균 실행 시간: ${(totalTime/sessionResult.rows.length).toFixed(2)}초`);
      
      // 실행 로그 출력
      console.log(`\n📜 실행 순서:`);
      console.log('─'.repeat(150));
      console.log(
        '순서'.padEnd(6) + '| ' +
        '시간'.padEnd(20) + '| ' +
        '키워드'.padEnd(30) + '| ' +
        '상태'.padEnd(12) + '| ' +
        '실행시간'.padEnd(10) + '| ' +
        '페이지로드'.padEnd(12) + '| ' +
        '네트워크'.padEnd(12) + '| ' +
        '차단리소스'
      );
      console.log('─'.repeat(150));
      
      sessionResult.rows.forEach((row, index) => {
        const statusIcon = row.status === 'completed' ? '✅' : '❌';
        const networkSize = row.total_network_size ? `${(row.total_network_size/1024).toFixed(0)}KB` : 'N/A';
        
        console.log(
          `#${(index + 1).toString().padEnd(5)}| ` +
          new Date(row.created_at).toLocaleString('ko-KR').substring(5, 24).padEnd(20) + '| ' +
          row.keyword.substring(0, 28).padEnd(30) + '| ' +
          `${statusIcon} ${row.status}`.padEnd(14) + '| ' +
          `${row.execution_time?.toFixed(2) || 'N/A'}초`.padEnd(10) + '| ' +
          `${row.page_load_time?.toFixed(2) || 'N/A'}초`.padEnd(12) + '| ' +
          networkSize.padEnd(12) + '| ' +
          (row.blocked_resources_count || 0).toString()
        );
      });
      
      // 에러 상세 (있는 경우)
      if (showErrors) {
        const errorQuery = `
          SELECT 
            er.error_type,
            er.error_message,
            tk.keyword,
            er.created_at
          FROM v2_error_logs er
          JOIN v2_execution_logs el ON er.execution_id = el.id
          JOIN v2_test_keywords tk ON el.keyword_id = tk.id
          WHERE el.session_id = $1
          ORDER BY er.created_at
        `;
        
        const errorResult = await dbService.query(errorQuery, [sessionId]);
        
        if (errorResult.rows.length > 0) {
          console.log(`\n❌ 발생 에러:`);
          console.log('─'.repeat(150));
          
          errorResult.rows.forEach(row => {
            console.log(`  [${new Date(row.created_at).toLocaleTimeString('ko-KR')}] ${row.keyword}`);
            console.log(`    에러: ${row.error_type}`);
            if (row.error_message) {
              console.log(`    메시지: ${row.error_message.substring(0, 100)}`);
            }
          });
        }
      }
      
    } else {
      // 2. 최근 세션 목록 조회
      let whereClause = '';
      const params = [];
      
      if (keywordId) {
        params.push(keywordId);
        whereClause = `WHERE el.keyword_id = $${params.length}`;
      }
      
      const sessionsQuery = `
        WITH session_stats AS (
          SELECT 
            session_id,
            MIN(created_at) as start_time,
            MAX(updated_at) as end_time,
            COUNT(*) as total_executions,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
            SUM(execution_time) as total_time,
            AVG(execution_time) as avg_time,
            AVG(page_load_time) as avg_page_load,
            SUM(total_network_size) as total_network,
            STRING_AGG(DISTINCT browser_id::TEXT, ', ') as browsers_used
          FROM v2_execution_logs el
          ${whereClause}
          GROUP BY session_id
          ORDER BY start_time DESC
          LIMIT ${limit}
        )
        SELECT * FROM session_stats
      `;
      
      const sessionsResult = await dbService.query(sessionsQuery, params);
      
      console.log('\n📅 최근 세션 목록:');
      console.log('─'.repeat(150));
      console.log(
        '세션 ID'.padEnd(38) + '| ' +
        '시작 시간'.padEnd(20) + '| ' +
        '실행수'.padEnd(8) + '| ' +
        '성공'.padEnd(6) + '| ' +
        '실패'.padEnd(6) + '| ' +
        '성공률'.padEnd(8) + '| ' +
        '총시간'.padEnd(10) + '| ' +
        '평균시간'.padEnd(10) + '| ' +
        '네트워크'
      );
      console.log('─'.repeat(150));
      
      sessionsResult.rows.forEach(row => {
        const successRate = row.total_executions > 0 
          ? (row.success_count / row.total_executions * 100).toFixed(1)
          : '0.0';
        const totalNetwork = row.total_network 
          ? `${(row.total_network / 1024 / 1024).toFixed(1)}MB`
          : 'N/A';
        
        console.log(
          row.session_id.substring(0, 36).padEnd(38) + '| ' +
          new Date(row.start_time).toLocaleString('ko-KR').substring(5, 24).padEnd(20) + '| ' +
          row.total_executions.toString().padEnd(8) + '| ' +
          row.success_count.toString().padEnd(6) + '| ' +
          row.error_count.toString().padEnd(6) + '| ' +
          `${successRate}%`.padEnd(8) + '| ' +
          `${row.total_time?.toFixed(1) || 'N/A'}초`.padEnd(10) + '| ' +
          `${row.avg_time?.toFixed(1) || 'N/A'}초`.padEnd(10) + '| ' +
          totalNetwork
        );
      });
      
      // 3. 세션 간 비교 메트릭
      if (showMetrics && sessionsResult.rows.length > 0) {
        console.log('\n📈 세션 성능 비교:');
        console.log('─'.repeat(120));
        
        const bestSession = sessionsResult.rows.reduce((best, current) => {
          const currentRate = current.success_count / current.total_executions;
          const bestRate = best.success_count / best.total_executions;
          return currentRate > bestRate ? current : best;
        });
        
        const worstSession = sessionsResult.rows.reduce((worst, current) => {
          const currentRate = current.success_count / current.total_executions;
          const worstRate = worst.success_count / worst.total_executions;
          return currentRate < worstRate ? current : worst;
        });
        
        console.log(`  🏆 최고 성공률 세션: ${bestSession.session_id.substring(0, 8)}... (${(bestSession.success_count/bestSession.total_executions*100).toFixed(1)}%)`);
        console.log(`  ⚠️  최저 성공률 세션: ${worstSession.session_id.substring(0, 8)}... (${(worstSession.success_count/worstSession.total_executions*100).toFixed(1)}%)`);
        
        const avgSuccessRate = sessionsResult.rows.reduce((sum, r) => 
          sum + (r.success_count / r.total_executions), 0) / sessionsResult.rows.length;
        console.log(`  📊 평균 성공률: ${(avgSuccessRate * 100).toFixed(1)}%`);
        
        // 시간대별 세션 분포
        console.log('\n⏰ 시간대별 세션 분포:');
        const hourDistribution = {};
        sessionsResult.rows.forEach(row => {
          const hour = new Date(row.start_time).getHours();
          hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
        });
        
        Object.entries(hourDistribution)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .forEach(([hour, count]) => {
            const bar = '█'.repeat(count);
            console.log(`  ${hour.padStart(2, '0')}시: ${bar} (${count}개)`);
          });
      }
    }
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 옵션 처리
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--session' && args[index + 1]) {
    options.sessionId = args[index + 1];
  } else if (arg === '--keyword' && args[index + 1]) {
    options.keywordId = parseInt(args[index + 1]);
  } else if (arg === '--limit' && args[index + 1]) {
    options.limit = parseInt(args[index + 1]);
  } else if (arg === '--no-errors') {
    options.showErrors = false;
  } else if (arg === '--no-metrics') {
    options.showMetrics = false;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node view-session-details.js [옵션]

옵션:
  --session <ID>    특정 세션 상세 조회
  --keyword <ID>    특정 키워드의 세션만 조회
  --limit <숫자>    표시할 세션 수 (기본: 20)
  --no-errors      에러 상세 정보 숨김
  --no-metrics     비교 메트릭 숨김
  --help           도움말 표시

예시:
  node view-session-details.js --limit 50
  node view-session-details.js --session abc-def-ghi-123
  node view-session-details.js --keyword 31 --limit 10
`);
  process.exit(0);
}

// 실행
viewSessionDetails(options);