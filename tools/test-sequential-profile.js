/**
 * 순차 유저폴더 관리 시스템 테스트
 * - 사용법: node tools/test-sequential-profile.js [command] [agent]
 */

const SequentialProfileManager = require('../lib/utils/sequential-profile-manager');
const fs = require('fs').promises;

async function main() {
  const command = process.argv[2] || 'status';
  const agentName = process.argv[3] || 'instance_0';
  
  console.log(`🔧 순차 프로필 관리 테스트: ${agentName}\n`);
  
  try {
    switch (command) {
      case 'init':
        await initializeAgent(agentName);
        break;
      case 'status':
        await showStatus(agentName);
        break;
      case 'simulate-success':
        await simulateExecutions(agentName, true);
        break;
      case 'simulate-failure':
        await simulateExecutions(agentName, false);
        break;
      case 'simulate-blocking':
        await simulateBlocking(agentName);
        break;
      case 'history':
        await showHistory(agentName);
        break;
      case 'all-agents':
        await showAllAgents();
        break;
      case 'manual-switch':
        await manualSwitch(agentName);
        break;
      case 'cleanup':
        await cleanup(agentName);
        break;
      default:
        showUsage();
    }
  } catch (error) {
    console.error('❌ 실행 실패:', error.message);
  }
}

/**
 * 새 에이전트 초기화
 */
async function initializeAgent(agentName) {
  console.log(`🆕 새 에이전트 초기화: ${agentName}`);
  
  const manager = new SequentialProfileManager(agentName);
  await manager.initializeAgent();
  
  const status = await manager.getStatus();
  console.log(`✅ 초기화 완료:`);
  console.log(`   - 에이전트: ${status.agent}`);
  console.log(`   - 현재 폴더: ${status.current_folder}`);
  console.log(`   - 프로필 경로: ${status.current_path}`);
}

/**
 * 에이전트 상태 표시
 */
async function showStatus(agentName) {
  console.log(`📊 ${agentName} 상태 확인\n`);
  
  const manager = new SequentialProfileManager(agentName);
  const status = await manager.getStatus();
  
  console.log(`📋 기본 정보:`);
  console.log(`   - 에이전트명: ${status.agent}`);
  console.log(`   - 현재 폴더: ${status.current_folder}`);
  console.log(`   - 전체 폴더 수: ${status.total_folders}`);
  console.log(`   - 현재 경로: ${status.current_path}`);
  
  console.log(`\n📈 현재 폴더 성능:`);
  console.log(`   - 실행 횟수: ${status.current_executions}회`);
  console.log(`   - 연속 차단: ${status.current_consecutive_blocks}회`);
  console.log(`   - 현재 성공률: ${status.current_success_rate}%`);
  
  console.log(`\n📊 전체 통계:`);
  console.log(`   - 총 실행 횟수: ${status.total_executions}회`);
  console.log(`   - 전체 성공률: ${status.overall_success_rate}%`);
  console.log(`   - 차단 이력: ${status.folder_history_count}회`);
  console.log(`   - 평균 폴더 수명: ${status.average_folder_lifetime}분`);
  console.log(`   - 최고 성능 폴더: ${status.most_successful_folder}`);
  console.log(`   - 최장 수명 폴더: ${status.longest_lasting_folder}`);
  
  // 폴더 존재 확인
  try {
    await fs.access(status.current_path);
    console.log(`\n✅ 현재 프로필 폴더 존재 확인됨`);
  } catch (e) {
    console.log(`\n❌ 현재 프로필 폴더 없음 - 초기화 필요`);
  }
}

/**
 * 실행 시뮬레이션
 */
async function simulateExecutions(agentName, success = true) {
  const count = parseInt(process.argv[4]) || 5;
  console.log(`🧪 ${success ? '성공' : '실패'} 실행 시뮬레이션: ${count}회\n`);
  
  const manager = new SequentialProfileManager(agentName);
  
  for (let i = 1; i <= count; i++) {
    const errorInfo = success ? null : { error: 'simulated_error', code: 'TEST_' + i };
    const result = await manager.recordExecution(success, errorInfo);
    
    console.log(`${i}회차: ${success ? '✅ 성공' : '❌ 실패'}`);
    
    if (result) {
      console.log(`   🚨 차단 발생! ${result.oldFolder} → ${result.newFolder}`);
      console.log(`   📁 새 경로: ${result.newPath}`);
      break;
    }
  }
  
  console.log(`\n📊 시뮬레이션 완료 - 'status' 명령어로 상태를 확인하세요.`);
}

/**
 * 차단 시뮬레이션
 */
async function simulateBlocking(agentName) {
  const reason = process.argv[4] || 'test_blocking';
  console.log(`🚨 차단 시뮬레이션: ${reason}\n`);
  
  const manager = new SequentialProfileManager(agentName);
  const result = await manager.handleBlocking(reason, { 
    test: true, 
    timestamp: new Date().toISOString() 
  });
  
  console.log(`✅ 차단 처리 완료:`);
  console.log(`   - 이전 폴더: ${result.oldFolder}`);
  console.log(`   - 새 폴더: ${result.newFolder}`);
  console.log(`   - 새 경로: ${result.newPath}`);
  console.log(`   - 차단 기록: 실행 ${result.blockingRecord.executions}회, 성공률 ${result.blockingRecord.success_rate}`);
}

/**
 * 차단 이력 표시
 */
async function showHistory(agentName) {
  console.log(`📜 ${agentName} 차단 이력\n`);
  
  const manager = new SequentialProfileManager(agentName);
  const history = await manager.getBlockingHistory();
  
  if (history.length === 0) {
    console.log('📝 아직 차단 이력이 없습니다.');
    return;
  }
  
  console.log('폴더\t생성일시\t\t차단일시\t\t수명\t실행\t성공률\t차단사유');
  console.log('='.repeat(100));
  
  history.forEach((record, index) => {
    const created = new Date(record.created_at).toLocaleString('ko-KR');
    const blocked = new Date(record.blocked_at).toLocaleString('ko-KR');
    const successRate = (parseFloat(record.success_rate) * 100).toFixed(1);
    
    console.log(`${record.folder}\t${created}\t${blocked}\t${record.lifetime_minutes}분\t${record.executions}회\t${successRate}%\t${record.blocking_reason}`);
  });
  
  console.log(`\n📊 총 ${history.length}개 폴더 차단 이력`);
}

/**
 * 전체 에이전트 상태
 */
async function showAllAgents() {
  console.log('📊 전체 에이전트 상태\n');
  
  const agents = await SequentialProfileManager.getAllAgents();
  
  if (agents.length === 0) {
    console.log('📝 등록된 에이전트가 없습니다.');
    return;
  }
  
  console.log('에이전트\t\t현재폴더\t총폴더\t실행횟수\t성공률\t연속차단\t차단이력');
  console.log('='.repeat(80));
  
  agents.forEach(agent => {
    const successRate = (parseFloat(agent.statistics.overall_success_rate) * 100).toFixed(1);
    const currentBlocks = agent.current_status.consecutive_blocks;
    const historyCount = agent.blocking_history.length;
    
    console.log(`${agent.agent.padEnd(15)}\t${agent.current_folder}\t${agent.total_folders}\t${agent.statistics.total_executions}\t\t${successRate}%\t${currentBlocks}\t\t${historyCount}`);
  });
  
  console.log(`\n📊 총 ${agents.length}개 에이전트 관리 중`);
}

/**
 * 수동 폴더 전환
 */
async function manualSwitch(agentName) {
  const reason = process.argv[4] || 'manual_test';
  console.log(`🔧 수동 폴더 전환: ${reason}\n`);
  
  const manager = new SequentialProfileManager(agentName);
  const result = await manager.manualSwitchFolder(reason);
  
  console.log(`✅ 수동 전환 완료:`);
  console.log(`   - ${result.oldFolder} → ${result.newFolder}`);
  console.log(`   - 새 경로: ${result.newPath}`);
}

/**
 * 정리 (테스트 데이터 삭제)
 */
async function cleanup(agentName) {
  console.log(`🗑️ ${agentName} 테스트 데이터 정리\n`);
  
  const confirm = process.argv[4];
  if (confirm !== 'confirm') {
    console.log('❌ 위험한 작업입니다. 확인을 위해 다음과 같이 실행하세요:');
    console.log(`   node tools/test-sequential-profile.js cleanup ${agentName} confirm`);
    return;
  }
  
  // OS 독립적 경로 처리
  const path = require('path');
  const basePath = path.join(process.cwd(), 'browser-data', agentName);
  
  try {
    await fs.rm(basePath, { recursive: true, force: true });
    console.log(`✅ ${agentName} 폴더 완전 삭제 완료`);
  } catch (error) {
    console.log(`⚠️ 삭제 실패: ${error.message}`);
  }
}

/**
 * 사용법 표시
 */
function showUsage() {
  console.log('📖 사용법:');
  console.log('   node tools/test-sequential-profile.js init [agent]                # 새 에이전트 초기화');
  console.log('   node tools/test-sequential-profile.js status [agent]             # 에이전트 상태 확인');
  console.log('   node tools/test-sequential-profile.js simulate-success [agent] [count]  # 성공 실행 시뮬레이션');
  console.log('   node tools/test-sequential-profile.js simulate-failure [agent] [count]  # 실패 실행 시뮬레이션');
  console.log('   node tools/test-sequential-profile.js simulate-blocking [agent] [reason] # 차단 시뮬레이션');
  console.log('   node tools/test-sequential-profile.js history [agent]            # 차단 이력 확인');
  console.log('   node tools/test-sequential-profile.js all-agents                 # 전체 에이전트 상태');
  console.log('   node tools/test-sequential-profile.js manual-switch [agent] [reason] # 수동 폴더 전환');
  console.log('   node tools/test-sequential-profile.js cleanup [agent] confirm    # 테스트 데이터 삭제');
  console.log('');
  console.log('📝 예시:');
  console.log('   node tools/test-sequential-profile.js init test_agent');
  console.log('   node tools/test-sequential-profile.js simulate-failure test_agent 7');
  console.log('   node tools/test-sequential-profile.js simulate-blocking test_agent http2_error');
  console.log('   node tools/test-sequential-profile.js history test_agent');
}

main().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('❌ 실행 실패:', error.message);
  process.exit(1);
});