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
    
    // 실행 옵션
    once: false,          // 1회만 실행
    checkCookies: false,  // 쿠키 체크 활성화
    noIpChange: false,    // IP 변경 비활성화 (테스트용)
    monitor: false,       // 실시간 트래픽 모니터링 로그 출력
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        options.help = true;
        break;
      case '--agent':
        options.agent = args[++i];
        break;
      case '--once':
        options.once = true;
        break;
      case '--check-cookies':
        options.checkCookies = true;
        break;
      case '--no-ip-change':
        options.noIpChange = true;
        break;
      case '--monitor':
        options.monitor = true;  // 실시간 트래픽 모니터링 활성화
        break;
      case '--enter':
        options.waitForEnter = true;
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
  --once                 1회만 실행 후 종료
  --check-cookies        검색 결과 페이지에서 쿠키 상태 체크
  --no-ip-change         IP 변경 비활성화 (테스트용)
  --monitor              실시간 트래픽 모니터링 로그 출력
  --enter                브라우저 종료 전 Enter 대기
  --help                 도움말 표시

트래픽 모니터링:
  - 기본: 트래픽 데이터는 v2_execution_logs에 저장
  - --monitor: 실시간 트래픽 로그 출력 (목표 500KB 대비 현재 사용량, 캐시율, 효율성 점수)

예시:
  # 기본 에이전트 실행
  node index.js
  
  # 다른 에이전트로 실행
  node index.js --agent test2
  
  # 1회만 실행
  node index.js --once
  
  # 1회 실행 + Enter 대기
  node index.js --once --enter

※ 기본적으로 지정된 agent의 모든 키워드를 계속 실행합니다.
※ 모든 키워드별 설정(프록시, 프로필, 장바구니, 검색모드 등)은 DB에서 관리됩니다.
`);
}

module.exports = {
  parseArgs,
  printHelp
};