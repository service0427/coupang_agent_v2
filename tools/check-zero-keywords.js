/**
 * [0/0/0/0] 패턴 키워드 분석
 * 왜 0으로 표시되는지 원인 파악
 */

const dbService = require('../lib/services/db-service');

async function checkZeroKeywords() {
  console.log('🔍 [0/0/0/0] 패턴 키워드 분석');
  console.log('='.repeat(150));

  try {
    // 1. [0/0/0/0] 패턴 키워드 찾기
    const zeroPatternQuery = `
      SELECT 
        k.id,
        k.keyword,
        k.code,
        k.runs,
        k.succ,
        k.fail,
        k.userdata,
        k.session,
        k.cache,
        k.optimize,
        k.last_run,
        k.created,
        -- 실제 실행 통계
        (SELECT COUNT(*) FROM v1_executions e WHERE e.keyword_id = k.id) as actual_executions,
        (SELECT COUNT(*) FROM v1_executions e WHERE e.keyword_id = k.id AND e.success = true) as actual_success,
        (SELECT COUNT(*) FROM v1_executions e WHERE e.keyword_id = k.id AND e.found = true) as actual_found
      FROM v1_keywords k
      WHERE k.keyword LIKE '%[0/0/0/0]%'
         OR k.keyword NOT LIKE '%[%/%/%/%]%'
      ORDER BY k.id
    `;
    
    const zeroKeywords = await dbService.query(zeroPatternQuery);
    
    console.log('\n📊 [0/0/0/0] 또는 패턴 없는 키워드:');
    console.log('─'.repeat(150));
    console.log(
      'ID'.padEnd(5) + '| ' +
      '키워드'.padEnd(40) + '| ' +
      '코드'.padEnd(12) + '| ' +
      'DB기록(R/S/F)'.padEnd(15) + '| ' +
      '실제(실행/성공/발견)'.padEnd(20) + '| ' +
      '옵션(U/S/C/O)'
    );
    console.log('─'.repeat(150));
    
    zeroKeywords.rows.forEach(row => {
      const optionStr = `${row.userdata ? 'T' : 'F'}/${row.session ? 'T' : 'F'}/${row.cache ? 'T' : 'F'}/${row.optimize ? 'T' : 'F'}`;
      
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        row.keyword.substring(0, 38).padEnd(40) + '| ' +
        (row.code || 'N/A').toString().padEnd(12) + '| ' +
        `${row.runs}/${row.succ}/${row.fail}`.padEnd(15) + '| ' +
        `${row.actual_executions}/${row.actual_success}/${row.actual_found}`.padEnd(20) + '| ' +
        optionStr
      );
    });

    // 2. 패턴 분석
    console.log('\n📈 키워드 패턴 분석:');
    console.log('─'.repeat(150));
    
    const patternAnalysisQuery = `
      WITH keyword_patterns AS (
        SELECT 
          CASE 
            WHEN keyword LIKE '%[0/0/0/0]%' THEN '[0/0/0/0] 패턴'
            WHEN keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]' THEN '[N/N/N/N] 정상 패턴'
            ELSE '패턴 없음'
          END as pattern_type,
          COUNT(*) as count,
          AVG(runs) as avg_runs,
          AVG(succ) as avg_succ,
          AVG(
            (SELECT COUNT(*) FROM v1_executions e WHERE e.keyword_id = k.id)
          ) as avg_actual_exec
        FROM v1_keywords k
        GROUP BY pattern_type
      )
      SELECT * FROM keyword_patterns
      ORDER BY pattern_type
    `;
    
    const patterns = await dbService.query(patternAnalysisQuery);
    
    console.log(
      '패턴 유형'.padEnd(20) + '| ' +
      '개수'.padEnd(8) + '| ' +
      '평균 runs'.padEnd(10) + '| ' +
      '평균 succ'.padEnd(10) + '| ' +
      '평균 실제실행'
    );
    console.log('─'.repeat(150));
    
    patterns.rows.forEach(row => {
      console.log(
        row.pattern_type.padEnd(20) + '| ' +
        row.count.toString().padEnd(8) + '| ' +
        parseFloat(row.avg_runs || 0).toFixed(1).padEnd(10) + '| ' +
        parseFloat(row.avg_succ || 0).toFixed(1).padEnd(10) + '| ' +
        parseFloat(row.avg_actual_exec || 0).toFixed(1)
      );
    });

    // 3. ID 36 상세 분석
    console.log('\n🔍 ID 36 상세 분석:');
    console.log('─'.repeat(150));
    
    const id36Query = `
      SELECT 
        k.*,
        (SELECT COUNT(*) FROM v1_executions e WHERE e.keyword_id = 36) as total_exec,
        (SELECT COUNT(*) FROM v1_executions e WHERE e.keyword_id = 36 AND e.success = true) as success_exec,
        (SELECT MIN(e.executed) FROM v1_executions e WHERE e.keyword_id = 36) as first_exec,
        (SELECT MAX(e.executed) FROM v1_executions e WHERE e.keyword_id = 36) as last_exec
      FROM v1_keywords k
      WHERE k.id = 36
    `;
    
    const id36 = await dbService.query(id36Query);
    
    if (id36.rows.length > 0) {
      const row = id36.rows[0];
      console.log(`  ID: ${row.id}`);
      console.log(`  키워드: ${row.keyword}`);
      console.log(`  코드: ${row.code || 'N/A'}`);
      console.log(`  DB 기록: runs=${row.runs}, succ=${row.succ}, fail=${row.fail}`);
      console.log(`  실제 실행: ${row.total_exec}회 (성공: ${row.success_exec}회)`);
      console.log(`  첫 실행: ${row.first_exec || 'N/A'}`);
      console.log(`  마지막 실행: ${row.last_exec || 'N/A'}`);
      console.log(`  옵션: userdata=${row.userdata}, session=${row.session}, cache=${row.cache}, optimize=${row.optimize}`);
      
      // 실행 로그 샘플
      const execLogsQuery = `
        SELECT 
          executed,
          success,
          found,
          cart,
          rank,
          pages,
          duration,
          error
        FROM v1_executions
        WHERE keyword_id = 36
        ORDER BY executed DESC
        LIMIT 5
      `;
      
      const execLogs = await dbService.query(execLogsQuery);
      
      if (execLogs.rows.length > 0) {
        console.log('\n  최근 실행 로그:');
        execLogs.rows.forEach((log, idx) => {
          console.log(`    ${idx + 1}. ${new Date(log.executed).toLocaleString('ko-KR')}`);
          console.log(`       성공: ${log.success}, 발견: ${log.found}, 장바구니: ${log.cart}`);
          console.log(`       순위: ${log.rank || 'N/A'}, 페이지: ${log.pages || 'N/A'}, 시간: ${(log.duration/1000).toFixed(1)}초`);
          if (log.error) {
            console.log(`       에러: ${log.error.substring(0, 50)}`);
          }
        });
      }
    }

    // 4. 가능한 원인 분석
    console.log('\n💡 [0/0/0/0] 패턴 가능한 원인:');
    console.log('─'.repeat(150));
    console.log('  1. 초기 등록 시 통계 값을 입력하지 않은 경우');
    console.log('  2. 테스트용 키워드로 실제 통계가 없는 경우');  
    console.log('  3. 수동으로 추가한 키워드로 예상 값이 없는 경우');
    console.log('  4. 다른 시스템에서 마이그레이션 시 데이터 누락');
    
    // 5. 실제 성능 vs 패턴
    console.log('\n📊 패턴별 실제 성능 비교:');
    console.log('─'.repeat(150));
    
    const performanceQuery = `
      WITH performance_stats AS (
        SELECT 
          CASE 
            WHEN k.keyword LIKE '%[0/0/0/0]%' THEN '[0/0/0/0]'
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]' THEN '정상 패턴'
            ELSE '패턴 없음'
          END as pattern,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
          AVG(CASE WHEN e.found THEN 100.0 ELSE 0 END) as found_rate,
          COUNT(DISTINCT k.id) as keyword_count,
          COUNT(e.id) as total_executions
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        GROUP BY pattern
      )
      SELECT * FROM performance_stats
      WHERE total_executions > 0
      ORDER BY pattern
    `;
    
    const performance = await dbService.query(performanceQuery);
    
    console.log(
      '패턴'.padEnd(15) + '| ' +
      '키워드수'.padEnd(10) + '| ' +
      '총 실행'.padEnd(10) + '| ' +
      '성공률'.padEnd(10) + '| ' +
      '발견률'
    );
    console.log('─'.repeat(150));
    
    performance.rows.forEach(row => {
      console.log(
        row.pattern.padEnd(15) + '| ' +
        row.keyword_count.toString().padEnd(10) + '| ' +
        row.total_executions.toString().padEnd(10) + '| ' +
        `${parseFloat(row.success_rate).toFixed(1)}%`.padEnd(10) + '| ' +
        `${parseFloat(row.found_rate).toFixed(1)}%`
      );
    });
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// 실행
checkZeroKeywords();