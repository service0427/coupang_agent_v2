/**
 * 쿠팡 Chrome 자동화 통합 실행 파일
 */

const dbService = require('./lib/services/db-service');
const { parseArgs, printHelp } = require('./lib/utils/cli-parser');
const { runMultiMode } = require('./lib/runners/multi-mode');
const cleanupReports = require('./cleanup-reports');

// 메인 실행 함수
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    // 자동 리포트 정리 (silent 모드)
    await cleanupReports(true);
    
    let exitCode = 0;
    
    console.log(`🚀 에이전트 '${options.agent}' 실행 시작\n`);
    await runMultiMode(options);
    
    // DB 연결 종료
    await dbService.close();
    
    console.log('\n👋 프로그램 종료');
    process.exit(exitCode);
    
  } catch (error) {
    console.error('\n❌ 프로그램 오류:', error.message);
    await dbService.close();
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };