/**
 * 시간대별 실행 패턴 분석 도구
 * - 시간별 실행 빈도
 * - 시간대별 성공률 차이
 * - 피크/오프피크 시간 분석
 */

const dbService = require('../lib/services/db-service');

async function analyzeTimePatterns(options = {}) {
  const {
    keywordId = null,
    days = 7,
    groupBy = 'hour' // hour, day, week
  } = options;

  console.log('⏰ 시간대별 실행 패턴 분석');
  console.log('='.repeat(120));

  try {
    // 시간별 실행 통계
    let timeQuery;
    const params = [];
    
    if (groupBy === 'hour') {
      timeQuery = `
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as total_runs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
          ROUND(AVG(CASE WHEN status = 'completed' THEN 100 ELSE 0 END), 2) as success_rate,
          ROUND(AVG(CASE WHEN execution_time IS NOT NULL THEN execution_time ELSE 0 END), 2) as avg_exec_time
        FROM v2_execution_logs
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        ${keywordId ? `AND keyword_id = $1` : ''}
        GROUP BY hour
        ORDER BY hour
      `;
    } else if (groupBy === 'day') {
      timeQuery = `
        SELECT 
          TO_CHAR(created_at, 'Day') as day_name,
          EXTRACT(DOW FROM created_at) as day_num,
          COUNT(*) as total_runs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
          ROUND(AVG(CASE WHEN status = 'completed' THEN 100 ELSE 0 END), 2) as success_rate,
          ROUND(AVG(CASE WHEN execution_time IS NOT NULL THEN execution_time ELSE 0 END), 2) as avg_exec_time
        FROM v2_execution_logs
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        ${keywordId ? `AND keyword_id = $1` : ''}
        GROUP BY day_name, day_num
        ORDER BY day_num
      `;
    }

    if (keywordId) params.push(keywordId);
    
    const result = await dbService.query(timeQuery, params);
    
    // 헤더 출력
    console.log('\n' + '─'.repeat(120));
    if (groupBy === 'hour') {
      console.log(
        '시간대'.padEnd(10) + '| ' +
        '실행수'.padEnd(10) + '| ' +
        '성공'.padEnd(10) + '| ' +
        '실패'.padEnd(10) + '| ' +
        '성공률'.padEnd(10) + '| ' +
        '평균시간(초)'.padEnd(12) + '| ' +
        '그래프'
      );
    } else {
      console.log(
        '요일'.padEnd(12) + '| ' +
        '실행수'.padEnd(10) + '| ' +
        '성공'.padEnd(10) + '| ' +
        '실패'.padEnd(10) + '| ' +
        '성공률'.padEnd(10) + '| ' +
        '평균시간(초)'.padEnd(12) + '| ' +
        '그래프'
      );
    }
    console.log('─'.repeat(120));
    
    // 최대값 찾기 (그래프 스케일링용)
    const maxRuns = Math.max(...result.rows.map(r => r.total_runs));
    
    // 데이터 출력
    result.rows.forEach(row => {
      const barLength = Math.round((row.total_runs / maxRuns) * 40);
      const bar = '█'.repeat(barLength);
      
      if (groupBy === 'hour') {
        console.log(
          `${row.hour.toString().padStart(2, '0')}:00`.padEnd(10) + '| ' +
          row.total_runs.toString().padEnd(10) + '| ' +
          row.success_count.toString().padEnd(10) + '| ' +
          row.error_count.toString().padEnd(10) + '| ' +
          `${row.success_rate}%`.padEnd(10) + '| ' +
          row.avg_exec_time.toString().padEnd(12) + '| ' +
          bar
        );
      } else {
        console.log(
          row.day_name.trim().padEnd(12) + '| ' +
          row.total_runs.toString().padEnd(10) + '| ' +
          row.success_count.toString().padEnd(10) + '| ' +
          row.error_count.toString().padEnd(10) + '| ' +
          `${row.success_rate}%`.padEnd(10) + '| ' +
          row.avg_exec_time.toString().padEnd(12) + '| ' +
          bar
        );
      }
    });
    
    console.log('─'.repeat(120));
    
    // 피크/오프피크 분석
    if (groupBy === 'hour') {
      console.log('\n📊 피크 시간 분석:');
      
      const peakQuery = `
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as runs,
          ROUND(AVG(CASE WHEN status = 'completed' THEN 100 ELSE 0 END), 2) as success_rate
        FROM v2_execution_logs
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        ${keywordId ? `AND keyword_id = $1` : ''}
        GROUP BY hour
        ORDER BY runs DESC
        LIMIT 3
      `;
      
      const peakResult = await dbService.query(peakQuery, params);
      console.log('  🔝 피크 시간대 (실행 빈도 높음):');
      peakResult.rows.forEach(row => {
        console.log(`    - ${row.hour.toString().padStart(2, '0')}:00 → 실행: ${row.runs}회, 성공률: ${row.success_rate}%`);
      });
      
      const offPeakQuery = `
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as runs,
          ROUND(AVG(CASE WHEN status = 'completed' THEN 100 ELSE 0 END), 2) as success_rate
        FROM v2_execution_logs
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        ${keywordId ? `AND keyword_id = $1` : ''}
        GROUP BY hour
        HAVING COUNT(*) > 0
        ORDER BY runs ASC
        LIMIT 3
      `;
      
      const offPeakResult = await dbService.query(offPeakQuery, params);
      console.log('\n  🔻 오프피크 시간대 (실행 빈도 낮음):');
      offPeakResult.rows.forEach(row => {
        console.log(`    - ${row.hour.toString().padStart(2, '0')}:00 → 실행: ${row.runs}회, 성공률: ${row.success_rate}%`);
      });
    }
    
    // 시간대별 에러 유형 분포
    console.log('\n🔍 주요 시간대별 에러 유형:');
    const errorTypeQuery = `
      SELECT 
        EXTRACT(HOUR FROM el.created_at) as hour,
        er.error_type,
        COUNT(*) as error_count
      FROM v2_execution_logs el
      JOIN v2_error_logs er ON el.id = er.execution_id
      WHERE el.created_at >= NOW() - INTERVAL '${days} days'
      ${keywordId ? `AND el.keyword_id = $1` : ''}
      GROUP BY hour, er.error_type
      HAVING COUNT(*) > 5
      ORDER BY hour, error_count DESC
    `;
    
    const errorResult = await dbService.query(errorTypeQuery, params);
    let currentHour = -1;
    errorResult.rows.forEach(row => {
      if (row.hour !== currentHour) {
        currentHour = row.hour;
        console.log(`\n  ${row.hour.toString().padStart(2, '0')}:00 시간대:`);
      }
      console.log(`    - ${row.error_type}: ${row.error_count}회`);
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
  } else if (arg === '--group' && args[index + 1]) {
    options.groupBy = args[index + 1];
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-time-patterns.js [옵션]

옵션:
  --keyword <ID>    특정 키워드 ID만 분석
  --days <숫자>     분석할 기간 (기본: 7일)
  --group <타입>    그룹화 기준: hour(기본), day, week
  --help           도움말 표시

예시:
  node analyze-time-patterns.js --days 30 --group hour
  node analyze-time-patterns.js --keyword 31 --days 7
  node analyze-time-patterns.js --group day
`);
  process.exit(0);
}

// 실행
analyzeTimePatterns(options);