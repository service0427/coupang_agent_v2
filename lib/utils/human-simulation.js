/**
 * 자연스러운 사용자 행동 시뮬레이션 모듈
 *
 * 핵심 원칙: "사람은 상품을 바로 클릭하지 않는다"
 *
 * Akamai 봇 탐지 우회를 위한 기능:
 * - wheel 이벤트 발생 (스크롤)
 * - pointer/mouse 이벤트 발생
 * - 관성 스크롤 + 지터
 * - 베지어 곡선 마우스 이동
 * - 랜덤 행동 시퀀스
 *
 * @module human-simulation
 */

// ========================================
// 설정값
// ========================================

const CONFIG = {
  // ⚠️ 시간 제한 (무한 대기 방지)
  TIME_LIMITS: {
    BEFORE_PRODUCT_CLICK: 8000,   // 상품 클릭 전 최대 8초
    BEFORE_CART_CLICK: 10000,     // 장바구니 클릭 전 최대 10초
    SINGLE_ACTION: 3000,          // 단일 행동 최대 3초
    SCROLL_OPERATION: 2000,       // 스크롤 작업 최대 2초
  },

  // 휠 이벤트
  WHEEL: {
    DELTA_Y: { min: 80, max: 120 },
    EVENTS_PER_SCROLL: { min: 3, max: 8 },
    INTERVAL: { min: 16, max: 50 },
  },

  // 스크롤 관성
  MOMENTUM: {
    INITIAL_SPEED: 1.0,
    DECELERATION: 0.85,
    MIN_SPEED: 0.1,
  },

  // 지터 (미세 진동)
  JITTER: {
    ENABLED: true,
    X_RANGE: { min: -3, max: 3 },
    Y_RANGE: { min: -2, max: 2 },
    CHANCE: 0.3,
  },

  // 스크롤 중 일시정지
  SCROLL_PAUSE: {
    CHANCE: 0.15,
    DURATION: { min: 100, max: 400 },
  },

  // 오버슈트 (과다 스크롤 후 복귀)
  OVERSHOOT: {
    CHANCE: 0.25,
    AMOUNT: { min: 50, max: 150 },
    RETURN_DELAY: { min: 200, max: 500 },
  },

  // 탐색 스크롤
  BROWSE: {
    MIN_SCROLLS: 2,
    MAX_SCROLLS: 5,
    DIRECTION_CHANGE_CHANCE: 0.4,
    READ_PAUSE: { min: 800, max: 2000 },
  },

  // 마우스 이동
  MOUSE: {
    CURVE_STEPS: { min: 15, max: 30 },
    CURVE_FACTOR: 0.3,
    STEP_DELAY: { min: 5, max: 15 },
  },

  // 호버
  HOVER: {
    MICRO_MOVE_COUNT: { min: 2, max: 5 },
    MICRO_MOVE_RANGE: { min: -5, max: 5 },
    DURATION: { min: 100, max: 300 },
  },

  // 행동 사이 대기
  ACTION_DELAY: { min: 200, max: 600 },
};

// 행동 유형 정의 (가중치 기반)
const BEHAVIOR_ACTIONS = {
  HOVER_OTHER_PRODUCT: {
    weight: 25,
    description: '다른 상품에 호버',
    params: {
      count: { min: 1, max: 3 },
      duration: { min: 500, max: 1500 },
    }
  },
  HOVER_TARGET_THEN_LEAVE: {
    weight: 15,
    description: '타겟 호버했다가 떠남',
    params: {
      hoverDuration: { min: 300, max: 800 },
      leaveDistance: { min: 100, max: 300 },
    }
  },
  SCROLL_PAST_TARGET: {
    weight: 20,
    description: '타겟 지나쳐서 스크롤',
    params: {
      distance: { min: 200, max: 500 },
      returnChance: 0.7,
    }
  },
  SCROLL_BROWSE: {
    weight: 18,
    description: '탐색 스크롤 (위아래)',
    params: {
      scrollCount: { min: 2, max: 4 },
      distance: { min: 150, max: 400 },
    }
  },
  SCROLL_TO_BOTTOM: {
    weight: 8,
    description: '맨 아래까지 스크롤',
    params: {
      pauseAtBottom: { min: 500, max: 1500 },
    }
  },
  PAUSE_THINKING: {
    weight: 15,
    description: '생각하며 멈춤',
    params: {
      duration: { min: 800, max: 2000 },
    }
  },
  PAUSE_READING: {
    weight: 12,
    description: '읽는 척 멈춤 (마우스 미세 움직임)',
    params: {
      duration: { min: 1000, max: 3000 },
      microMoveCount: { min: 2, max: 5 },
    }
  },
  MOUSE_WANDER: {
    weight: 10,
    description: '마우스 방황',
    params: {
      moveCount: { min: 2, max: 4 },
    }
  },
  MOUSE_TO_EDGE: {
    weight: 5,
    description: '화면 가장자리로 이동',
    params: {
      returnChance: 0.8,
    }
  },
  COMPARE_PRODUCTS: {
    weight: 12,
    description: '상품 비교 (여러 개 왔다갔다)',
    params: {
      productCount: { min: 2, max: 3 },
      iterations: { min: 2, max: 3 },
      hoverDuration: { min: 400, max: 1000 },
    }
  },
};

// 상세 페이지용 행동
const DETAIL_PAGE_ACTIONS = [
  { name: 'SCROLL_TO_BOTTOM', weight: 30 },
  { name: 'SCROLL_BROWSE', weight: 25 },
  { name: 'PAUSE_READING', weight: 20 },
  { name: 'MOUSE_WANDER', weight: 15 },
  { name: 'HOVER_IMAGE', weight: 10 },
];

// 디버그 모드
const DEBUG = process.env.DEBUG_HUMAN_SIMULATION === 'true';

// 마우스 위치 추적
let lastMouseX = null;
let lastMouseY = null;
let sessionStartTime = null;

// ========================================
// 유틸리티 함수
// ========================================

function log(message) {
  if (DEBUG) console.log(`[HumanSim] ${message}`);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 타임아웃 래퍼 - 지정 시간 초과 시 자동 완료
 */
function withTimeout(promise, ms, operationName = 'operation') {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => {
        log(`⏱️ ${operationName} 시간 초과 (${ms}ms) - 건너뜀`);
        resolve();
      }, ms);
    })
  ]);
}

/**
 * 시간 제한 체크용 컨텍스트
 */
class TimeoutContext {
  constructor(maxDuration) {
    this.startTime = Date.now();
    this.maxDuration = maxDuration;
  }

  get remaining() {
    return Math.max(0, this.maxDuration - (Date.now() - this.startTime));
  }

  get expired() {
    return this.remaining <= 0;
  }

  get elapsed() {
    return Date.now() - this.startTime;
  }
}

function getRandomFromRange(range) {
  if (typeof range === 'object' && 'min' in range && 'max' in range) {
    return randomInt(range.min, range.max);
  }
  return range;
}

/**
 * 시간대별 속도 조절
 */
function getTimeBasedSpeedMultiplier() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 6) return 1.3;
  if (hour >= 6 && hour < 9) return 1.1;
  if (hour >= 9 && hour < 18) return 1.0;
  if (hour >= 18 && hour < 22) return 0.95;
  return 1.15;
}

/**
 * 세션 피로도
 */
function getSessionFatigueMultiplier() {
  if (!sessionStartTime) {
    sessionStartTime = Date.now();
    return 1.0;
  }
  const minutesActive = (Date.now() - sessionStartTime) / 60000;
  if (minutesActive < 10) return 1.0;
  if (minutesActive < 30) return 1.05;
  if (minutesActive < 60) return 1.1;
  return 1.15;
}

/**
 * 지연 시간에 변동성 적용
 */
function applyDelayVariation(baseDelay) {
  const timeMultiplier = getTimeBasedSpeedMultiplier();
  const fatigueMultiplier = getSessionFatigueMultiplier();
  const randomVariation = randomFloat(0.8, 1.2);
  return Math.round(baseDelay * timeMultiplier * fatigueMultiplier * randomVariation);
}

// ========================================
// 이벤트 발생 함수
// ========================================

/**
 * wheel 이벤트 발생
 */
async function dispatchWheelEvent(page, deltaY, x, y) {
  await page.evaluate(({ deltaY, x, y }) => {
    const target = document.elementFromPoint(x, y) || document.documentElement;
    const event = new WheelEvent('wheel', {
      deltaX: 0,
      deltaY: deltaY,
      deltaZ: 0,
      deltaMode: 0,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y + (window.screenY || 0),
      bubbles: true,
      cancelable: true,
      view: window
    });
    target.dispatchEvent(event);
  }, { deltaY, x, y });
}

/**
 * pointer/mouse 이벤트 발생
 */
async function dispatchPointerEvents(page, type, x, y) {
  await page.evaluate(({ type, x, y }) => {
    const target = document.elementFromPoint(x, y) || document.documentElement;

    // Pointer Event
    const pointerEvent = new PointerEvent(`pointer${type}`, {
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y + (window.screenY || 0),
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      view: window
    });
    target.dispatchEvent(pointerEvent);

    // Mouse Event
    const mouseEvent = new MouseEvent(`mouse${type}`, {
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y + (window.screenY || 0),
      bubbles: true,
      cancelable: true,
      view: window
    });
    target.dispatchEvent(mouseEvent);
  }, { type, x, y });
}

/**
 * scroll/scrollend 이벤트 발생
 */
async function dispatchScrollEvents(page, isEnd = false) {
  await page.evaluate((isEnd) => {
    const scrollEvent = new Event('scroll', { bubbles: true });
    document.dispatchEvent(scrollEvent);
    window.dispatchEvent(scrollEvent);

    if (isEnd) {
      const scrollEndEvent = new Event('scrollend', { bubbles: true });
      document.dispatchEvent(scrollEndEvent);
      window.dispatchEvent(scrollEndEvent);
    }
  }, isEnd);
}

// ========================================
// 스크롤 함수
// ========================================

/**
 * 관성 있는 자연스러운 스크롤
 */
async function naturalScroll(page, totalDistance, direction = 'down') {
  const sign = direction === 'down' ? 1 : -1;
  let remaining = Math.abs(totalDistance);
  let speed = CONFIG.MOMENTUM.INITIAL_SPEED;

  const viewport = page.viewportSize();
  let mouseX = lastMouseX || viewport.width / 2 + randomInt(-100, 100);
  let mouseY = lastMouseY || viewport.height / 2 + randomInt(-50, 50);

  log(`naturalScroll: ${direction} ${totalDistance}px`);

  while (remaining > 0 && speed > CONFIG.MOMENTUM.MIN_SPEED) {
    const baseDelta = randomInt(CONFIG.WHEEL.DELTA_Y.min, CONFIG.WHEEL.DELTA_Y.max);
    const delta = Math.min(baseDelta * speed, remaining);

    // 지터 추가
    if (CONFIG.JITTER.ENABLED && Math.random() < CONFIG.JITTER.CHANCE) {
      mouseX += randomInt(CONFIG.JITTER.X_RANGE.min, CONFIG.JITTER.X_RANGE.max);
      mouseY += randomInt(CONFIG.JITTER.Y_RANGE.min, CONFIG.JITTER.Y_RANGE.max);
      // 범위 제한
      mouseX = Math.max(50, Math.min(viewport.width - 50, mouseX));
      mouseY = Math.max(50, Math.min(viewport.height - 50, mouseY));
    }

    // 휠 이벤트 발생
    await dispatchWheelEvent(page, delta * sign, mouseX, mouseY);
    await dispatchScrollEvents(page, false);

    // 실제 스크롤 실행
    await page.evaluate((scrollAmount) => {
      window.scrollBy(0, scrollAmount);
    }, delta * sign);

    // 감속
    speed *= CONFIG.MOMENTUM.DECELERATION;
    remaining -= delta;

    // 간격 대기
    const interval = applyDelayVariation(randomInt(CONFIG.WHEEL.INTERVAL.min, CONFIG.WHEEL.INTERVAL.max));
    await sleep(interval);

    // 랜덤 일시정지
    if (Math.random() < CONFIG.SCROLL_PAUSE.CHANCE) {
      const pauseDuration = applyDelayVariation(randomInt(CONFIG.SCROLL_PAUSE.DURATION.min, CONFIG.SCROLL_PAUSE.DURATION.max));
      await sleep(pauseDuration);
    }
  }

  // scrollend 이벤트
  await dispatchScrollEvents(page, true);

  // 오버슈트 처리
  if (Math.random() < CONFIG.OVERSHOOT.CHANCE && totalDistance > 200) {
    const overshoot = randomInt(CONFIG.OVERSHOOT.AMOUNT.min, CONFIG.OVERSHOOT.AMOUNT.max);
    log(`overshoot: ${overshoot}px`);

    await dispatchWheelEvent(page, overshoot * sign, mouseX, mouseY);
    await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), overshoot * sign);

    await sleep(applyDelayVariation(randomInt(CONFIG.OVERSHOOT.RETURN_DELAY.min, CONFIG.OVERSHOOT.RETURN_DELAY.max)));

    // 복귀
    const returnAmount = Math.round(overshoot * 0.8);
    await dispatchWheelEvent(page, -returnAmount * sign, mouseX, mouseY);
    await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), -returnAmount * sign);
    await dispatchScrollEvents(page, true);
  }

  lastMouseX = mouseX;
  lastMouseY = mouseY;
}

/**
 * 탐색 스크롤 (위아래로 자유롭게)
 */
async function browseScroll(page) {
  const scrollCount = randomInt(CONFIG.BROWSE.MIN_SCROLLS, CONFIG.BROWSE.MAX_SCROLLS);
  let direction = Math.random() > 0.5 ? 'down' : 'up';

  log(`browseScroll: ${scrollCount} times`);

  const viewport = page.viewportSize();

  for (let i = 0; i < scrollCount; i++) {
    const distance = viewport.height * randomFloat(0.3, 0.8);
    await naturalScroll(page, distance, direction);

    // 읽는 척 멈춤
    const readPause = applyDelayVariation(randomInt(CONFIG.BROWSE.READ_PAUSE.min, CONFIG.BROWSE.READ_PAUSE.max));
    await sleep(readPause);

    // 방향 전환
    if (Math.random() < CONFIG.BROWSE.DIRECTION_CHANGE_CHANCE) {
      direction = direction === 'down' ? 'up' : 'down';
    }
  }
}

/**
 * 요소까지 자연스럽게 스크롤
 */
async function scrollToElement(page, element) {
  const box = await element.boundingBox();
  if (!box) return;

  const viewport = page.viewportSize();
  const currentScroll = await page.evaluate(() => window.scrollY);

  // 요소가 뷰포트 중앙에 오도록 계산
  const targetScroll = box.y + currentScroll - viewport.height / 2 + box.height / 2;
  const distance = targetScroll - currentScroll;

  if (Math.abs(distance) < 50) return; // 이미 보임

  const direction = distance > 0 ? 'down' : 'up';
  await naturalScroll(page, Math.abs(distance), direction);
}

// ========================================
// 마우스 이동 함수
// ========================================

/**
 * 베지어 곡선 기반 자연스러운 마우스 이동
 */
async function naturalMouseMove(page, toX, toY, fromX = null, fromY = null) {
  const viewport = page.viewportSize();
  const startX = fromX ?? lastMouseX ?? viewport.width / 2;
  const startY = fromY ?? lastMouseY ?? viewport.height / 2;

  const steps = randomInt(CONFIG.MOUSE.CURVE_STEPS.min, CONFIG.MOUSE.CURVE_STEPS.max);

  // 베지어 곡선 제어점
  const midX = (startX + toX) / 2;
  const midY = (startY + toY) / 2;
  const controlX = midX + randomInt(-100, 100) * CONFIG.MOUSE.CURVE_FACTOR;
  const controlY = midY + randomInt(-50, 50) * CONFIG.MOUSE.CURVE_FACTOR;

  // 시작점에서 out 이벤트
  await dispatchPointerEvents(page, 'out', startX, startY);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // 베지어 곡선 보간
    const x = Math.round(
      (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * controlX + t * t * toX
    );
    const y = Math.round(
      (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * controlY + t * t * toY
    );

    await page.mouse.move(x, y);
    await dispatchPointerEvents(page, 'move', x, y);

    const delay = applyDelayVariation(randomInt(CONFIG.MOUSE.STEP_DELAY.min, CONFIG.MOUSE.STEP_DELAY.max));
    await sleep(delay);
  }

  // 도착점에서 over 이벤트
  await dispatchPointerEvents(page, 'over', toX, toY);

  lastMouseX = toX;
  lastMouseY = toY;
}

/**
 * 요소로 자연스럽게 마우스 이동
 */
async function naturalMouseMoveToElement(page, element) {
  const box = await element.boundingBox();
  if (!box) return;

  // 요소 내 랜덤 위치
  const targetX = box.x + box.width * randomFloat(0.3, 0.7);
  const targetY = box.y + box.height * randomFloat(0.3, 0.7);

  await naturalMouseMove(page, targetX, targetY);
}

/**
 * 호버 + 미세 움직임
 */
async function hoverWithMicroMove(page, element, duration = null) {
  const box = await element.boundingBox();
  if (!box) return;

  const hoverDuration = duration ?? randomInt(CONFIG.HOVER.DURATION.min, CONFIG.HOVER.DURATION.max);
  const microMoveCount = randomInt(CONFIG.HOVER.MICRO_MOVE_COUNT.min, CONFIG.HOVER.MICRO_MOVE_COUNT.max);
  const intervalTime = hoverDuration / microMoveCount;

  let x = lastMouseX ?? box.x + box.width / 2;
  let y = lastMouseY ?? box.y + box.height / 2;

  for (let i = 0; i < microMoveCount; i++) {
    await sleep(applyDelayVariation(intervalTime * randomFloat(0.7, 1.3)));

    // 미세 움직임
    x += randomInt(CONFIG.HOVER.MICRO_MOVE_RANGE.min, CONFIG.HOVER.MICRO_MOVE_RANGE.max);
    y += randomInt(CONFIG.HOVER.MICRO_MOVE_RANGE.min, CONFIG.HOVER.MICRO_MOVE_RANGE.max);

    // 요소 범위 내로 제한
    x = Math.max(box.x + 5, Math.min(box.x + box.width - 5, x));
    y = Math.max(box.y + 5, Math.min(box.y + box.height - 5, y));

    await page.mouse.move(x, y, { steps: randomInt(2, 5) });
    await dispatchPointerEvents(page, 'move', x, y);
  }

  lastMouseX = x;
  lastMouseY = y;
}

// ========================================
// 행동 시퀀스 생성
// ========================================

/**
 * 파라미터 인스턴스화
 */
function instantiateParams(params) {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object' && 'min' in value && 'max' in value) {
      result[key] = randomInt(value.min, value.max);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 랜덤 행동 시퀀스 생성
 */
function generateActionSequence(minActions = 2, maxActions = 5, actionPool = BEHAVIOR_ACTIONS) {
  const actionCount = randomInt(minActions, maxActions);
  const sequence = [];

  const totalWeight = Object.values(actionPool)
    .reduce((sum, action) => sum + (action.weight || 10), 0);

  for (let i = 0; i < actionCount; i++) {
    let roll = Math.random() * totalWeight;

    for (const [name, action] of Object.entries(actionPool)) {
      roll -= (action.weight || 10);
      if (roll <= 0) {
        // 같은 행동 연속 방지
        if (sequence.length > 0 &&
            sequence[sequence.length - 1].name === name &&
            Math.random() < 0.5) {
          i--;
          break;
        }

        sequence.push({
          name,
          ...action,
          instanceParams: instantiateParams(action.params || {})
        });
        break;
      }
    }
  }

  return sequence;
}

/**
 * 가중치 기반 행동 선택
 */
function selectWeightedActions(actionPool, count) {
  const result = [];
  const totalWeight = actionPool.reduce((sum, a) => sum + a.weight, 0);

  for (let i = 0; i < count; i++) {
    let roll = Math.random() * totalWeight;
    for (const action of actionPool) {
      roll -= action.weight;
      if (roll <= 0) {
        result.push(action);
        break;
      }
    }
  }

  return result;
}

// ========================================
// 행동 실행기
// ========================================

/**
 * 다른 상품에 호버
 */
async function executeHoverOther(page, products, targetIndex, params) {
  const { count, duration } = params;
  log(`executeHoverOther: ${count} products`);

  const otherProducts = products.filter((_, i) => i !== targetIndex);
  if (otherProducts.length === 0) return;

  const shuffled = [...otherProducts].sort(() => Math.random() - 0.5);
  const toHover = shuffled.slice(0, Math.min(count, shuffled.length));

  for (const product of toHover) {
    if (!product.element) continue;

    try {
      const box = await product.element.boundingBox();
      if (!box) continue;

      await scrollToElement(page, product.element);
      await naturalMouseMoveToElement(page, product.element);
      await dispatchPointerEvents(page, 'over', box.x + box.width / 2, box.y + box.height / 2);
      await hoverWithMicroMove(page, product.element, randomInt(duration * 0.7, duration * 1.3));
      await dispatchPointerEvents(page, 'out', box.x + box.width / 2, box.y + box.height / 2);
    } catch (e) {
      log(`executeHoverOther error: ${e.message}`);
    }
  }
}

/**
 * 타겟 호버했다가 떠남
 */
async function executeHoverTargetLeave(page, targetProduct, params) {
  const { hoverDuration, leaveDistance } = params;
  log(`executeHoverTargetLeave`);

  if (!targetProduct.element) return;

  try {
    const box = await targetProduct.element.boundingBox();
    if (!box) return;

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await scrollToElement(page, targetProduct.element);
    await naturalMouseMoveToElement(page, targetProduct.element);
    await dispatchPointerEvents(page, 'over', centerX, centerY);
    await sleep(applyDelayVariation(randomInt(hoverDuration * 0.5, hoverDuration)));

    // 떠남 (랜덤 방향)
    const angle = Math.random() * Math.PI * 2;
    const leaveX = centerX + Math.cos(angle) * leaveDistance;
    const leaveY = centerY + Math.sin(angle) * leaveDistance;

    await naturalMouseMove(page, leaveX, leaveY, centerX, centerY);
    await dispatchPointerEvents(page, 'out', centerX, centerY);
    await sleep(applyDelayVariation(randomInt(300, 800)));
  } catch (e) {
    log(`executeHoverTargetLeave error: ${e.message}`);
  }
}

/**
 * 타겟 지나쳐서 스크롤
 */
async function executeScrollPast(page, params) {
  const { distance, returnChance } = params;
  log(`executeScrollPast: ${distance}px`);

  const direction = Math.random() > 0.5 ? 'down' : 'up';
  await naturalScroll(page, distance, direction);

  if (Math.random() < returnChance) {
    await sleep(applyDelayVariation(randomInt(500, 1000)));
    await naturalScroll(page, distance * 0.8, direction === 'down' ? 'up' : 'down');
  }
}

/**
 * 탐색 스크롤
 */
async function executeScrollBrowse(page, params) {
  const { scrollCount, distance } = params;
  log(`executeScrollBrowse: ${scrollCount} times, ${distance}px`);

  let direction = Math.random() > 0.5 ? 'down' : 'up';

  for (let i = 0; i < scrollCount; i++) {
    await naturalScroll(page, distance * randomFloat(0.7, 1.3), direction);
    await sleep(applyDelayVariation(randomInt(CONFIG.BROWSE.READ_PAUSE.min, CONFIG.BROWSE.READ_PAUSE.max)));

    if (Math.random() < CONFIG.BROWSE.DIRECTION_CHANGE_CHANCE) {
      direction = direction === 'down' ? 'up' : 'down';
    }
  }
}

/**
 * 맨 아래까지 스크롤
 */
async function executeScrollToBottom(page, params) {
  const { pauseAtBottom } = params;
  log(`executeScrollToBottom`);

  const viewport = page.viewportSize();
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const currentScroll = await page.evaluate(() => window.scrollY);
  const remaining = pageHeight - currentScroll - viewport.height;

  if (remaining > 50) {
    await naturalScroll(page, remaining, 'down');
    await sleep(applyDelayVariation(pauseAtBottom));
  }
}

/**
 * 생각하며 멈춤
 */
async function executePauseThinking(page, params) {
  const { duration } = params;
  log(`executePauseThinking: ${duration}ms`);
  await sleep(applyDelayVariation(duration));
}

/**
 * 읽는 척 멈춤 (마우스 미세 움직임)
 */
async function executePauseReading(page, params) {
  const { duration, microMoveCount } = params;
  log(`executePauseReading: ${duration}ms, ${microMoveCount} moves`);

  const viewport = page.viewportSize();
  let currentX = lastMouseX ?? viewport.width / 2;
  let currentY = lastMouseY ?? viewport.height / 2;

  const intervalTime = duration / microMoveCount;

  for (let i = 0; i < microMoveCount; i++) {
    await sleep(applyDelayVariation(intervalTime * randomFloat(0.7, 1.3)));

    currentX += randomInt(-10, 10);
    currentY += randomInt(-8, 8);

    currentX = Math.max(50, Math.min(viewport.width - 50, currentX));
    currentY = Math.max(50, Math.min(viewport.height - 50, currentY));

    await page.mouse.move(currentX, currentY, { steps: randomInt(2, 5) });
    await dispatchPointerEvents(page, 'move', currentX, currentY);
  }

  lastMouseX = currentX;
  lastMouseY = currentY;
}

/**
 * 마우스 방황
 */
async function executeMouseWander(page, params) {
  const { moveCount } = params;
  log(`executeMouseWander: ${moveCount} moves`);

  const viewport = page.viewportSize();

  for (let i = 0; i < moveCount; i++) {
    const targetX = randomInt(100, viewport.width - 100);
    const targetY = randomInt(100, viewport.height - 100);

    await naturalMouseMove(page, targetX, targetY);
    await sleep(applyDelayVariation(randomInt(200, 500)));
  }
}

/**
 * 화면 가장자리로 이동
 */
async function executeMouseToEdge(page, params) {
  const { returnChance } = params;
  log(`executeMouseToEdge`);

  const viewport = page.viewportSize();
  const edges = ['top', 'bottom', 'left', 'right'];
  const edge = edges[randomInt(0, 3)];

  let targetX, targetY;
  switch (edge) {
    case 'top':
      targetX = randomInt(100, viewport.width - 100);
      targetY = randomInt(10, 50);
      break;
    case 'bottom':
      targetX = randomInt(100, viewport.width - 100);
      targetY = viewport.height - randomInt(10, 50);
      break;
    case 'left':
      targetX = randomInt(10, 50);
      targetY = randomInt(100, viewport.height - 100);
      break;
    case 'right':
      targetX = viewport.width - randomInt(10, 50);
      targetY = randomInt(100, viewport.height - 100);
      break;
  }

  const startX = lastMouseX;
  const startY = lastMouseY;

  await naturalMouseMove(page, targetX, targetY);
  await sleep(applyDelayVariation(randomInt(300, 600)));

  if (Math.random() < returnChance && startX && startY) {
    await naturalMouseMove(page, startX, startY);
  }
}

/**
 * 상품 비교
 */
async function executeCompareProducts(page, products, targetIndex, params) {
  const { productCount, iterations, hoverDuration } = params;
  log(`executeCompareProducts: ${productCount} products, ${iterations} iterations`);

  const compareIndices = [targetIndex];
  const otherIndices = products
    .map((_, i) => i)
    .filter(i => i !== targetIndex)
    .sort(() => Math.random() - 0.5)
    .slice(0, productCount - 1);

  compareIndices.push(...otherIndices);

  for (let iter = 0; iter < iterations; iter++) {
    const shuffled = [...compareIndices].sort(() => Math.random() - 0.5);

    for (const idx of shuffled) {
      const product = products[idx];
      if (!product || !product.element) continue;

      try {
        const box = await product.element.boundingBox();
        if (!box) continue;

        await scrollToElement(page, product.element);
        await naturalMouseMoveToElement(page, product.element);
        await dispatchPointerEvents(page, 'over', box.x + box.width / 2, box.y + box.height / 2);
        await hoverWithMicroMove(page, product.element, randomInt(hoverDuration * 0.6, hoverDuration * 1.4));
        await dispatchPointerEvents(page, 'out', box.x + box.width / 2, box.y + box.height / 2);
      } catch (e) {
        log(`executeCompareProducts error: ${e.message}`);
      }
    }
  }
}

/**
 * 단일 행동 실행
 */
async function executeAction(page, action, context) {
  const { name, instanceParams } = action;
  const { products, targetIndex, viewport } = context;

  switch (name) {
    case 'HOVER_OTHER_PRODUCT':
      await executeHoverOther(page, products, targetIndex, instanceParams);
      break;
    case 'HOVER_TARGET_THEN_LEAVE':
      await executeHoverTargetLeave(page, products[targetIndex], instanceParams);
      break;
    case 'SCROLL_PAST_TARGET':
      await executeScrollPast(page, instanceParams);
      break;
    case 'SCROLL_BROWSE':
      await executeScrollBrowse(page, instanceParams);
      break;
    case 'SCROLL_TO_BOTTOM':
      await executeScrollToBottom(page, instanceParams);
      break;
    case 'PAUSE_THINKING':
      await executePauseThinking(page, instanceParams);
      break;
    case 'PAUSE_READING':
      await executePauseReading(page, instanceParams);
      break;
    case 'MOUSE_WANDER':
      await executeMouseWander(page, instanceParams);
      break;
    case 'MOUSE_TO_EDGE':
      await executeMouseToEdge(page, instanceParams);
      break;
    case 'COMPARE_PRODUCTS':
      await executeCompareProducts(page, products, targetIndex, instanceParams);
      break;
    default:
      log(`Unknown action: ${name}`);
  }
}

// ========================================
// 통합 함수 (외부 API)
// ========================================

/**
 * 상품 클릭 전 자연스러운 행동 (전체 시퀀스)
 * 기존 beforeProductClick 대체
 *
 * @param {Page} page - Playwright 페이지
 * @param {Object} targetProduct - 타겟 상품 { element, ... }
 * @param {Array} allProducts - 모든 상품 배열 [{ element, ... }, ...]
 * @param {boolean} enableFullBehavior - 전체 행동 시퀀스 활성화 (work_type=click일 때만)
 */
async function naturalBeforeProductClick(page, targetProduct, allProducts = [], enableFullBehavior = true) {
  const timeout = new TimeoutContext(CONFIG.TIME_LIMITS.BEFORE_PRODUCT_CLICK);
  const viewport = page.viewportSize();

  // enableFullBehavior가 true일 때만 자연스러운 행동 시퀀스 실행
  if (enableFullBehavior) {
    // 1. 행동 시퀀스 생성 (시간 제한 고려하여 줄임)
    const maxActions = Math.min(4, Math.floor(timeout.maxDuration / 2000)); // 행동당 ~2초 가정
    const sequence = generateActionSequence(1, maxActions);
    console.log(`[HumanSim] 행동 시퀀스 (max ${timeout.maxDuration}ms): ${sequence.map(a => a.name).join(' → ')}`);

    // 2. 컨텍스트 준비
    const targetIndex = allProducts.findIndex(p => p === targetProduct);
    const context = {
      products: allProducts,
      targetIndex: targetIndex >= 0 ? targetIndex : 0,
      viewport,
      targetProduct
    };

    // 3. 각 행동 실행 (시간 제한 체크)
    for (const action of sequence) {
      if (timeout.expired) {
        log(`⏱️ 시간 초과 - 남은 행동 건너뜀 (${timeout.elapsed}ms 경과)`);
        break;
      }

      try {
        // 단일 행동에 시간 제한 적용
        await withTimeout(
          executeAction(page, action, context),
          Math.min(CONFIG.TIME_LIMITS.SINGLE_ACTION, timeout.remaining),
          action.name
        );

        // 남은 시간이 있으면 짧은 대기
        if (timeout.remaining > 300) {
          await sleep(Math.min(randomInt(150, 350), timeout.remaining - 200));
        }
      } catch (e) {
        log(`Action ${action.name} error: ${e.message}`);
      }
    }
  } else {
    log('행동 시퀀스 비활성화됨 (work_type != click)');
  }

  // ⚠️ 필수: 타겟 상품을 화면에 배치 (시간 제한 무관하게 항상 실행)
  if (targetProduct.element) {
    try {
      // 스크롤해서 상품을 화면에 보이게 함
      await scrollToElement(page, targetProduct.element);

      // enableFullBehavior가 true이고 시간이 남아있으면 마우스 이동 및 호버
      if (enableFullBehavior && timeout.remaining > 300) {
        await naturalMouseMoveToElement(page, targetProduct.element);

        const box = await targetProduct.element.boundingBox();
        if (box) {
          await dispatchPointerEvents(page, 'over', box.x + box.width / 2, box.y + box.height / 2);
          await hoverWithMicroMove(page, targetProduct.element, randomInt(200, 400));
        }
      }
    } catch (e) {
      log(`Target element scroll error: ${e.message}`);
    }
  }

  // 클릭 전 미세한 망설임 (최소한만)
  if (enableFullBehavior && timeout.remaining > 100) {
    await sleep(Math.min(randomInt(50, 150), timeout.remaining));
  }

  console.log(`[HumanSim] 상품 클릭 전 행동 완료 (${timeout.elapsed}ms, fullBehavior=${enableFullBehavior})`);
}

/**
 * 장바구니 클릭 전 상품 상세 페이지 탐색
 * - 상품 정보를 충분히 확인하는 느낌으로 아래까지 스크롤
 * - 다시 맨 위로 올라와서 장바구니 클릭
 *
 * @param {Page} page - Playwright 페이지
 * @param {ElementHandle} cartButton - 장바구니 버튼 요소
 */
async function naturalBeforeCartClick(page, cartButton) {
  const viewport = page.viewportSize();
  console.log(`[HumanSim] 상세페이지 탐색 시작`);

  try {
    // 1단계: 페이지 높이 확인
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const maxScroll = pageHeight - viewport.height;

    // 2단계: 상품 정보 영역까지 충분히 스크롤 (화면 2~4배)
    const scrollDistance = Math.min(
      viewport.height * (2 + Math.random() * 2),  // 화면 2~4배
      maxScroll * 0.7  // 최대 70%까지
    );

    console.log(`[HumanSim] 상품 정보 확인 스크롤: ${Math.round(scrollDistance)}px`);

    // 부드럽게 아래로 스크롤 (여러 단계로)
    const scrollSteps = randomInt(3, 5);
    const stepDistance = scrollDistance / scrollSteps;

    for (let i = 0; i < scrollSteps; i++) {
      await page.evaluate((dist) => {
        window.scrollBy({ top: dist, behavior: 'smooth' });
      }, stepDistance);

      // 각 단계마다 읽는 듯 멈춤
      await sleep(randomInt(600, 1200));

      // 가끔 마우스 움직임
      if (Math.random() < 0.3) {
        const x = randomInt(100, viewport.width - 100);
        const y = randomInt(100, viewport.height - 100);
        await page.mouse.move(x, y, { steps: randomInt(5, 10) });
      }
    }

    // 3단계: 잠시 멈춤 (상품 정보 읽는 척)
    console.log(`[HumanSim] 상품 정보 확인 중...`);
    await sleep(randomInt(1000, 2000));

    // 4단계: 맨 위로 돌아가기
    console.log(`[HumanSim] 페이지 상단으로 이동`);
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    await sleep(randomInt(500, 800));

    // 5단계: 장바구니 버튼으로 마우스 이동
    if (cartButton) {
      await naturalMouseMoveToElement(page, cartButton);
      await hoverWithMicroMove(page, cartButton, randomInt(200, 400));
    }

  } catch (e) {
    log(`상세페이지 탐색 중 오류: ${e.message}`);
  }

  console.log(`[HumanSim] 장바구니 클릭 전 행동 완료`);
}

/**
 * 간단한 스크롤 후 요소로 이동 (기존 beforeProductClick 호환)
 */
async function simpleBeforeClick(page, element) {
  await scrollToElement(page, element);
  await naturalMouseMoveToElement(page, element);
  await hoverWithMicroMove(page, element, randomInt(300, 600));
  await sleep(applyDelayVariation(randomInt(100, 200)));
}

/**
 * 세션 시작 시간 리셋
 */
function resetSession() {
  sessionStartTime = Date.now();
  lastMouseX = null;
  lastMouseY = null;
}

// ========================================
// Export
// ========================================

module.exports = {
  // 핵심 함수
  naturalScroll,
  browseScroll,
  scrollToElement,
  naturalMouseMove,
  naturalMouseMoveToElement,
  hoverWithMicroMove,

  // 이벤트 발생
  dispatchWheelEvent,
  dispatchPointerEvents,
  dispatchScrollEvents,

  // 행동 시퀀스
  generateActionSequence,
  executeAction,

  // 통합 함수 (주요 API)
  naturalBeforeProductClick,
  naturalBeforeCartClick,
  simpleBeforeClick,

  // 유틸리티
  resetSession,
  applyDelayVariation,

  // 설정
  CONFIG,
  BEHAVIOR_ACTIONS,
};
