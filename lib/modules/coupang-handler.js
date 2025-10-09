/**
 * 쿠팡 웹사이트 자동화 핸들러 (Chrome 전용)
 * - 상품 코드로 검색 및 클릭
 * - 순위 측정
 * - 장바구니 클릭 옵션
 *
 * Updated: 2025-10-09 - 모듈 분리, 재수출만 수행
 */

const { checkIP, checkWebDriverStatus } = require('../utils/browser-helpers');
const { searchAndClickProduct } = require('./search/search-executor');
const { executeDirectMode } = require('./search/search-mode-handler');
const { moveToNextPage } = require('./search/pagination-handler');

module.exports = {
  searchAndClickProduct,
  checkIP,
  checkWebDriverStatus,
  executeDirectMode,
  moveToNextPage
};
