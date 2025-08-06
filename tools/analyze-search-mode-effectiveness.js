/**
 * 검색 모드 효과성 분석 도구
 * - goto 모드 차단률 분석
 * - search 모드 전환 후 성공률 변화
 * - 최적 전환 임계값 찾기
 * - 에이전트별 패턴 분석
 */

const dbService = require('../lib/services/db-service');

async function analyzeSearchModeEffectiveness(options = {}) {
  const { 
    agent = null,
    days = 7,
    showHistory = false 
  } = options;
  
  console.log('🔍 검색 모드 효과성 분석');
  console.log('='.repeat(120));
  
  try {
    // 1. 검색 모드별 전체 성능 비교
    console.log('\n1️⃣ 검색 모드별 성능 비교');
    console.log('-'.repeat(120));
    
    let whereClause = 'WHERE e.created_at > CURRENT_TIMESTAMP - INTERVAL \'%s days\'';
    const params = [days];
    let paramIndex = 2;
    
    if (agent) {
      whereClause += ` AND e.agent = $${paramIndex}`;
      params.push(agent);
      paramIndex++;
    }
    
    const modeComparisonQuery = `
      SELECT 
        e.search_mode,
        COUNT(*) as executions,
        COUNT(CASE WHEN e.success = true THEN 1 END) as success_count,
        COUNT(CASE WHEN e.is_blocked = true THEN 1 END) as blocked_count,
        COUNT(CASE WHEN e.product_found = true THEN 1 END) as product_found_count,
        ROUND(COUNT(CASE WHEN e.success = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as success_rate,
        ROUND(COUNT(CASE WHEN e.is_blocked = true THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as block_rate,
        ROUND(AVG(e.duration_ms), 0) as avg_duration_ms,
        ROUND(AVG(e.pages_searched), 1) as avg_pages_searched
      FROM v2_execution_logs e
      ${whereClause}
      AND e.search_mode IS NOT NULL
      GROUP BY e.search_mode
      ORDER BY e.search_mode
    `;
    
    const modeResult = await dbService.query(modeComparisonQuery.replace('%s', '$1'), params);
    
    console.log('Mode'.padEnd(10) + ' | ' +
      'Exec'.padEnd(6) + ' | ' +
      'Success'.padEnd(8) + ' | ' +
      'Blocked'.padEnd(8) + ' | ' +
      'Found'.padEnd(7) + ' | ' +
      'Success%'.padEnd(10) + ' | ' +
      'Block%'.padEnd(8) + ' | ' +
      'Avg Time'.padEnd(10) + ' | ' +
      'Avg Pages'
    );
    console.log('-'.repeat(120));
    
    let totalStats = {
      goto: null,
      search: null
    };
    
    modeResult.rows.forEach(row => {
      totalStats[row.search_mode] = row;
      console.log(
        row.search_mode.padEnd(10) + ' | ' +
        row.executions.toString().padEnd(6) + ' | ' +
        row.success_count.toString().padEnd(8) + ' | ' +
        row.blocked_count.toString().padEnd(8) + ' | ' +
        row.product_found_count.toString().padEnd(7) + ' | ' +
        `${row.success_rate}%`.padEnd(10) + ' | ' +
        `${row.block_rate}%`.padEnd(8) + ' | ' +
        `${row.avg_duration_ms}ms`.padEnd(10) + ' | ' +
        row.avg_pages_searched.toFixed(1)
      );
    });
    
    // 2. 에이전트별 검색 모드 현황
    console.log('\n\n2️⃣ 에이전트별 검색 모드 현황');
    console.log('-'.repeat(120));
    
    const agentStatusQuery = `
      SELECT 
        s.agent,
        s.current_mode,
        s.goto_consecutive_blocks,
        s.search_execution_count,
        s.total_goto_executions,
        s.total_search_executions,
        s.total_goto_blocks,
        s.last_mode_change,
        s.updated_at,
        (SELECT COUNT(*) FROM v2_search_mode_history h WHERE h.agent = s.agent) as switch_count
      FROM v2_search_mode_status s
      ${agent ? 'WHERE s.agent = $1' : ''}
      ORDER BY s.updated_at DESC
    `;
    
    const statusResult = await dbService.query(agentStatusQuery, agent ? [agent] : []);
    
    console.log('Agent'.padEnd(10) + ' | ' +
      'Mode'.padEnd(8) + ' | ' +
      'Blocks'.padEnd(8) + ' | ' +
      'Search#'.padEnd(9) + ' | ' +
      'Total G'.padEnd(9) + ' | ' +
      'Total S'.padEnd(9) + ' | ' +
      'Switches'.padEnd(10) + ' | ' +
      'Last Change'
    );
    console.log('-'.repeat(120));
    
    statusResult.rows.forEach(row => {
      console.log(
        row.agent.padEnd(10) + ' | ' +
        row.current_mode.padEnd(8) + ' | ' +
        `${row.goto_consecutive_blocks}/5`.padEnd(8) + ' | ' +
        `${row.search_execution_count}/20`.padEnd(9) + ' | ' +
        row.total_goto_executions.toString().padEnd(9) + ' | ' +
        row.total_search_executions.toString().padEnd(9) + ' | ' +
        row.switch_count.toString().padEnd(10) + ' | ' +
        (row.last_mode_change ? new Date(row.last_mode_change).toLocaleString('ko-KR') : 'Never')
      );
    });
    
    // 3. 검색 모드 전환 효과 분석
    console.log('\n\n3️⃣ 검색 모드 전환 효과 분석');
    console.log('-'.repeat(120));
    
    const switchEffectQuery = `
      WITH mode_switches AS (
        SELECT 
          h.agent,
          h.switched_at,
          h.from_mode,
          h.to_mode,
          h.switch_reason
        FROM v2_search_mode_history h
        WHERE h.switched_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
        ${agent ? 'AND h.agent = $1' : ''}
      ),
      before_after_stats AS (
        SELECT 
          s.agent,
          s.switched_at,
          s.from_mode,
          s.to_mode,
          s.switch_reason,
          -- 전환 전 24시간 통계
          (SELECT COUNT(*) FROM v2_execution_logs e 
           WHERE e.agent = s.agent 
           AND e.search_mode = s.from_mode
           AND e.executed_at BETWEEN s.switched_at - INTERVAL '24 hours' AND s.switched_at) as before_count,
          (SELECT COUNT(CASE WHEN success = true THEN 1 END) FROM v2_execution_logs e 
           WHERE e.agent = s.agent 
           AND e.search_mode = s.from_mode
           AND e.executed_at BETWEEN s.switched_at - INTERVAL '24 hours' AND s.switched_at) as before_success,
          (SELECT COUNT(CASE WHEN is_blocked = true THEN 1 END) FROM v2_execution_logs e 
           WHERE e.agent = s.agent 
           AND e.search_mode = s.from_mode
           AND e.executed_at BETWEEN s.switched_at - INTERVAL '24 hours' AND s.switched_at) as before_blocked,
          -- 전환 후 24시간 통계
          (SELECT COUNT(*) FROM v2_execution_logs e 
           WHERE e.agent = s.agent 
           AND e.search_mode = s.to_mode
           AND e.executed_at BETWEEN s.switched_at AND s.switched_at + INTERVAL '24 hours') as after_count,
          (SELECT COUNT(CASE WHEN success = true THEN 1 END) FROM v2_execution_logs e 
           WHERE e.agent = s.agent 
           AND e.search_mode = s.to_mode
           AND e.executed_at BETWEEN s.switched_at AND s.switched_at + INTERVAL '24 hours') as after_success,
          (SELECT COUNT(CASE WHEN is_blocked = true THEN 1 END) FROM v2_execution_logs e 
           WHERE e.agent = s.agent 
           AND e.search_mode = s.to_mode
           AND e.executed_at BETWEEN s.switched_at AND s.switched_at + INTERVAL '24 hours') as after_blocked
        FROM mode_switches s
      )
      SELECT 
        agent,
        to_mode as switched_to,
        switch_reason,
        before_count,
        after_count,
        CASE WHEN before_count > 0 
          THEN ROUND(before_success::NUMERIC / before_count * 100, 1) 
          ELSE 0 END as before_success_rate,
        CASE WHEN after_count > 0 
          THEN ROUND(after_success::NUMERIC / after_count * 100, 1) 
          ELSE 0 END as after_success_rate,
        CASE WHEN before_count > 0 
          THEN ROUND(before_blocked::NUMERIC / before_count * 100, 1) 
          ELSE 0 END as before_block_rate,
        CASE WHEN after_count > 0 
          THEN ROUND(after_blocked::NUMERIC / after_count * 100, 1) 
          ELSE 0 END as after_block_rate,
        switched_at
      FROM before_after_stats
      WHERE before_count > 0 OR after_count > 0
      ORDER BY switched_at DESC
      LIMIT 10
    `;
    
    const switchResult = await dbService.query(switchEffectQuery, agent ? [agent] : []);
    
    if (switchResult.rows.length > 0) {
      console.log('Agent'.padEnd(10) + ' | ' +
        'To Mode'.padEnd(9) + ' | ' +
        'Reason'.padEnd(20) + ' | ' +
        'Before'.padEnd(15) + ' | ' +
        'After'.padEnd(15) + ' | ' +
        'Block Change'
      );
      console.log(' '.padEnd(10) + ' | ' +
        ' '.padEnd(9) + ' | ' +
        ' '.padEnd(20) + ' | ' +
        '(Count/Success%)'.padEnd(15) + ' | ' +
        '(Count/Success%)'.padEnd(15) + ' | ' +
        '(Before→After)'
      );
      console.log('-'.repeat(120));
      
      switchResult.rows.forEach(row => {
        const successChange = row.after_success_rate - row.before_success_rate;
        const blockChange = row.after_block_rate - row.before_block_rate;
        
        console.log(
          row.agent.padEnd(10) + ' | ' +
          row.switched_to.padEnd(9) + ' | ' +
          row.switch_reason.padEnd(20) + ' | ' +
          `${row.before_count}/${row.before_success_rate}%`.padEnd(15) + ' | ' +
          `${row.after_count}/${row.after_success_rate}%`.padEnd(15) + ' | ' +
          `${row.before_block_rate}%→${row.after_block_rate}%`
        );
      });
      
      // 전환 효과 요약
      const avgImprovement = switchResult.rows
        .filter(r => r.switch_reason === 'auto_switch_blocked')
        .reduce((acc, r) => acc + (r.after_success_rate - r.before_success_rate), 0) / 
        switchResult.rows.filter(r => r.switch_reason === 'auto_switch_blocked').length;
      
      if (!isNaN(avgImprovement)) {
        console.log(`\n💡 차단으로 인한 search 모드 전환 시 평균 성공률 변화: ${avgImprovement > 0 ? '+' : ''}${avgImprovement.toFixed(1)}%`);
      }
    } else {
      console.log('최근 검색 모드 전환 이력이 없습니다.');
    }
    
    // 4. 연속 차단 패턴 분석
    console.log('\n\n4️⃣ 연속 차단 패턴 분석');
    console.log('-'.repeat(120));
    
    const blockPatternQuery = `
      WITH block_sequences AS (
        SELECT 
          agent,
          executed_at,
          is_blocked,
          search_mode,
          LAG(is_blocked, 1) OVER (PARTITION BY agent ORDER BY executed_at) as prev_blocked,
          LAG(is_blocked, 2) OVER (PARTITION BY agent ORDER BY executed_at) as prev2_blocked,
          LAG(is_blocked, 3) OVER (PARTITION BY agent ORDER BY executed_at) as prev3_blocked,
          LAG(is_blocked, 4) OVER (PARTITION BY agent ORDER BY executed_at) as prev4_blocked
        FROM v2_execution_logs
        WHERE search_mode = 'goto'
        AND created_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
      )
      SELECT 
        agent,
        COUNT(CASE WHEN is_blocked = true AND prev_blocked = true THEN 1 END) as two_blocks,
        COUNT(CASE WHEN is_blocked = true AND prev_blocked = true AND prev2_blocked = true THEN 1 END) as three_blocks,
        COUNT(CASE WHEN is_blocked = true AND prev_blocked = true AND prev2_blocked = true AND prev3_blocked = true THEN 1 END) as four_blocks,
        COUNT(CASE WHEN is_blocked = true AND prev_blocked = true AND prev2_blocked = true AND prev3_blocked = true AND prev4_blocked = true THEN 1 END) as five_blocks,
        COUNT(*) as total_goto_executions
      FROM block_sequences
      ${agent ? 'WHERE agent = $1' : ''}
      GROUP BY agent
      HAVING COUNT(CASE WHEN is_blocked = true THEN 1 END) > 0
      ORDER BY five_blocks DESC, four_blocks DESC
    `;
    
    const blockPatternResult = await dbService.query(blockPatternQuery, agent ? [agent] : []);
    
    if (blockPatternResult.rows.length > 0) {
      console.log('Agent'.padEnd(10) + ' | ' +
        '2-Block'.padEnd(9) + ' | ' +
        '3-Block'.padEnd(9) + ' | ' +
        '4-Block'.padEnd(9) + ' | ' +
        '5-Block'.padEnd(9) + ' | ' +
        'Total Goto'
      );
      console.log('-'.repeat(70));
      
      blockPatternResult.rows.forEach(row => {
        console.log(
          row.agent.padEnd(10) + ' | ' +
          row.two_blocks.toString().padEnd(9) + ' | ' +
          row.three_blocks.toString().padEnd(9) + ' | ' +
          row.four_blocks.toString().padEnd(9) + ' | ' +
          row.five_blocks.toString().padEnd(9) + ' | ' +
          row.total_goto_executions
        );
      });
    }
    
    // 5. 검색 모드 전환 이력 (선택적)
    if (showHistory) {
      console.log('\n\n5️⃣ 최근 검색 모드 전환 이력');
      console.log('-'.repeat(120));
      
      const historyQuery = `
        SELECT 
          agent,
          from_mode,
          to_mode,
          switch_reason,
          goto_blocks_before_switch,
          search_executions_before_switch,
          switched_at
        FROM v2_search_mode_history
        WHERE switched_at > CURRENT_TIMESTAMP - INTERVAL '${days} days'
        ${agent ? 'AND agent = $1' : ''}
        ORDER BY switched_at DESC
        LIMIT 20
      `;
      
      const historyResult = await dbService.query(historyQuery, agent ? [agent] : []);
      
      console.log('Time'.padEnd(20) + ' | ' +
        'Agent'.padEnd(10) + ' | ' +
        'From→To'.padEnd(15) + ' | ' +
        'Reason'.padEnd(25) + ' | ' +
        'Blocks/Search#'
      );
      console.log('-'.repeat(100));
      
      historyResult.rows.forEach(row => {
        const fromTo = `${row.from_mode}→${row.to_mode}`;
        console.log(
          new Date(row.switched_at).toLocaleString('ko-KR').padEnd(20) + ' | ' +
          row.agent.padEnd(10) + ' | ' +
          fromTo.padEnd(15) + ' | ' +
          row.switch_reason.padEnd(25) + ' | ' +
          `${row.goto_blocks_before_switch}/${row.search_executions_before_switch}`
        );
      });
    }
    
    // 6. 최적화 제안
    console.log('\n\n💡 최적화 제안');
    console.log('-'.repeat(120));
    
    // goto vs search 성능 비교
    if (totalStats.goto && totalStats.search) {
      const successDiff = totalStats.search.success_rate - totalStats.goto.success_rate;
      const blockDiff = totalStats.goto.block_rate - totalStats.search.block_rate;
      
      console.log(`• Search 모드가 Goto 모드 대비:`);
      console.log(`  - 성공률: ${successDiff > 0 ? '+' : ''}${successDiff.toFixed(1)}%`);
      console.log(`  - 차단률: ${blockDiff > 0 ? '-' : '+'}${Math.abs(blockDiff).toFixed(1)}%`);
      console.log(`  - 평균 소요시간: ${totalStats.search.avg_duration_ms - totalStats.goto.avg_duration_ms}ms 추가`);
    }
    
    // 최적 전환 임계값 제안
    const avgBlocksBeforeSwitch = blockPatternResult.rows.reduce((acc, r) => {
      return acc + (r.five_blocks > 0 ? 5 : r.four_blocks > 0 ? 4 : r.three_blocks > 0 ? 3 : 2);
    }, 0) / blockPatternResult.rows.length;
    
    if (!isNaN(avgBlocksBeforeSwitch)) {
      console.log(`\n• 현재 5회 연속 차단 시 전환하지만, 데이터 분석 결과 ${Math.round(avgBlocksBeforeSwitch)}회가 더 효율적일 수 있습니다.`);
    }
    
    // 에이전트별 제안
    const problematicAgents = statusResult.rows.filter(r => r.switch_count > 5);
    if (problematicAgents.length > 0) {
      console.log(`\n• 빈번한 모드 전환이 발생하는 에이전트: ${problematicAgents.map(a => a.agent).join(', ')}`);
      console.log(`  → 해당 에이전트들은 프록시 설정이나 네트워크 환경 점검이 필요합니다.`);
    }
    
  } catch (error) {
    console.error('분석 중 오류:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 옵션 처리
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--agent' && args[index + 1]) {
    options.agent = args[index + 1];
  } else if (arg === '--days' && args[index + 1]) {
    options.days = parseInt(args[index + 1]);
  } else if (arg === '--history') {
    options.showHistory = true;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-search-mode-effectiveness.js [옵션]

옵션:
  --agent <에이전트명>  특정 에이전트만 분석
  --days <일수>        분석 기간 (기본: 7일)
  --history           검색 모드 전환 이력 표시
  --help             도움말 표시

예시:
  node analyze-search-mode-effectiveness.js --days 30
  node analyze-search-mode-effectiveness.js --agent win11 --history
`);
  process.exit(0);
}

// 실행
analyzeSearchModeEffectiveness(options);