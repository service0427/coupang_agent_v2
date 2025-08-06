/**
 * 노출/클릭 불일치 상세 분석 도구
 * [96/64/64/55] = [검색량/노출/클릭/장바구니]
 * - 검색량(96): 실제 검색 시도 횟수
 * - 노출(64): 상품이 검색 결과에 나타난 횟수 (found=true)
 * - 클릭(64): 상품 페이지 진입 성공
 * - 장바구니(55): 장바구니 추가 성공
 * 
 * 문제: 실제 성공(95)과 노출(64)의 차이 분석
 */

const dbService = require('../lib/services/db-service');

async function analyzeExposureClickMismatch(options = {}) {
  const {
    keywordId = 31,
    date = 'yesterday'
  } = options;

  // 날짜 설정
  let dateCondition;
  let dateDisplay;
  
  if (date === 'yesterday') {
    dateCondition = "DATE(executed) = CURRENT_DATE - INTERVAL '1 day'";
    dateDisplay = '어제';
  } else if (date === 'today') {
    dateCondition = "DATE(executed) = CURRENT_DATE";
    dateDisplay = '오늘';
  } else {
    dateCondition = `DATE(executed) = '${date}'`;
    dateDisplay = date;
  }

  console.log(`🔍 노출/클릭 불일치 상세 분석 - 키워드 ID: ${keywordId}`);
  console.log(`📅 분석 날짜: ${dateDisplay}`);
  console.log('='.repeat(150));

  try {
    // 1. 키워드 정보 및 기본 통계
    const keywordInfoQuery = `
      SELECT 
        k.id,
        k.keyword,
        k.code,
        
        -- v1_keywords의 기록값
        k.runs as recorded_runs,
        k.succ as recorded_succ,
        k.fail as recorded_fail,
        
        -- 실제 실행 통계
        (SELECT COUNT(*) FROM v1_executions e 
         WHERE e.keyword_id = k.id AND ${dateCondition}) as total_executions,
        
        (SELECT COUNT(*) FROM v1_executions e 
         WHERE e.keyword_id = k.id AND ${dateCondition} 
           AND e.success = true) as success_count,
        
        (SELECT COUNT(*) FROM v1_executions e 
         WHERE e.keyword_id = k.id AND ${dateCondition} 
           AND e.found = true) as found_count,
        
        (SELECT COUNT(*) FROM v1_executions e 
         WHERE e.keyword_id = k.id AND ${dateCondition} 
           AND e.cart = true) as cart_count,
        
        (SELECT COUNT(*) FROM v1_executions e 
         WHERE e.keyword_id = k.id AND ${dateCondition} 
           AND e.success = true AND e.found = false) as success_but_not_found,
        
        (SELECT COUNT(*) FROM v1_executions e 
         WHERE e.keyword_id = k.id AND ${dateCondition} 
           AND e.success = false AND e.found = true) as found_but_not_success
      FROM v1_keywords k
      WHERE k.id = $1
    `;
    
    const keywordInfo = await dbService.query(keywordInfoQuery, [keywordId]);
    
    if (keywordInfo.rows.length === 0) {
      console.log('해당 키워드를 찾을 수 없습니다.');
      await dbService.close();
      return;
    }
    
    const info = keywordInfo.rows[0];
    
    console.log('\n📊 키워드 기본 정보:');
    console.log('─'.repeat(120));
    console.log(`  키워드: ${info.keyword}`);
    console.log(`  코드: ${info.code || 'N/A'}`);
    console.log(`  기록값 형식: [검색량/노출/클릭/장바구니]`);
    
    // keyword 문자열에서 [96/64/64/55] 형식 파싱
    const match = info.keyword.match(/\[(\d+)\/(\d+)\/(\d+)\/(\d+)\]/);
    let parsed = null;
    if (match) {
      parsed = {
        search: parseInt(match[1]),
        exposure: parseInt(match[2]),
        click: parseInt(match[3]),
        cart: parseInt(match[4])
      };
      console.log(`  파싱된 값: [${parsed.search}/${parsed.exposure}/${parsed.click}/${parsed.cart}]`);
    }
    
    console.log('\n📈 실제 실행 통계:');
    console.log(`  총 실행: ${info.total_executions}회`);
    console.log(`  성공 (success=true): ${info.success_count}회`);
    console.log(`  상품 발견 (found=true): ${info.found_count}회`);
    console.log(`  장바구니 추가 (cart=true): ${info.cart_count}회`);
    
    console.log('\n⚠️ 불일치 케이스:');
    console.log(`  성공했지만 상품 미발견 (success=true, found=false): ${info.success_but_not_found}회`);
    console.log(`  상품 발견했지만 실패 (found=true, success=false): ${info.found_but_not_success}회`);

    // 2. 상세 실행 로그 분석
    console.log('\n📋 상세 실행 로그 분석:');
    console.log('─'.repeat(150));
    
    const detailQuery = `
      SELECT 
        id,
        executed,
        success,
        found,
        cart,
        rank,
        pages,
        error,
        duration,
        ip,
        proxy,
        url
      FROM v1_executions
      WHERE keyword_id = $1 AND ${dateCondition}
      ORDER BY executed
    `;
    
    const details = await dbService.query(detailQuery, [keywordId]);
    
    // success와 found 조합별 카운트
    const combinations = {
      'success_found': 0,      // 정상: 성공 + 발견
      'success_not_found': 0,   // 이상: 성공했는데 미발견
      'fail_found': 0,          // 이상: 실패했는데 발견
      'fail_not_found': 0       // 정상: 실패 + 미발견
    };
    
    const anomalies = [];
    
    details.rows.forEach(row => {
      if (row.success && row.found) {
        combinations.success_found++;
      } else if (row.success && !row.found) {
        combinations.success_not_found++;
        anomalies.push({
          id: row.id,
          time: row.executed,
          type: 'SUCCESS_WITHOUT_FOUND',
          rank: row.rank,
          pages: row.pages,
          error: row.error,
          url: row.url
        });
      } else if (!row.success && row.found) {
        combinations.fail_found++;
        anomalies.push({
          id: row.id,
          time: row.executed,
          type: 'FOUND_WITHOUT_SUCCESS',
          rank: row.rank,
          pages: row.pages,
          error: row.error,
          url: row.url
        });
      } else {
        combinations.fail_not_found++;
      }
    });
    
    console.log('\n📊 Success/Found 조합 분석:');
    console.log('─'.repeat(120));
    console.log(`  ✅ 정상 - 성공 + 발견 (success=true, found=true): ${combinations.success_found}회`);
    console.log(`  ⚠️ 이상 - 성공 + 미발견 (success=true, found=false): ${combinations.success_not_found}회`);
    console.log(`  ⚠️ 이상 - 실패 + 발견 (success=false, found=true): ${combinations.fail_found}회`);
    console.log(`  ✅ 정상 - 실패 + 미발견 (success=false, found=false): ${combinations.fail_not_found}회`);

    // 3. 이상 케이스 상세 분석
    if (anomalies.length > 0) {
      console.log('\n🔴 이상 케이스 상세:');
      console.log('─'.repeat(150));
      
      console.log(
        'ID'.padEnd(10) + '| ' +
        '시간'.padEnd(20) + '| ' +
        '유형'.padEnd(25) + '| ' +
        '순위'.padEnd(6) + '| ' +
        '페이지'.padEnd(8) + '| ' +
        'URL/에러'
      );
      console.log('─'.repeat(150));
      
      anomalies.slice(0, 20).forEach(anomaly => {
        const typeLabel = anomaly.type === 'SUCCESS_WITHOUT_FOUND' 
          ? '🟡 성공했지만 미발견' 
          : '🔴 발견했지만 실패';
        
        console.log(
          anomaly.id.toString().padEnd(10) + '| ' +
          new Date(anomaly.time).toLocaleTimeString('ko-KR').padEnd(20) + '| ' +
          typeLabel.padEnd(27) + '| ' +
          (anomaly.rank || 'N/A').toString().padEnd(6) + '| ' +
          (anomaly.pages || 'N/A').toString().padEnd(8) + '| ' +
          (anomaly.url || anomaly.error || 'N/A').substring(0, 50)
        );
      });
    }

    // 4. 매핑 분석
    console.log('\n📊 예상 매핑 vs 실제 데이터:');
    console.log('─'.repeat(120));
    
    if (parsed) {
      console.log('  키워드의 [검색/노출/클릭/장바구니] 값:');
      console.log(`    - 검색량: ${parsed.search} vs 실제 실행: ${info.total_executions} (차이: ${Math.abs(parsed.search - info.total_executions)})`);
      console.log(`    - 노출: ${parsed.exposure} vs 실제 found: ${info.found_count} (차이: ${Math.abs(parsed.exposure - info.found_count)})`);
      console.log(`    - 클릭: ${parsed.click} vs 실제 success: ${info.success_count} (차이: ${Math.abs(parsed.click - info.success_count)})`);
      console.log(`    - 장바구니: ${parsed.cart} vs 실제 cart: ${info.cart_count} (차이: ${Math.abs(parsed.cart - info.cart_count)})`);
    }

    // 5. 문제 진단
    console.log('\n💡 문제 진단:');
    console.log('─'.repeat(120));
    
    const foundSuccessGap = info.success_count - info.found_count;
    if (foundSuccessGap > 0) {
      console.log(`  🔍 주요 문제: success(${info.success_count}) > found(${info.found_count})`);
      console.log(`     → ${foundSuccessGap}개 케이스에서 성공했지만 found=false로 기록됨`);
      console.log('\n  가능한 원인:');
      console.log('    1. found 플래그 설정 로직 오류');
      console.log('    2. 상품 검색 결과 파싱 실패');
      console.log('    3. 랭킹 시스템과 found 플래그 불일치');
      console.log('    4. 페이지 로딩 완료 전 found 체크');
    }

    // 6. rank와 found 관계 분석
    console.log('\n📊 Rank와 Found 관계 분석:');
    console.log('─'.repeat(120));
    
    const rankFoundQuery = `
      SELECT 
        CASE 
          WHEN rank IS NULL THEN 'NULL'
          WHEN rank = 0 THEN '0'
          WHEN rank BETWEEN 1 AND 10 THEN '1-10'
          WHEN rank BETWEEN 11 AND 50 THEN '11-50'
          ELSE '50+'
        END as rank_group,
        COUNT(*) as total,
        SUM(CASE WHEN found THEN 1 ELSE 0 END) as found_count,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
        ROUND(AVG(CASE WHEN found THEN 100 ELSE 0 END), 2) as found_rate,
        ROUND(AVG(CASE WHEN success THEN 100 ELSE 0 END), 2) as success_rate
      FROM v1_executions
      WHERE keyword_id = $1 AND ${dateCondition}
      GROUP BY rank_group
      ORDER BY 
        CASE rank_group
          WHEN 'NULL' THEN 1
          WHEN '0' THEN 2
          WHEN '1-10' THEN 3
          WHEN '11-50' THEN 4
          ELSE 5
        END
    `;
    
    const rankFound = await dbService.query(rankFoundQuery, [keywordId]);
    
    console.log(
      '순위 그룹'.padEnd(12) + '| ' +
      '총 개수'.padEnd(8) + '| ' +
      'Found'.padEnd(8) + '| ' +
      'Success'.padEnd(8) + '| ' +
      'Found율'.padEnd(10) + '| ' +
      'Success율'
    );
    console.log('─'.repeat(120));
    
    rankFound.rows.forEach(row => {
      console.log(
        row.rank_group.padEnd(12) + '| ' +
        row.total.toString().padEnd(8) + '| ' +
        row.found_count.toString().padEnd(8) + '| ' +
        row.success_count.toString().padEnd(8) + '| ' +
        `${row.found_rate}%`.padEnd(10) + '| ' +
        `${row.success_rate}%`
      );
    });

    // 7. 시간대별 패턴
    console.log('\n⏰ 시간대별 Found/Success 패턴:');
    console.log('─'.repeat(120));
    
    const hourlyPatternQuery = `
      SELECT 
        EXTRACT(HOUR FROM executed) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN found THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN success AND NOT found THEN 1 ELSE 0 END) as anomaly
      FROM v1_executions
      WHERE keyword_id = $1 AND ${dateCondition}
      GROUP BY hour
      ORDER BY hour
    `;
    
    const hourlyPattern = await dbService.query(hourlyPatternQuery, [keywordId]);
    
    console.log(
      '시간'.padEnd(8) + '| ' +
      '실행'.padEnd(6) + '| ' +
      'Found'.padEnd(8) + '| ' +
      'Success'.padEnd(8) + '| ' +
      '이상케이스'
    );
    console.log('─'.repeat(120));
    
    hourlyPattern.rows.forEach(row => {
      const anomalyIcon = row.anomaly > 0 ? '⚠️' : '✅';
      
      console.log(
        `${row.hour.toString().padStart(2, '0')}:00`.padEnd(8) + '| ' +
        row.total.toString().padEnd(6) + '| ' +
        row.found.toString().padEnd(8) + '| ' +
        row.success.toString().padEnd(8) + '| ' +
        `${anomalyIcon} ${row.anomaly}`
      );
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
  } else if (arg === '--date' && args[index + 1]) {
    options.date = args[index + 1];
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-exposure-click-mismatch.js [옵션]

옵션:
  --keyword <ID>    분석할 키워드 ID (기본: 31)
  --date <날짜>     분석할 날짜 (yesterday, today, YYYY-MM-DD)
                   기본값: yesterday
  --help           도움말 표시

예시:
  node analyze-exposure-click-mismatch.js                    # 키워드 31, 어제
  node analyze-exposure-click-mismatch.js --keyword 7        # 키워드 7
  node analyze-exposure-click-mismatch.js --date today       # 오늘 데이터
`);
  process.exit(0);
}

// 실행
analyzeExposureClickMismatch(options);