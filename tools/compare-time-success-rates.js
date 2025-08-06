/**
 * 실행 시간대별 성공률 비교 도구
 * - 피크/오프피크 시간 성공률 차이
 * - 요일별 성공률 패턴
 * - 최적 실행 시간대 추천
 */

const dbService = require('../lib/services/db-service');

async function compareTimeSuccessRates(options = {}) {
  const {
    keywordId = null,
    days = 30,
    compareType = 'hour' // hour, dayofweek, date
  } = options;

  console.log('⏱️ 실행 시간대별 성공률 비교 분석');
  console.log('='.repeat(150));

  try {
    let whereClause = `WHERE el.created_at >= NOW() - INTERVAL '${days} days'`;
    const params = [];
    
    if (keywordId) {
      params.push(keywordId);
      whereClause += ` AND el.keyword_id = $${params.length}`;
    }

    // 1. 시간대별 성공률 비교
    if (compareType === 'hour' || compareType === 'all') {
      console.log('\n⏰ 시간대별 성공률 분석:');
      console.log('─'.repeat(150));
      
      const hourQuery = `
        WITH hourly_stats AS (
          SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
            AVG(execution_time) as avg_exec_time,
            AVG(page_load_time) as avg_page_load,
            AVG(total_network_size) as avg_network
          FROM v2_execution_logs el
          ${whereClause}
          GROUP BY hour
        )
        SELECT 
          hour,
          total,
          success,
          error,
          ROUND((success::NUMERIC / total) * 100, 2) as success_rate,
          ROUND(avg_exec_time, 2) as avg_exec_time,
          ROUND(avg_page_load, 2) as avg_page_load,
          ROUND(avg_network / 1024, 0) as avg_network_kb
        FROM hourly_stats
        WHERE total >= 5  -- 최소 5회 이상 실행된 시간대만
        ORDER BY hour
      `;
      
      const hourResult = await dbService.query(hourQuery, params);
      
      // 성공률 기준 최고/최저 찾기
      const bestHour = hourResult.rows.reduce((best, current) => 
        current.success_rate > (best?.success_rate || 0) ? current : best, null);
      const worstHour = hourResult.rows.reduce((worst, current) => 
        current.success_rate < (worst?.success_rate || 100) ? current : worst, null);
      
      console.log(
        '시간'.padEnd(8) + '| ' +
        '실행'.padEnd(6) + '| ' +
        '성공'.padEnd(6) + '| ' +
        '실패'.padEnd(6) + '| ' +
        '성공률'.padEnd(10) + '| ' +
        '실행시간'.padEnd(10) + '| ' +
        '페이지로드'.padEnd(12) + '| ' +
        '네트워크'.padEnd(10) + '| ' +
        '성능 그래프'
      );
      console.log('─'.repeat(150));
      
      hourResult.rows.forEach(row => {
        // 성공률 시각화
        const successBar = '🟢'.repeat(Math.round(row.success_rate / 10));
        const failBar = '🔴'.repeat(Math.round((100 - row.success_rate) / 10));
        
        // 최고/최저 표시
        let marker = '';
        if (row.hour === bestHour?.hour) marker = ' 🏆';
        if (row.hour === worstHour?.hour) marker = ' ⚠️';
        
        console.log(
          `${row.hour.toString().padStart(2, '0')}:00`.padEnd(8) + '| ' +
          row.total.toString().padEnd(6) + '| ' +
          row.success.toString().padEnd(6) + '| ' +
          row.error.toString().padEnd(6) + '| ' +
          `${row.success_rate}%`.padEnd(10) + '| ' +
          `${row.avg_exec_time}초`.padEnd(10) + '| ' +
          `${row.avg_page_load}초`.padEnd(12) + '| ' +
          `${row.avg_network_kb}KB`.padEnd(10) + '| ' +
          successBar + failBar + marker
        );
      });
      
      // 피크/오프피크 분석
      console.log('\n📊 피크 vs 오프피크 비교:');
      
      const peakHours = [9, 10, 11, 14, 15, 16, 19, 20, 21]; // 일반적인 피크 시간
      const peakStats = hourResult.rows.filter(r => peakHours.includes(r.hour));
      const offPeakStats = hourResult.rows.filter(r => !peakHours.includes(r.hour));
      
      if (peakStats.length > 0 && offPeakStats.length > 0) {
        const peakAvg = peakStats.reduce((sum, r) => sum + r.success_rate, 0) / peakStats.length;
        const offPeakAvg = offPeakStats.reduce((sum, r) => sum + r.success_rate, 0) / offPeakStats.length;
        
        console.log(`  피크 시간대 (${peakHours.join(', ')}시):`);
        console.log(`    평균 성공률: ${peakAvg.toFixed(2)}%`);
        console.log(`  오프피크 시간대:`);
        console.log(`    평균 성공률: ${offPeakAvg.toFixed(2)}%`);
        console.log(`  성공률 차이: ${Math.abs(peakAvg - offPeakAvg).toFixed(2)}%`);
      }
    }

    // 2. 요일별 성공률 비교
    if (compareType === 'dayofweek' || compareType === 'all') {
      console.log('\n📅 요일별 성공률 분석:');
      console.log('─'.repeat(120));
      
      const dayQuery = `
        WITH daily_stats AS (
          SELECT 
            TO_CHAR(created_at, 'Day') as day_name,
            EXTRACT(DOW FROM created_at) as day_num,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
            AVG(execution_time) as avg_exec_time
          FROM v2_execution_logs el
          ${whereClause}
          GROUP BY day_name, day_num
        )
        SELECT 
          day_name,
          day_num,
          total,
          success,
          error,
          ROUND((success::NUMERIC / total) * 100, 2) as success_rate,
          ROUND(avg_exec_time, 2) as avg_exec_time
        FROM daily_stats
        ORDER BY day_num
      `;
      
      const dayResult = await dbService.query(dayQuery, params);
      
      console.log(
        '요일'.padEnd(12) + '| ' +
        '실행'.padEnd(8) + '| ' +
        '성공'.padEnd(8) + '| ' +
        '실패'.padEnd(8) + '| ' +
        '성공률'.padEnd(10) + '| ' +
        '평균시간'.padEnd(10) + '| ' +
        '성능 그래프'
      );
      console.log('─'.repeat(120));
      
      const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      
      dayResult.rows.forEach(row => {
        const successBar = '🟩'.repeat(Math.round(row.success_rate / 5));
        
        console.log(
          dayNames[row.day_num].padEnd(12) + '| ' +
          row.total.toString().padEnd(8) + '| ' +
          row.success.toString().padEnd(8) + '| ' +
          row.error.toString().padEnd(8) + '| ' +
          `${row.success_rate}%`.padEnd(10) + '| ' +
          `${row.avg_exec_time}초`.padEnd(10) + '| ' +
          successBar
        );
      });
      
      // 주중/주말 비교
      const weekdayStats = dayResult.rows.filter(r => r.day_num >= 1 && r.day_num <= 5);
      const weekendStats = dayResult.rows.filter(r => r.day_num === 0 || r.day_num === 6);
      
      if (weekdayStats.length > 0 && weekendStats.length > 0) {
        const weekdayAvg = weekdayStats.reduce((sum, r) => sum + r.success_rate, 0) / weekdayStats.length;
        const weekendAvg = weekendStats.reduce((sum, r) => sum + r.success_rate, 0) / weekendStats.length;
        
        console.log('\n📊 주중 vs 주말 비교:');
        console.log(`  주중 평균 성공률: ${weekdayAvg.toFixed(2)}%`);
        console.log(`  주말 평균 성공률: ${weekendAvg.toFixed(2)}%`);
        console.log(`  차이: ${Math.abs(weekdayAvg - weekendAvg).toFixed(2)}%`);
      }
    }

    // 3. 날짜별 추세
    if (compareType === 'date' || compareType === 'all') {
      console.log('\n📈 최근 날짜별 성공률 추세:');
      console.log('─'.repeat(120));
      
      const dateQuery = `
        WITH daily_trend AS (
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
            ROUND(AVG(CASE WHEN status = 'completed' THEN 100 ELSE 0 END), 2) as success_rate
          FROM v2_execution_logs el
          ${whereClause}
          GROUP BY date
          ORDER BY date DESC
          LIMIT 14
        )
        SELECT * FROM daily_trend ORDER BY date
      `;
      
      const dateResult = await dbService.query(dateQuery, params);
      
      console.log(
        '날짜'.padEnd(12) + '| ' +
        '실행'.padEnd(8) + '| ' +
        '성공'.padEnd(8) + '| ' +
        '성공률'.padEnd(10) + '| ' +
        '추세'
      );
      console.log('─'.repeat(120));
      
      let prevRate = null;
      dateResult.rows.forEach(row => {
        const trend = prevRate !== null 
          ? (row.success_rate > prevRate ? '📈' : row.success_rate < prevRate ? '📉' : '➡️')
          : '➡️';
        
        const bar = '█'.repeat(Math.round(row.success_rate / 5));
        
        console.log(
          new Date(row.date).toLocaleDateString('ko-KR').padEnd(12) + '| ' +
          row.total.toString().padEnd(8) + '| ' +
          row.success.toString().padEnd(8) + '| ' +
          `${row.success_rate}%`.padEnd(10) + '| ' +
          trend + ' ' + bar
        );
        
        prevRate = row.success_rate;
      });
    }

    // 4. 최적 실행 시간 추천
    console.log('\n💡 최적 실행 시간 추천:');
    console.log('─'.repeat(150));
    
    const recommendQuery = `
      WITH time_performance AS (
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          TO_CHAR(created_at, 'Day') as day_name,
          COUNT(*) as runs,
          AVG(CASE WHEN status = 'completed' THEN 100 ELSE 0 END) as success_rate,
          AVG(execution_time) as avg_time,
          AVG(page_load_time) as page_load
        FROM v2_execution_logs el
        ${whereClause}
        GROUP BY hour, day_name
        HAVING COUNT(*) >= 3
      )
      SELECT 
        hour,
        ROUND(AVG(success_rate), 2) as avg_success_rate,
        ROUND(AVG(avg_time), 2) as avg_exec_time,
        COUNT(DISTINCT day_name) as days_tested
      FROM time_performance
      GROUP BY hour
      HAVING AVG(success_rate) > 70
      ORDER BY avg_success_rate DESC, avg_exec_time ASC
      LIMIT 5
    `;
    
    const recommendResult = await dbService.query(recommendQuery, params);
    
    if (recommendResult.rows.length > 0) {
      console.log('🏆 추천 실행 시간대 (성공률 > 70%):');
      recommendResult.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.hour.toString().padStart(2, '0')}:00 시`);
        console.log(`     - 평균 성공률: ${row.avg_success_rate}%`);
        console.log(`     - 평균 실행시간: ${row.avg_exec_time}초`);
        console.log(`     - 테스트된 요일 수: ${row.days_tested}일`);
      });
    } else {
      console.log('  충분한 데이터가 없습니다. 더 많은 실행 데이터가 필요합니다.');
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
  if (arg === '--keyword' && args[index + 1]) {
    options.keywordId = parseInt(args[index + 1]);
  } else if (arg === '--days' && args[index + 1]) {
    options.days = parseInt(args[index + 1]);
  } else if (arg === '--type' && args[index + 1]) {
    options.compareType = args[index + 1];
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node compare-time-success-rates.js [옵션]

옵션:
  --keyword <ID>    특정 키워드만 분석
  --days <숫자>     분석 기간 (기본: 30일)
  --type <타입>     비교 타입: hour, dayofweek, date, all (기본: hour)
  --help           도움말 표시

예시:
  node compare-time-success-rates.js --days 7 --type all
  node compare-time-success-rates.js --keyword 31 --type hour
  node compare-time-success-rates.js --type dayofweek
`);
  process.exit(0);
}

// 실행
compareTimeSuccessRates(options);