/**
 * 멈춘 실행 프로세스 정리 및 수정 도구
 * - in_progress 상태로 30분 이상 멈춰있는 실행들을 찾아 정리
 * - 브라우저 프로세스 완료 로직 문제 분석 및 수정
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function fixStuckExecutions() {
  console.log('🔧 멈춘 실행 프로세스 정리 시작\n');
  
  try {
    // 1. 현재 멈춘 실행들 조회
    console.log('📊 현재 멈춘 실행 분석');
    console.log('─'.repeat(50));
    
    const stuckExecutions = await dbServiceV2.query(`
      SELECT 
        id, started_at, keyword, product_code, agent,
        final_status, last_successful_stage,
        EXTRACT(EPOCH FROM (NOW() - started_at)) as running_seconds
      FROM v2_execution_logs 
      WHERE final_status = 'in_progress'
        AND started_at < NOW() - INTERVAL '30 minutes'
      ORDER BY started_at ASC
    `);
    
    console.log(`발견된 멈춘 실행: ${stuckExecutions.rows.length}개\n`);
    
    if (stuckExecutions.rows.length === 0) {
      console.log('✅ 현재 멈춘 실행이 없습니다.');
      return;
    }
    
    // 2. 멈춘 실행들 상세 분석
    const agentStats = {};
    const stageStats = {};
    
    stuckExecutions.rows.forEach(row => {
      const runningMinutes = Math.round(row.running_seconds / 60);
      const timeAgo = Math.round((Date.now() - new Date(row.started_at)) / (1000 * 60));
      
      console.log(`📋 ID ${row.id}: ${row.keyword} (${row.agent})`);
      console.log(`   시작: ${timeAgo}분 전 | 실행시간: ${runningMinutes}분 | 단계: ${row.last_successful_stage}`);
      
      // 통계 수집
      if (!agentStats[row.agent]) agentStats[row.agent] = 0;
      agentStats[row.agent]++;
      
      if (!stageStats[row.last_successful_stage]) stageStats[row.last_successful_stage] = 0;
      stageStats[row.last_successful_stage]++;
    });
    
    console.log('\n📈 통계 분석');
    console.log('─'.repeat(30));
    console.log('에이전트별:');
    Object.entries(agentStats).forEach(([agent, count]) => {
      console.log(`  ${agent}: ${count}개`);
    });
    
    console.log('\n단계별:');
    Object.entries(stageStats).forEach(([stage, count]) => {
      console.log(`  단계 ${stage}: ${count}개`);
    });
    
    // 3. 각 멈춘 실행의 액션 로그 확인
    console.log('\n🔍 액션 로그 분석');
    console.log('─'.repeat(50));
    
    for (const execution of stuckExecutions.rows) {
      console.log(`\n📋 실행 ID ${execution.id} 상세 분석:`);
      
      // 해당 실행의 액션 로그 조회
      const actionLogs = await dbServiceV2.query(`
        SELECT action_type, action_target, started_at
        FROM v2_action_logs 
        WHERE execution_id = $1
        ORDER BY started_at DESC
        LIMIT 5
      `, [execution.id]);
      
      if (actionLogs.rows.length > 0) {
        console.log(`   최근 액션 ${actionLogs.rows.length}개:`);
        actionLogs.rows.forEach(action => {
          const actionTime = Math.round((Date.now() - new Date(action.started_at)) / (1000 * 60));
          console.log(`     • ${action.action_type}: ${action.action_target} (${actionTime}분 전)`);
        });
      } else {
        console.log('   ⚠️ 액션 로그 없음 - 메인 플로우에서 멈춤');
      }
      
      // 에러 로그 확인
      const errorLogs = await dbServiceV2.query(`
        SELECT error_code, error_message, occurred_at
        FROM v2_error_logs 
        WHERE execution_id = $1
        ORDER BY occurred_at DESC
        LIMIT 3
      `, [execution.id]);
      
      if (errorLogs.rows.length > 0) {
        console.log(`   최근 에러 ${errorLogs.rows.length}개:`);
        errorLogs.rows.forEach(error => {
          const errorTime = Math.round((Date.now() - new Date(error.occurred_at)) / (1000 * 60));
          console.log(`     • ${error.error_code}: ${error.error_message.substring(0, 60)}... (${errorTime}분 전)`);
        });
      }
    }
    
    // 4. 자동 정리 옵션 제공
    console.log('\n🛠️ 정리 옵션');
    console.log('─'.repeat(30));
    console.log('1. 30분 이상 멈춘 실행들을 자동으로 실패 처리');
    console.log('2. 1시간 이상 멈춘 실행들만 실패 처리');
    console.log('3. 에러가 있는 실행들만 실패 처리');
    console.log('4. 수동 확인 후 처리');
    
    // 여기서는 1시간 이상 멈춘 것들을 자동 처리
    const veryStuckExecutions = stuckExecutions.rows.filter(row => 
      row.running_seconds > 3600 // 1시간
    );
    
    if (veryStuckExecutions.length > 0) {
      console.log(`\n🚨 1시간 이상 멈춘 실행 ${veryStuckExecutions.length}개 자동 정리 시작`);
      
      for (const execution of veryStuckExecutions) {
        try {
          await dbServiceV2.completeExecutionV2(execution.id, {
            success: false,
            finalStatus: 'timeout_cleaned',
            errorMessage: '시스템 정리: 1시간 이상 무응답으로 인한 자동 종료',
            errorStep: 'system_cleanup',
            cleanupReason: 'stuck_execution_cleanup'
          });
          
          console.log(`   ✅ ID ${execution.id} 정리 완료: ${execution.keyword}`);
          
        } catch (error) {
          console.error(`   ❌ ID ${execution.id} 정리 실패:`, error.message);
        }
      }
    }
    
    // 5. 원인 분석 및 해결책 제안
    console.log('\n💡 원인 분석 및 해결책');
    console.log('─'.repeat(50));
    
    console.log('\n🔍 가능한 원인들:');
    console.log('1. 메인 플로우 액션 완료 처리와 V2 실행 로그 완료 처리 충돌');
    console.log('2. ActionLogger 상태 전환 후 실행 완료 로직 누락');  
    console.log('3. 브라우저 프로세스가 종료되지 않고 계속 실행 중');
    console.log('4. 네트워크 타임아웃이나 차단으로 인한 무한 대기');
    console.log('5. try-catch 블록에서 finally의 완료 로직이 실행되지 않음');
    
    console.log('\n🛠️ 해결책 제안:');
    console.log('1. coupang-handler.js의 finally 블록에서 강제 완료 로직 추가');
    console.log('2. 실행 시간 타임아웃 설정 (최대 20분)');
    console.log('3. ActionLogger 완료 시 자동으로 실행 로그 완료 처리');
    console.log('4. 정기적인 stuck execution 정리 스케줄러 추가');
    
    // 6. 현재 실행 중인 프로세스 확인
    const recentActiveExecutions = await dbServiceV2.query(`
      SELECT 
        id, started_at, keyword, agent,
        EXTRACT(EPOCH FROM (NOW() - started_at)) as running_seconds
      FROM v2_execution_logs 
      WHERE final_status = 'in_progress'
        AND started_at >= NOW() - INTERVAL '30 minutes'
      ORDER BY started_at DESC
    `);
    
    console.log(`\n📊 현재 실행 중인 프로세스: ${recentActiveExecutions.rows.length}개`);
    if (recentActiveExecutions.rows.length > 0) {
      console.log('─'.repeat(40));
      recentActiveExecutions.rows.forEach(row => {
        const runningMinutes = Math.round(row.running_seconds / 60);
        console.log(`   ID ${row.id}: ${row.keyword} (${row.agent}) - ${runningMinutes}분 실행 중`);
      });
    }
    
  } catch (error) {
    console.error('❌ 멈춘 실행 분석 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

fixStuckExecutions();