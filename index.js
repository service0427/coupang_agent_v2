/**
 * 쿠팡 Chrome 자동화 통합 실행 파일
 *
 * 사용법:
 *   node index.js [옵션]
 *
 * 옵션:
 *   --threads <n>       쓰레드 수 (기본: 4)
 *   --once              1회만 실행 후 종료
 *   --keep-browser      에러 시 브라우저 유지 (디버깅용)
 *   --no-gpu            GPU 비활성화
 *   --proxy <proxy>     프록시 강제 지정 (host:port:user:pass)
 *   --chrome <version>  Chrome 버전 지정 (예: 138, 140)
 *   --direct-url        검색 결과 페이지로 직접 이동
 *   --help              도움말 표시
 *
 * 예시:
 *   node index.js --threads 4              # 4개 쓰레드로 연속 실행
 *   node index.js --threads 1 --once       # 1회 실행 후 종료
 *   node index.js --threads 2 --keep-browser  # 디버깅 모드
 *
 * 로그 저장:
 *   node index.js --threads 4 >> logs/output.log 2>&1
 *   node index.js --threads 4 2>&1 | tee logs/output.log  # 실시간 확인 + 저장
 *   node index.js --threads 4 2>&1 | tee "logs/$(date +%Y%m%d_%H%M%S).log"  # 날짜별 저장
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