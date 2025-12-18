/**
 * 명령줄 인자 파싱 유틸리티
 */

/**
 * 명령줄 인자 파싱
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    // 기본 옵션
    help: false,

    // 실행 옵션
    once: false,          // 1회만 실행
    // checkCookies 옵션 제거됨
    // monitor 옵션 제거됨
    threadCount: 4,       // 동시 실행 쓰레드 수
    keepBrowser: false,   // 에러 발생시에도 브라우저 유지 (분석용)
    noGpu: false,         // GPU 하드웨어 가속 비활성화
    proxy: null,          // 강제 프록시 설정 (format: host:port:user:pass)
    chromeVersion: null,  // Chrome 버전 선택 (예: 138, 139, 140 또는 138.0.7204.49)
    directUrl: false,     // URL 직접 모드 (검색 결과 페이지로 직접 이동)
    stealth: false,       // 스텔스 모드 활성화
    status: false         // 상태 모니터링 서버 활성화
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // --key=value 형식 처리
    if (arg.includes('=')) {
      const [key, value] = arg.split('=');
      switch (key) {
        case '-t':
        case '--threads':
          options.threadCount = parseInt(value) || 4;
          continue;
        case '-p':
        case '--proxy':
          options.proxy = value;
          continue;
        case '-c':
        case '--chrome':
          options.chromeVersion = value;
          continue;
      }
    }

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-1':
      case '--once':
        options.once = true;
        break;
      case '-t':
      case '--threads':
        options.threadCount = parseInt(args[++i]) || 4;
        break;
      case '-k':
      case '--keep-browser':
        options.keepBrowser = true;
        break;
      case '--no-gpu':
        options.noGpu = true;
        break;
      case '-p':
      case '--proxy':
        options.proxy = args[++i];
        break;
      case '-c':
      case '--chrome':
      case '--chrome-version':
        options.chromeVersion = args[++i];
        break;
      case '-d':
      case '--direct-url':
        options.directUrl = true;
        break;
      case '--stealth':
        options.stealth = true;
        break;
      case '-s':
      case '--status':
        options.status = true;
        break;
    }
  }

  return options;
}

/**
 * 도움말 출력
 */
function printHelp() {
  console.log(`
쿠팡 Chrome 자동화 도구

사용법: node index.js [옵션]

옵션:
  -t, --threads <N>      쓰레드 수 (기본: 4)
  -s, --status           상태 모니터링 서버 (localhost:3303)
  -1, --once             1회 실행 후 종료
  -k, --keep-browser     에러시 브라우저 유지
  -c, --chrome <버전>    Chrome 버전 (예: 138, 140)
  -p, --proxy <프록시>   프록시 (host:port:user:pass)
  -d, --direct-url       검색 결과 직접 이동
  --no-gpu               GPU 비활성화
  -h, --help             도움말

예시:
  node index.js -t 24 -s          # 24쓰레드 + 상태서버
  node index.js -t=8 -s           # =형식도 가능
  node index.js -1 -k             # 1회 실행, 브라우저 유지
  node index.js -c 140 -p host:port:user:pass
`);
}

module.exports = {
  parseArgs,
  printHelp
};