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
    trafficMonitor: false, // 네트워크 트래픽 모니터링
    trafficDetail: false,  // 네트워크 트래픽 상세 분석
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
      case '--traffic-monitor':
        options.trafficMonitor = true;
        break;
      case '--traffic-detail':
        options.trafficMonitor = true;  // 상세 분석 시 모니터링도 자동 활성화
        options.trafficDetail = true;
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
  --traffic-monitor      네트워크 트래픽 모니터링 및 요약 분석
  --traffic-detail       네트워크 트래픽 상세 분석 (전체 URL 포함)
  --enter                브라우저 종료 전 Enter 대기
  --help                 도움말 표시

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