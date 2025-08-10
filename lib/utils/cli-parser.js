/**
 * 명령줄 인자 파싱 유틸리티
 */

const environment = require('../../environment.js');

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
    
    // API 모드 옵션
    apiMode: false,       // API 모드 활성화
    instanceNumber: 1,    // 인스턴스 번호
    threadCount: 4,       // 동시 실행 쓰레드 수
    hubBaseUrl: 'http://mkt.techb.kr:3001',  // 허브 서버 URL
    pollInterval: 10000,  // 작업 폴링 간격 (ms)
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
      case '--api-mode':
        options.apiMode = true;
        break;
      case '--instance':
        options.instanceNumber = parseInt(args[++i]) || 1;
        break;
      case '--threads':
        options.threadCount = parseInt(args[++i]) || 4;
        options.apiMode = true; // --threads 사용 시 자동으로 API 모드 활성화
        break;
      case '--hub-url':
        options.hubBaseUrl = args[++i];
        break;
      case '--poll-interval':
        options.pollInterval = parseInt(args[++i]) || 10000;
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

API 모드 옵션:
  --api-mode             API 모드로 실행 (허브 서버와 통신)
  --instance <번호>      인스턴스 번호 (기본값: 1)
  --threads <수>         동시 실행 쓰레드 수 (기본값: 4, API 모드 자동 활성화)
  --hub-url <URL>        허브 서버 URL (기본값: http://mkt.techb.kr:3001)
  --poll-interval <ms>   작업 폴링 간격 밀리초 (기본값: 10000)

트래픽 모니터링:
  - 기본: 트래픽 데이터는 v2_execution_logs에 저장
  - --monitor: 실시간 트래픽 로그 출력 (목표 500KB 대비 현재 사용량, 캐시율, 효율성 점수)

예시:
  # 기본 에이전트 실행 (데이터베이스 모드)
  node index.js
  
  # 다른 에이전트로 실행
  node index.js --agent test2
  
  # 1회만 실행
  node index.js --once
  
  # 1회 실행 + Enter 대기
  node index.js --once --enter
  
  # API 모드로 실행 (인스턴스 1, 4개 쓰레드)
  node index.js --api-mode --instance 1
  
  # API 모드 + 8개 쓰레드 + 다른 설정
  node index.js --api-mode --instance 2 --threads 8 --hub-url http://localhost:3001 --poll-interval 5000

※ 데이터베이스 모드: 지정된 agent의 모든 키워드를 계속 실행합니다.
※ API 모드: 허브 서버에서 작업을 할당받아 실행하며, 1-30번 유저 폴더를 순차적으로 사용합니다.
※ 모든 키워드별 설정(프록시, 프로필, 장바구니, 검색모드 등)은 허브 서버에서 관리됩니다.
`);
}

module.exports = {
  parseArgs,
  printHelp
};