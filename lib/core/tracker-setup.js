/**
 * 트래커 설정 더미 모듈
 * 기존 기능은 제거되었으며, 호환성을 위한 빈 함수 제공
 */

/**
 * 트래커 설정 (더미 함수)
 * @param {BrowserContext} context - Playwright 브라우저 컨텍스트
 * @param {Page} page - Playwright 페이지
 * @param {string} profileName - 프로필 이름
 */
async function setupTrackers(context, page, profileName) {
  // 더 이상 트래커 설정을 하지 않음
  // 필요시 여기에 새로운 트래킹 로직 추가 가능
  console.log(`🔧 트래커 설정 건너뜀 (프로필: ${profileName})`);
}

module.exports = {
  setupTrackers
};