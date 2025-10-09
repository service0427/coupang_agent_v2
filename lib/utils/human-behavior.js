/**
 * 사람같은 행동 시뮬레이션 모듈
 *
 * 목적: Akamai 봇 탐지 우회를 위한 자연스러운 사용자 행동 시뮬레이션
 *
 * 유지보수 가이드:
 * 1. 타이밍 조정: DELAYS 객체 수정
 * 2. 행동 패턴 조정: BEHAVIOR 객체 수정
 * 3. 디버그: DEBUG_HUMAN_BEHAVIOR=true 환경변수
 *
 * 주요 기능:
 * - 랜덤 대기 시간
 * - 자연스러운 타이핑
 * - 마우스 움직임 시뮬레이션
 * - 스크롤 시뮬레이션
 * - 요소 호버 효과
 * - 마우스 곡선 이동
 */

// ========================================
// 설정값 (여기만 수정하면 전체 적용)
// ========================================

const DELAYS = {
  // 페이지 로드 후 대기
  THINK_TIME: { min: 3000, max: 6000 },      // 생각하는 시간 (페이지 확인)
  AFTER_LOAD: { min: 2500, max: 4500 },      // 로드 후 일반 대기
  BEFORE_CLICK: { min: 500, max: 1500 },     // 클릭 전 대기
  BEFORE_TYPE: { min: 300, max: 800 },       // 타이핑 전 대기

  // 타이핑 속도
  TYPING_PER_CHAR: { min: 80, max: 200 },    // 글자당 딜레이
  TYPING_PAUSE: { min: 300, max: 800 },      // 단어 사이 긴 멈춤 (20% 확률)

  // 마우스/호버
  HOVER_TIME: { min: 500, max: 1500 },       // 요소 위에 머무는 시간
  MOUSE_MOVE_DELAY: { min: 100, max: 300 },  // 마우스 이동 사이 딜레이

  // 스크롤
  SCROLL_STEP_DELAY: { min: 50, max: 150 },  // 스크롤 단계 사이
  AFTER_SCROLL: { min: 800, max: 1200 },     // 스크롤 후 대기

  // 클릭 관련
  MOUSE_DOWN: { min: 50, max: 150 },         // 마우스 다운까지 걸리는 시간
  CLICK_HOLD: { min: 30, max: 100 },         // 버튼 누르고 있는 시간
  AFTER_CLICK: { min: 100, max: 200 }        // 클릭 후 대기
};

const BEHAVIOR = {
  // 마우스 움직임
  MOUSE_MOVEMENTS: { min: 2, max: 4 },       // 랜덤 움직임 횟수
  MOUSE_MOVE_STEPS: { min: 10, max: 20 },    // 이동 단계 수 (부드러움)

  // 스크롤
  SCROLL_DISTANCE: { min: 300, max: 500 },   // 스크롤 거리 (px)
  SCROLL_STEPS: { min: 5, max: 10 },         // 스크롤 단계 수

  // 마우스 곡선 이동
  CURVE_STEPS: { min: 20, max: 30 },         // 곡선 이동 단계
  CURVE_RANDOMNESS: 50,                      // 곡선 랜덤성 (px)

  // 행동 확률
  MOUSE_MOVE_CHANCE: 0.5,                    // 페이지 로드 후 마우스 움직임 확률
  TYPING_PAUSE_CHANCE: 0.2                   // 타이핑 중 멈춤 확률
};

// 디버그 모드
const DEBUG = process.env.DEBUG_HUMAN_BEHAVIOR === 'true';

// ========================================
// 유틸리티 함수
// ========================================

/**
 * 범위 내 랜덤 값
 */
function randomValue(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * 범위 내 랜덤 정수
 */
function randomInt(min, max) {
  return Math.floor(randomValue(min, max));
}

/**
 * 디버그 로그
 */
function log(message) {
  if (DEBUG) console.log(`[HumanBehavior] ${message}`);
}

// ========================================
// 핵심 함수들
// ========================================

/**
 * 1. 랜덤 딜레이
 * @param {Page} page - Playwright 페이지 객체
 * @param {string} delayType - DELAYS 객체의 키 (예: 'AFTER_LOAD')
 * @param {Object} customRange - 커스텀 범위 {min, max} (선택)
 * @returns {Promise<number>} 실제 대기한 시간 (ms)
 */
async function randomDelay(page, delayType = 'AFTER_LOAD', customRange = null) {
  const range = customRange || DELAYS[delayType];
  if (!range) {
    console.warn(`[HumanBehavior] Unknown delay type: ${delayType}, using AFTER_LOAD`);
    return await randomDelay(page, 'AFTER_LOAD');
  }

  const delay = randomValue(range.min, range.max);
  log(`Delay: ${Math.round(delay)}ms (${delayType})`);
  await page.waitForTimeout(delay);
  return delay;
}

/**
 * 2. 자연스러운 타이핑
 * @param {Page} page - Playwright 페이지 객체
 * @param {string} selector - 입력 필드 선택자
 * @param {string} text - 입력할 텍스트
 * @param {Object} options - 옵션
 * @returns {Promise<void>}
 */
async function naturalTyping(page, selector, text, options = {}) {
  log(`Typing: "${text}"`);

  const delayRange = options.delayRange || DELAYS.TYPING_PER_CHAR;
  const pauseRange = options.pauseRange || DELAYS.TYPING_PAUSE;
  const pauseChance = options.pauseChance || BEHAVIOR.TYPING_PAUSE_CHANCE;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const delay = randomValue(delayRange.min, delayRange.max);

    await page.type(selector, char, { delay: 0 });
    await page.waitForTimeout(delay);

    // 확률적으로 긴 멈춤 (생각하는 듯)
    if (Math.random() < pauseChance && i < text.length - 1) {
      const pause = randomValue(pauseRange.min, pauseRange.max);
      log(`  Typing pause: ${Math.round(pause)}ms`);
      await page.waitForTimeout(pause);
    }
  }

  log('Typing completed');
}

/**
 * 3. 랜덤 마우스 움직임
 * @param {Page} page - Playwright 페이지 객체
 * @param {number} count - 움직임 횟수 (null이면 랜덤)
 * @returns {Promise<void>}
 */
async function randomMouseMovement(page, count = null) {
  const movements = count || randomInt(BEHAVIOR.MOUSE_MOVEMENTS.min, BEHAVIOR.MOUSE_MOVEMENTS.max);
  log(`Random mouse movements: ${movements}`);

  const viewport = page.viewportSize();

  for (let i = 0; i < movements; i++) {
    const x = Math.random() * viewport.width;
    const y = Math.random() * viewport.height;
    const steps = randomInt(BEHAVIOR.MOUSE_MOVE_STEPS.min, BEHAVIOR.MOUSE_MOVE_STEPS.max);

    await page.mouse.move(x, y, { steps });
    await randomDelay(page, 'MOUSE_MOVE_DELAY');
  }
}

/**
 * 4. 사람같은 스크롤
 * @param {Page} page - Playwright 페이지 객체
 * @param {string} direction - 'down' 또는 'up'
 * @param {number} distance - 스크롤 거리 (px, null이면 랜덤)
 * @returns {Promise<void>}
 */
async function humanScroll(page, direction = 'down', distance = null) {
  const scrollDistance = distance || randomValue(BEHAVIOR.SCROLL_DISTANCE.min, BEHAVIOR.SCROLL_DISTANCE.max);
  const steps = randomInt(BEHAVIOR.SCROLL_STEPS.min, BEHAVIOR.SCROLL_STEPS.max);
  const stepDistance = scrollDistance / steps;

  log(`Scrolling ${direction}: ${Math.round(scrollDistance)}px in ${steps} steps`);

  for (let i = 0; i < steps; i++) {
    await page.evaluate((dist, dir) => {
      window.scrollBy(0, dir === 'down' ? dist : -dist);
    }, stepDistance, direction);
    await randomDelay(page, 'SCROLL_STEP_DELAY');
  }

  await randomDelay(page, 'AFTER_SCROLL');
}

/**
 * 5. 요소 호버
 * @param {Page} page - Playwright 페이지 객체
 * @param {ElementHandle} element - 호버할 요소
 * @returns {Promise<void>}
 */
async function hoverElement(page, element) {
  log('Hovering element');

  await element.hover();
  await randomDelay(page, 'HOVER_TIME');

  // 약간 마우스 움직이기 (사람처럼)
  const box = await element.boundingBox();
  if (box) {
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);
    await page.mouse.move(x, y, { steps: 5 });
  }
}

/**
 * 6. 마우스 곡선 이동
 * @param {Page} page - Playwright 페이지 객체
 * @param {number} targetX - 목표 X 좌표
 * @param {number} targetY - 목표 Y 좌표
 * @returns {Promise<void>}
 */
async function mouseMoveCurve(page, targetX, targetY) {
  log(`Mouse curve to (${Math.round(targetX)}, ${Math.round(targetY)})`);

  // 현재 마우스 위치는 알 수 없으므로 viewport 중앙에서 시작 가정
  const viewport = page.viewportSize();
  const startX = viewport.width / 2;
  const startY = viewport.height / 2;

  const steps = randomInt(BEHAVIOR.CURVE_STEPS.min, BEHAVIOR.CURVE_STEPS.max);
  const randomness = BEHAVIOR.CURVE_RANDOMNESS;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Bezier curve with randomness
    const x = startX + (targetX - startX) * t;
    const y = startY + (targetY - startY) * t + Math.sin(t * Math.PI) * randomness * (Math.random() - 0.5);

    await page.mouse.move(x, y);
    await page.waitForTimeout(randomValue(5, 15));
  }
}

// ========================================
// 복합 행동 (여러 동작 조합)
// ========================================

/**
 * 페이지 로드 후 자연스러운 행동
 * @param {Page} page - Playwright 페이지 객체
 * @param {Object} options - 옵션
 * @returns {Promise<void>}
 */
async function afterPageLoad(page, options = {}) {
  log('After page load behavior');

  // 생각하는 시간
  await randomDelay(page, 'THINK_TIME', options.thinkTime);

  // 마우스 움직임 (확률적)
  if (Math.random() < BEHAVIOR.MOUSE_MOVE_CHANCE) {
    await randomMouseMovement(page, 2);
  }
}

/**
 * 검색 전 자연스러운 행동
 * @param {Page} page - Playwright 페이지 객체
 * @returns {Promise<void>}
 */
async function beforeSearch(page) {
  log('Before search behavior');

  await randomDelay(page, 'BEFORE_TYPE');

  // 마우스 약간 움직이기 (30% 확률)
  if (Math.random() < 0.3) {
    const viewport = page.viewportSize();
    const x = viewport.width * (0.3 + Math.random() * 0.4);
    const y = viewport.height * (0.2 + Math.random() * 0.3);
    await page.mouse.move(x, y, { steps: 10 });
  }
}

/**
 * 상품 클릭 전 자연스러운 행동
 * @param {Page} page - Playwright 페이지 객체
 * @param {ElementHandle} productElement - 상품 요소
 * @returns {Promise<void>}
 */
async function beforeProductClick(page, productElement) {
  log('Before product click behavior');

  // 스크롤로 상품이 화면 중앙에 오도록
  try {
    await productElement.scrollIntoViewIfNeeded();
  } catch (e) {
    // scrollIntoViewIfNeeded 실패 시 기본 스크롤
    await productElement.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  await randomDelay(page, 'AFTER_SCROLL');

  // 호버
  await hoverElement(page, productElement);

  // 클릭 전 짧은 대기
  await randomDelay(page, 'BEFORE_CLICK');
}

// ========================================
// Export
// ========================================

module.exports = {
  // 기본 함수
  randomDelay,
  naturalTyping,
  randomMouseMovement,
  humanScroll,
  hoverElement,
  mouseMoveCurve,

  // 복합 행동
  afterPageLoad,
  beforeSearch,
  beforeProductClick,

  // 설정값 직접 접근 (필요시)
  DELAYS,
  BEHAVIOR
};
