/**
 * 브라우저 창 위치 계산 유틸리티
 */

/**
 * 브라우저 창 위치 계산 (4x3 그리드)
 * @param {number} instanceIndex - 인스턴스 인덱스 (0부터 시작)
 * @param {number} windowWidth - 창 너비 (기본값: 300)
 * @param {number} windowHeight - 창 높이 (기본값: 600)
 * @returns {{x: number, y: number}} 창 위치 좌표
 */
function calculateWindowPosition(instanceIndex, windowWidth = 300, windowHeight = 600) {
  const maxCols = 4; // 가로 최대 4개
  const maxRows = 3; // 세로 최대 3개
  const margin = 10; // 창 간격
  
  // 0부터 시작하는 인덱스를 그리드 위치로 변환
  const row = Math.floor(instanceIndex / maxCols) % maxRows;
  const col = instanceIndex % maxCols;
  
  const x = col * (windowWidth + margin);
  const y = row * (windowHeight + margin);
  
  return { x, y };
}

module.exports = {
  calculateWindowPosition
};