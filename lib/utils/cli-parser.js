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
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        options.help = true;
        break;
      case '--once':
        options.once = true;
        break;
      // --check-cookies 옵션 제거됨
      // --monitor 옵션 제거됨
      case '--threads':
        options.threadCount = parseInt(args[++i]) || 4;
        break;
      case '--keep-browser':
        options.keepBrowser = true;
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

실행 옵션:
  --once                 1회만 실행 후 종료
  # 쿠키와 모니터 옵션 제거됨
  --threads <수>         동시 실행 쓰레드 수 (기본값: 4)
  --keep-browser         에러 발생시에도 브라우저 유지 (분석용)
  --help                 도움말 표시

트래픽 최적화:
  - 트래픽 최적화 자동 적용 (목표: 500KB 이하)

예시:
  # 기본 실행 (4개 스레드)
  node index.js
  
  # 1개 스레드로 실행
  node index.js --threads 1
  
  # 1회만 실행 후 종료
  node index.js --once
  
  # 여러 옵션 조합
  node index.js --threads 2 --once --keep-browser

※ 허브 서버(http://mkt.techb.kr:3302)에서 작업을 할당받아 실행합니다.
※ 모든 키워드별 설정(프록시, 프로필, 장바구니, 검색모드 등)은 허브 서버에서 관리됩니다.
`);
}

module.exports = {
  parseArgs,
  printHelp
};