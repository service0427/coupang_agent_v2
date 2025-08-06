/**
 * 에러 타입별 상세 통계 분석 도구
 * - 에러 유형별 발생 빈도
 * - 키워드별 에러 패턴
 * - 시계열 에러 추이
 */

const dbService = require('../lib/services/db-service');

async function analyzeErrorDistribution(options = {}) {
  const {
    keywordId = null,
    days = 7,
    minOccurrence = 1,
    showDetails = false
  } = options;

  console.log('🔍 에러 타입별 상세 분석');
  console.log('='.repeat(150));

  try {
    // 1. 전체 에러 타입별 통계
    console.log('\n📊 에러 타입별 발생 통계:');
    console.log('─'.repeat(150));
    
    let whereClause = `WHERE el.created_at >= NOW() - INTERVAL '${days} days'`;
    const params = [];
    
    if (keywordId) {
      params.push(keywordId);
      whereClause += ` AND el.keyword_id = $${params.length}`;
    }
    
    const errorStatsQuery = `
      SELECT 
        er.error_type,
        COUNT(*) as occurrence_count,
        COUNT(DISTINCT el.keyword_id) as affected_keywords,
        COUNT(DISTINCT el.session_id) as affected_sessions,
        ROUND(COUNT(*)::NUMERIC / (
          SELECT COUNT(*) 
          FROM v2_execution_logs 
          WHERE status = 'error' 
            AND created_at >= NOW() - INTERVAL '${days} days'
            ${keywordId ? `AND keyword_id = $${params.length}` : ''}
        ) * 100, 2) as error_percentage,
        MIN(er.created_at) as first_seen,
        MAX(er.created_at) as last_seen
      FROM v2_error_logs er
      JOIN v2_execution_logs el ON er.execution_id = el.id
      ${whereClause}
      GROUP BY er.error_type
      HAVING COUNT(*) >= ${minOccurrence}
      ORDER BY occurrence_count DESC
    `;
    
    const errorStats = await dbService.query(errorStatsQuery, params);
    
    console.log(
      '에러 타입'.padEnd(35) + '| ' +
      '발생수'.padEnd(8) + '| ' +
      '영향 키워드'.padEnd(12) + '| ' +
      '영향 세션'.padEnd(10) + '| ' +
      '비율'.padEnd(8) + '| ' +
      '최초 발생'.padEnd(20) + '| ' +
      '최근 발생'
    );
    console.log('─'.repeat(150));
    
    errorStats.rows.forEach(row => {
      console.log(
        row.error_type.substring(0, 33).padEnd(35) + '| ' +
        row.occurrence_count.toString().padEnd(8) + '| ' +
        row.affected_keywords.toString().padEnd(12) + '| ' +
        row.affected_sessions.toString().padEnd(10) + '| ' +
        `${row.error_percentage}%`.padEnd(8) + '| ' +
        new Date(row.first_seen).toLocaleString('ko-KR').substring(0, 19).padEnd(20) + '| ' +
        new Date(row.last_seen).toLocaleString('ko-KR').substring(0, 19)
      );
    });
    
    // 2. 키워드별 주요 에러 패턴
    if (!keywordId) {
      console.log('\n📌 키워드별 주요 에러 패턴 (상위 10개):');
      console.log('─'.repeat(150));
      
      const keywordErrorQuery = `
        WITH keyword_errors AS (
          SELECT 
            tk.id,
            tk.keyword,
            er.error_type,
            COUNT(*) as error_count,
            RANK() OVER (PARTITION BY tk.id ORDER BY COUNT(*) DESC) as error_rank
          FROM v2_test_keywords tk
          JOIN v2_execution_logs el ON tk.id = el.keyword_id
          JOIN v2_error_logs er ON el.id = er.execution_id
          WHERE el.created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY tk.id, tk.keyword, er.error_type
        )
        SELECT 
          id,
          keyword,
          STRING_AGG(
            error_type || ' (' || error_count || ')', 
            ', ' 
            ORDER BY error_rank
          ) as top_errors,
          SUM(error_count) as total_errors
        FROM keyword_errors
        WHERE error_rank <= 3
        GROUP BY id, keyword
        ORDER BY total_errors DESC
        LIMIT 10
      `;
      
      const keywordErrors = await dbService.query(keywordErrorQuery);
      
      console.log(
        'ID'.padEnd(5) + '| ' +
        '키워드'.padEnd(30) + '| ' +
        '주요 에러 (발생수)'.padEnd(100) + '| ' +
        '총 에러'
      );
      console.log('─'.repeat(150));
      
      keywordErrors.rows.forEach(row => {
        console.log(
          row.id.toString().padEnd(5) + '| ' +
          row.keyword.substring(0, 28).padEnd(30) + '| ' +
          row.top_errors.substring(0, 98).padEnd(100) + '| ' +
          row.total_errors
        );
      });
    }
    
    // 3. 시간대별 에러 추이
    console.log('\n📈 시간대별 에러 발생 추이:');
    console.log('─'.repeat(120));
    
    const trendQuery = `
      SELECT 
        DATE_TRUNC('hour', er.created_at) as hour,
        er.error_type,
        COUNT(*) as error_count
      FROM v2_error_logs er
      JOIN v2_execution_logs el ON er.execution_id = el.id
      ${whereClause}
      GROUP BY hour, er.error_type
      ORDER BY hour DESC
      LIMIT 48
    `;
    
    const trendResult = await dbService.query(trendQuery, params);
    
    // 시간별로 그룹화
    const hourlyData = {};
    trendResult.rows.forEach(row => {
      const hourKey = new Date(row.hour).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = {};
      }
      hourlyData[hourKey][row.error_type] = row.error_count;
    });
    
    // 최근 24시간 출력
    console.log('시간'.padEnd(15) + '| ' + '에러 분포');
    console.log('─'.repeat(120));
    
    Object.entries(hourlyData).slice(0, 24).forEach(([hour, errors]) => {
      const errorSummary = Object.entries(errors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => `${type.substring(0, 20)}(${count})`)
        .join(', ');
      
      console.log(hour.padEnd(15) + '| ' + errorSummary);
    });
    
    // 4. 에러 메시지 샘플 (상세 모드)
    if (showDetails) {
      console.log('\n📝 최근 에러 메시지 샘플:');
      console.log('─'.repeat(150));
      
      const sampleQuery = `
        SELECT DISTINCT ON (er.error_type)
          er.error_type,
          er.error_message,
          tk.keyword,
          er.created_at
        FROM v2_error_logs er
        JOIN v2_execution_logs el ON er.execution_id = el.id
        JOIN v2_test_keywords tk ON el.keyword_id = tk.id
        ${whereClause}
        ORDER BY er.error_type, er.created_at DESC
        LIMIT 5
      `;
      
      const samples = await dbService.query(sampleQuery, params);
      
      samples.rows.forEach(row => {
        console.log(`\n🔸 ${row.error_type}`);
        console.log(`   키워드: ${row.keyword}`);
        console.log(`   시간: ${new Date(row.created_at).toLocaleString('ko-KR')}`);
        console.log(`   메시지: ${row.error_message?.substring(0, 200) || 'N/A'}`);
      });
    }
    
    // 5. 에러 해결 제안
    console.log('\n💡 주요 에러 유형별 대응 방안:');
    console.log('─'.repeat(150));
    
    const topErrors = errorStats.rows.slice(0, 5);
    topErrors.forEach(row => {
      console.log(`\n🔧 ${row.error_type} (${row.occurrence_count}회)`);
      
      // 에러 타입별 제안
      if (row.error_type.includes('timeout')) {
        console.log('   → 타임아웃 설정 증가 또는 페이지 로딩 최적화 필요');
      } else if (row.error_type.includes('selector')) {
        console.log('   → 셀렉터 업데이트 또는 동적 대기 로직 개선 필요');
      } else if (row.error_type.includes('network')) {
        console.log('   → 네트워크 재시도 로직 또는 프록시 설정 확인 필요');
      } else if (row.error_type.includes('navigation')) {
        console.log('   → 페이지 전환 로직 개선 또는 대기 시간 조정 필요');
      } else if (row.error_type.includes('resource')) {
        console.log('   → 리소스 차단 설정 조정 또는 메모리 관리 개선 필요');
      } else {
        console.log('   → 에러 로그 상세 분석 필요');
      }
    });
    
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
  if (arg === '--keyword' && args[index + 1]) {
    options.keywordId = parseInt(args[index + 1]);
  } else if (arg === '--days' && args[index + 1]) {
    options.days = parseInt(args[index + 1]);
  } else if (arg === '--min' && args[index + 1]) {
    options.minOccurrence = parseInt(args[index + 1]);
  } else if (arg === '--details') {
    options.showDetails = true;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-error-distribution.js [옵션]

옵션:
  --keyword <ID>    특정 키워드 ID만 분석
  --days <숫자>     분석할 기간 (기본: 7일)
  --min <숫자>      최소 발생 횟수 (기본: 1)
  --details        에러 메시지 샘플 표시
  --help           도움말 표시

예시:
  node analyze-error-distribution.js --days 30 --min 5
  node analyze-error-distribution.js --keyword 31 --details
  node analyze-error-distribution.js --days 1 --details
`);
  process.exit(0);
}

// 실행
analyzeErrorDistribution(options);