/**
 * Chrome 경로 테스트 - 순차 폴더 시스템 확인
 */

const { getUserDataDir } = require('../lib/utils/browser-utils');

async function testChromePath() {
  console.log('🧪 Chrome 경로 테스트\n');
  
  try {
    const profileNames = ['instance_0', 'instance_1', 'test_agent'];
    
    for (const profileName of profileNames) {
      console.log(`📁 ${profileName} 경로 테스트:`);
      
      try {
        const path = await getUserDataDir(profileName);
        console.log(`   ✅ 경로: ${path}`);
      } catch (error) {
        console.log(`   ❌ 실패: ${error.message}`);
      }
      console.log();
    }
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

testChromePath();