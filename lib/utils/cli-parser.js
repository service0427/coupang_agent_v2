/**
 * 명령줄 인자 파싱 유틸리티
 */

const environment = require('../../environment');

/**
 * 명령줄 인자 파싱
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    // 기본 옵션
    help: false,
    agent: environment.agentName,
    
    // 실행 모드
    id: null,             // 특정 ID 실행 (우선순위 높음)
    
    // 실행 옵션
    once: false,          // 1회만 실행
    search: false,        // 검색창 입력 모드
    optimize: false,      // 최적화 모드
    checkCookies: false,  // 쿠키 체크 활성화
    noIpChange: false,    // IP 변경 비활성화 (테스트용)
    maxRounds: 10,        // 최대 라운드 수
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        options.help = true;
        break;
      case '--agent':
        options.agent = args[++i];
        break;
      case '--id':
        options.id = parseInt(args[++i]);
        break;
      case '--once':
        options.once = true;
        break;
      case '--search':
        options.search = true;
        break;
      case '--optimize':
        options.optimize = true;
        break;
      case '--check-cookies':
        options.checkCookies = true;
        break;
      case '--no-ip-change':
        options.noIpChange = true;
        break;
      case '--max-rounds':
        options.maxRounds = parseInt(args[++i]);
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
  --agent <이름>         실행할 에이전트 (기본값: ${environment.agentName})
  --id <번호>            특정 키워드 ID만 실행 (우선순위 높음)
  --once                 1회만 실행 후 종료
  --search               검색창 입력 모드 (기본: URL 직접 이동)
  --optimize             메인페이지 최적화 활성화
  --check-cookies        검색 결과 페이지에서 쿠키 상태 체크
  --no-ip-change         IP 변경 비활성화 (테스트용)
  --max-rounds <수>      최대 실행 라운드 (기본값: 10)
  --help                 도움말 표시

예시:
  # 기본 에이전트 실행
  node index.js
  
  # 특정 ID만 실행
  node index.js --id 123
  
  # 다른 에이전트로 실행
  node index.js --agent test2
  
  # 최적화 + 1회만 실행
  node index.js --optimize --once --check-cookies

※ 기본적으로 지정된 agent의 모든 키워드를 실행합니다.
※ 모든 키워드별 설정(프록시, 프로필, 장바구니 등)은 DB에서 관리됩니다.
`);
}

module.exports = {
  parseArgs,
  printHelp
};