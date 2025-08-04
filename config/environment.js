/**
 * 환경 설정 - 하드코딩된 값 사용
 */

module.exports = {
  // 데이터베이스 설정
  database: {
    host: 'mkt.techb.kr',
    port: 5432,
    database: 'coupang_test',
    user: 'techb_pp',
    password: 'Tech1324!'
  },
  
  // 화면 크기 설정
  screenWidth: 1200,
  screenHeight: 800,
  
  // 에이전트 설정
  agentName: 'default',
  
  // 타임아웃 설정
  defaultTimeout: 30000,
  navigationTimeout: 60000
};