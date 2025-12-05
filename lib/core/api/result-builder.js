/**
 * 작업 결과 생성 및 수집
 * - 성공 응답 생성
 * - 상품 데이터 수집
 * - rank_data 추출
 *
 * Updated: 2025-10-09 - api-mode.js에서 분리
 * Updated: 2025-12-05 - akamai_events 필드 추가
 */

const { getSessionEventResults, clearSessionEvents } = require('../optimizer');

/**
 * IP 정보 추출 헬퍼
 */
function extractIpFromResult(automationResult) {
  const actualIp = automationResult?.actualIp;

  if (actualIp && typeof actualIp === 'object' && actualIp.ip) {
    return actualIp.ip;
  }

  if (typeof actualIp === 'string') {
    return actualIp;
  }

  return null;
}

/**
 * referer URL에서 rank_data 객체 추출
 * @param {string} refererUrl - 쿠팡 검색 페이지 URL
 * @param {number} realRank - 실제 순위 (광고 제외)
 * @returns {Object} rank_data 객체 {page, listSize, rank}
 */
function extractRankDataFromReferer(refererUrl, realRank) {
  const defaultRankData = {
    page: 1,
    listSize: 36,
    rank: realRank ?? null
  };

  if (!refererUrl) {
    return defaultRankData;
  }

  try {
    const url = new URL(refererUrl);

    // page 파라미터 추출 (기본값: 1)
    const pageParam = url.searchParams.get('page');
    const page = pageParam ? parseInt(pageParam) : 1;

    // listSize 파라미터 추출 (기본값: 36)
    const listSizeParam = url.searchParams.get('listSize');
    const listSize = listSizeParam ? parseInt(listSizeParam) : 36;

    return {
      page: isNaN(page) ? 1 : page,
      listSize: isNaN(listSize) ? 36 : listSize,
      rank: realRank ?? null
    };
  } catch (error) {
    // URL 파싱 실패 시 기본값 반환
    return defaultRankData;
  }
}

/**
 * 상품 데이터 수집 (최적화된 구조 - rank_data 객체 사용)
 * @param {Object} automationResult - 자동화 실행 결과
 * @returns {Object} product_data {rank_data, rating, review_count}
 */
function collectProductData(automationResult) {
  // 상품을 찾았는지 여부 확인
  const productFound = automationResult?.productFound;

  // referer에서 rank_data 추출 (상품을 찾지 못했으면 rank=0)
  const realRank = productFound ? automationResult.realRank : 0;
  const rankData = extractRankDataFromReferer(automationResult?.referer, realRank);

  // 검색 결과 없음 특수 처리
  // ⚠️ 정상 페이지 범위: listSize=36 → 1~26페이지, listSize=72 → 1~13페이지
  // ⚠️ page >= 100은 실제 페이지 번호가 아닌 "검색 결과 없음" 상태 코드
  //
  // 로직 설명:
  // 1. 상품을 찾은 경우: rankData.page = 실제 페이지 (1~26 또는 1~13)
  // 2. 10페이지 내에서 못 찾은 경우: rankData.page = 마지막 검색 페이지, rank = 0
  // 3. 검색 결과가 아예 없는 경우: pagesSearched >= 100 AND !productFound
  //    → page = pagesSearched 값 (102, 106 등의 특수 코드), rank = 0
  //
  // ⚠️ productFound 체크가 필수: 상품을 찾았는데 page=102로 덮어씌워지는 것 방지
  if (automationResult?.pagesSearched >= 100 && !productFound) {
    rankData.page = automationResult.pagesSearched;
  }

  // 축소된 product_data: 3개 필드만 반환
  const productData = {
    rank_data: rankData,  // {page, listSize, rank} 객체 (상품 미발견시 rank=0)
    rating: productFound ? (automationResult.productInfo?.rating ?? 0) : null,  // 상품 미발견시 null
    review_count: productFound ? (automationResult.productInfo?.reviewCount ?? 0) : null  // 상품 미발견시 null
  };

  return productData;
}

/**
 * work_type별 성공 응답 생성
 * @param {string} workType - 작업 타입 (rank, click, product_info)
 * @param {string} allocationKey - 할당 키
 * @param {number} proxyId - 프록시 ID
 * @param {Object} automationResult - 자동화 실행 결과
 * @param {string} chromeVersion - Chrome 버전
 * @returns {Object} 성공 응답 객체
 */
function buildSuccessResponse(workType, allocationKey, proxyId, automationResult, chromeVersion) {
  if (workType === 'product_info') {
    // 상품 정보 추출 작업 응답
    return {
      allocation_key: allocationKey,
      success: true,
      actual_ip: extractIpFromResult(automationResult),
      product_data: automationResult.productData || {},
      chrome_version: chromeVersion || 'default'
    };
  } else {
    // 기존 키워드 검색 작업 응답
    const productData = collectProductData(automationResult);
    const response = {
      allocation_key: allocationKey,
      proxy_id: proxyId,
      success: true,
      actual_ip: extractIpFromResult(automationResult),
      rank_data: productData.rank_data,  // {page, listSize, rank} 객체
      rating: productData.rating,
      review_count: productData.review_count,
      chrome_version: chromeVersion || 'default'
    };

    // _abck 쿠키가 있는 경우에만 cookies와 cookie_state 추가
    if (automationResult.cookies) {
      response.cookies = automationResult.cookies;
      response.cookie_state = automationResult.cookieState || 'success';
    }

    // click 타입일 때 akamai_events 추가
    if (workType === 'click') {
      const akamaiEvents = getSessionEventResults(allocationKey);
      if (akamaiEvents) {
        response.akamai_events = akamaiEvents;
      }
      // API 전송용 데이터 추출 후 세션 초기화
      clearSessionEvents(allocationKey);
    }

    return response;
  }
}

module.exports = {
  extractRankDataFromReferer,
  collectProductData,
  buildSuccessResponse
};
