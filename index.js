/**
 * 쿠팡 Chrome 자동화 통합 실행 파일
 */

const { parseArgs, printHelp } = require('./lib/utils/cli-parser');
const { runApiMode } = require('./lib/core/api-mode');
const UbuntuSetup = require('./lib/utils/ubuntu-setup');

// 메인 실행 함수
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    // Ubuntu 환경에서 종속성 확인 (빠른 확인)
    if (process.platform === 'linux') {
      console.log('🐧 Ubuntu 환경 감지 - Chrome 실행 환경 점검 중...');
      const ubuntuCheck = await UbuntuSetup.checkSystemResources();
      if (!ubuntuCheck.success) {
        console.log('⚠️ Ubuntu 환경 설정 문제가 감지되었습니다. 전체 점검을 위해 다음 명령을 실행하세요:');
        console.log('node -e "require(\'./lib/utils/ubuntu-setup\').checkAll()"');
      }
    }
    
    // API 모드로만 실행
    console.log(`🚀 API 모드 실행 시작\n`);
    await runApiMode(options);
    
    console.log('\n👋 프로그램 종료');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ 프로그램 오류:', error.message);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}