/**
 * 환경 설정 - API 모드 전용
 * 
 * ⚠️⚠️⚠️ 절대 수정 금지 ⚠️⚠️⚠️
 * HEADLESS 모드는 절대 사용 불가
 * Ubuntu에서 headless=true 시 TLS 오류로 즉시 차단됨
 */

module.exports = {
  // ⚠️ HEADLESS 강제 비활성화 - 절대 수정 금지
  FORCE_HEADLESS_FALSE: true,  // 이 값이 true면 headless 무조건 false
  HEADLESS_MODE: false,  // 절대 true로 변경 금지
  
  // 화면 크기 설정
  screenWidth: 1200,
  screenHeight: 800,
  
  // 타임아웃 설정
  defaultTimeout: 30000,
  navigationTimeout: 60000
};