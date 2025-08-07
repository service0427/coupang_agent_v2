/**
 * 스마트 프로필 관리 테스트
 * - 실행 횟수별 동작 확인
 * - 사용법: node tools/test-smart-profile.js [프로필명]
 */

const SmartProfileManager = require('../lib/utils/smart-profile-manager');

async function testSmartProfile() {
  const profileName = process.argv[2] || 'chrome';
  const manager = new SmartProfileManager(profileName);
  
  console.log('🧪 스마트 프로필 관리 테스트\n');
  
  try {
    // 현재 상태 확인
    console.log('📊 현재 상태:');
    const status = await manager.getStatus();
    console.log(`   프로필: ${status.profileName}`);
    console.log(`   실행 횟수: ${status.executionCount}`);
    console.log(`   주기 위치: ${status.cyclePosition}`);
    console.log(`   다음 동작: ${status.nextAction}`);
    console.log(`   프로필 존재: ${status.profileExists ? '✅' : '❌'}`);
    
    console.log('\n🔄 프로필 준비 실행:');
    
    // 프로필 준비 실행
    const result = await manager.prepareProfile();
    
    console.log('\n✅ 결과:');
    console.log(`   최초 실행: ${result.isFirstRun ? '✅' : '❌'}`);
    console.log(`   주기 리셋: ${result.isCycleReset ? '✅' : '❌'}`);
    console.log(`   실행 번호: ${result.executionCount}`);
    
    // 업데이트된 상태 확인
    console.log('\n📊 업데이트된 상태:');
    const newStatus = await manager.getStatus();
    console.log(`   실행 횟수: ${newStatus.executionCount}`);
    console.log(`   주기 위치: ${newStatus.cyclePosition}`);
    console.log(`   다음 동작: ${newStatus.nextAction}`);
    
    console.log('\n💡 사용법:');
    console.log('1. 일반 실행: const manager = new SmartProfileManager("chrome");');
    console.log('2. 준비 실행: await manager.prepareProfile();');
    console.log('3. 수동 리셋: await manager.manualReset("blocking_detected");');
    console.log('4. 상태 확인: await manager.getStatus();');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

// 수동 리셋 옵션
if (process.argv[2] === 'reset') {
  const profileName = process.argv[3] || 'chrome';
  const manager = new SmartProfileManager(profileName);
  
  manager.manualReset('manual_reset').then(() => {
    console.log(`✅ ${profileName} 프로필 수동 리셋 완료`);
  }).catch(error => {
    console.error('❌ 수동 리셋 실패:', error.message);
  });
} else {
  testSmartProfile();
}