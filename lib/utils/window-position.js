/**
 * 브라우저 창 위치 계산 유틸리티
 * 동적으로 threads 수에 따라 화면 레이아웃 자동 조정
 * 최소 크기 1024x768 보장
 */

const { calculateBrowserPosition, getScreenResolution } = require('./screen-layout');

// 전체 스레드 수를 저장할 전역 변수
let totalThreadCount = 1;

// 화면 해상도 캐시 (한 번만 감지)
let cachedScreenResolution = null;

/**
 * 전체 스레드 수 설정 (API 모드 시작 시 호출)
 * @param {number} count - 전체 스레드 수
 */
function setTotalThreadCount(count) {
  totalThreadCount = count;
  
  // 배치 전략 안내
  if (count <= 4) {
    console.log(`🔢 브라우저 ${count}개: 그리드 배치 모드`);
  } else {
    console.log(`🔢 브라우저 ${count}개: 계단식 배치 모드 (겹침 허용)`);
  }
}

/**
 * 화면 해상도 초기화 (동기적 처리를 위한 사전 로드)
 */
async function initializeScreenResolution() {
  if (!cachedScreenResolution) {
    cachedScreenResolution = await getScreenResolution();
    console.log(`📐 초기화된 화면 해상도: ${cachedScreenResolution.width}x${cachedScreenResolution.height}`);
  }
  return cachedScreenResolution;
}

/**
 * 브라우저 창 위치 계산 (스레드 수 자동 감지)
 * @param {number} instanceIndex - 인스턴스 인덱스 (0부터 시작)
 * @returns {{x: number, y: number}} 창 위치 좌표
 */
function calculateWindowPosition(instanceIndex) {
  // 스레드 번호는 1부터 시작
  const threadNumber = instanceIndex + 1;
  
  // 캐시된 해상도 사용, 없으면 기본값
  const screenRes = cachedScreenResolution || { width: 2560, height: 1440 };
  
  // 브라우저 위치 계산
  const position = calculateBrowserPosition(threadNumber, totalThreadCount, screenRes);
  
  // 크기 정보는 viewport로 전달되므로 여기서는 위치만 반환
  return { 
    x: position.x, 
    y: position.y 
  };
}

/**
 * 브라우저 뷰포트 크기 계산
 * @param {number} instanceIndex - 인스턴스 인덱스 (0부터 시작)
 * @returns {{width: number, height: number}} 뷰포트 크기
 */
function calculateViewportSize(instanceIndex) {
  const threadNumber = instanceIndex + 1;
  const screenRes = cachedScreenResolution || { width: 2560, height: 1440 };
  
  const position = calculateBrowserPosition(threadNumber, totalThreadCount, screenRes);
  
  return {
    width: position.width,
    height: position.height
  };
}

module.exports = {
  calculateWindowPosition,
  calculateViewportSize,
  setTotalThreadCount,
  initializeScreenResolution
};