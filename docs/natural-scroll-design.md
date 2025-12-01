# 자연스러운 사용자 행동 시뮬레이션 설계안 v2

## 핵심 원칙
**"사람은 상품을 바로 클릭하지 않는다"**

사람의 실제 행동:
1. 검색 결과를 훑어봄 (스크롤 위아래)
2. 관심 있는 상품 몇 개에 마우스를 올려봄
3. 다시 스크롤해서 다른 상품도 봄
4. 특정 상품에 관심이 생겨 호버
5. 잠시 망설이다가 클릭

## 목표
Akamai 봇 탐지를 우회하기 위한 자연스러운 스크롤/마우스 동작 구현

## Akamai가 감지하는 이벤트들

### 마우스 이벤트
- `mouseover` - 요소 위로 마우스 진입
- `mousemove` - 마우스 이동
- `mouseout` - 요소에서 마우스 이탈

### 포인터 이벤트 (모던)
- `pointerover` - 포인터 진입
- `pointermove` - 포인터 이동
- `pointerout` - 포인터 이탈

### 스크롤 이벤트
- `wheel` - 휠 회전 (핵심!)
- `scroll` - 스크롤 발생
- `scrollend` - 스크롤 완료

### 감지하지 않는 이벤트
- `mouseup` - 감지 안함 (클릭은 별도 처리)

---

## 설계: 새로운 파일 구조

```
lib/utils/
├── human-scroll.js        # 새 파일: 스크롤 시뮬레이션
├── human-behavior.js      # 기존 파일 (일부 수정)
└── human-click.js         # 기존 파일 (수정)
```

---

## 1. human-scroll.js - 핵심 스크롤 시뮬레이션

### 1.1 설정값

```javascript
const SCROLL_CONFIG = {
  // 휠 이벤트 설정
  WHEEL: {
    DELTA_Y: { min: 80, max: 120 },      // 휠 1회 회전당 deltaY
    DELTA_VARIATION: 0.2,                  // ±20% 변동
    EVENTS_PER_SCROLL: { min: 3, max: 8 }, // 스크롤 1회당 휠 이벤트 수
    INTERVAL: { min: 16, max: 50 },        // 휠 이벤트 간격 (ms)
  },

  // 스크롤 동작 패턴
  MOMENTUM: {
    INITIAL_SPEED: 1.0,         // 초기 속도
    DECELERATION: 0.85,         // 감속률 (매 스텝 * 0.85)
    MIN_SPEED: 0.1,             // 최소 속도 (이하면 정지)
  },

  // 자연스러운 변동
  JITTER: {
    ENABLED: true,
    X_RANGE: { min: -3, max: 3 },    // X축 미세 진동
    Y_RANGE: { min: -2, max: 2 },    // Y축 미세 진동
    CHANCE: 0.3,                      // 지터 발생 확률
  },

  // 일시정지
  PAUSE: {
    CHANCE: 0.15,                     // 스크롤 중 일시정지 확률
    DURATION: { min: 100, max: 400 }, // 일시정지 시간
  },

  // 오버슈트 (스크롤 과다 후 복귀)
  OVERSHOOT: {
    CHANCE: 0.25,                     // 오버슈트 확률
    AMOUNT: { min: 50, max: 150 },    // 오버슈트 거리
    RETURN_DELAY: { min: 200, max: 500 },
  },

  // 탐색 스크롤
  BROWSE: {
    MIN_SCROLLS: 2,
    MAX_SCROLLS: 5,
    DIRECTION_CHANGE_CHANCE: 0.4,     // 방향 전환 확률
    READ_PAUSE: { min: 800, max: 2000 }, // 읽는 척 멈춤
  }
};
```

### 1.2 핵심 함수들

#### A. `dispatchWheelEvent()` - 휠 이벤트 발생

```javascript
/**
 * 실제 wheel 이벤트를 발생시킴
 * @param {Page} page - Playwright 페이지
 * @param {number} deltaY - 스크롤 양 (양수=아래, 음수=위)
 * @param {number} x - 마우스 X 좌표
 * @param {number} y - 마우스 Y 좌표
 */
async function dispatchWheelEvent(page, deltaY, x, y) {
  await page.evaluate(({ deltaY, x, y }) => {
    const event = new WheelEvent('wheel', {
      deltaX: 0,
      deltaY: deltaY,
      deltaZ: 0,
      deltaMode: 0,           // 0 = pixels
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      bubbles: true,
      cancelable: true,
      view: window
    });
    document.elementFromPoint(x, y)?.dispatchEvent(event) ||
    document.dispatchEvent(event);
  }, { deltaY, x, y });
}
```

#### B. `naturalScroll()` - 자연스러운 스크롤

```javascript
/**
 * 관성 있는 자연스러운 스크롤
 * @param {Page} page
 * @param {number} totalDistance - 총 스크롤 거리
 * @param {string} direction - 'up' | 'down'
 */
async function naturalScroll(page, totalDistance, direction = 'down') {
  const sign = direction === 'down' ? 1 : -1;
  let remaining = Math.abs(totalDistance);
  let speed = SCROLL_CONFIG.MOMENTUM.INITIAL_SPEED;

  // 마우스 위치 가져오기 (휠 이벤트용)
  const viewport = page.viewportSize();
  let mouseX = viewport.width / 2 + randomRange(-100, 100);
  let mouseY = viewport.height / 2 + randomRange(-50, 50);

  while (remaining > 0 && speed > SCROLL_CONFIG.MOMENTUM.MIN_SPEED) {
    // 이번 스크롤 양 계산 (속도 기반)
    const baseDelta = randomRange(
      SCROLL_CONFIG.WHEEL.DELTA_Y.min,
      SCROLL_CONFIG.WHEEL.DELTA_Y.max
    );
    const delta = Math.min(baseDelta * speed, remaining);

    // 지터 추가
    if (SCROLL_CONFIG.JITTER.ENABLED && Math.random() < SCROLL_CONFIG.JITTER.CHANCE) {
      mouseX += randomRange(SCROLL_CONFIG.JITTER.X_RANGE.min, SCROLL_CONFIG.JITTER.X_RANGE.max);
      mouseY += randomRange(SCROLL_CONFIG.JITTER.Y_RANGE.min, SCROLL_CONFIG.JITTER.Y_RANGE.max);
    }

    // 휠 이벤트 발생
    await dispatchWheelEvent(page, delta * sign, mouseX, mouseY);

    // 감속
    speed *= SCROLL_CONFIG.MOMENTUM.DECELERATION;
    remaining -= delta;

    // 간격 대기
    const interval = randomRange(
      SCROLL_CONFIG.WHEEL.INTERVAL.min,
      SCROLL_CONFIG.WHEEL.INTERVAL.max
    );
    await sleep(interval);

    // 랜덤 일시정지
    if (Math.random() < SCROLL_CONFIG.PAUSE.CHANCE) {
      await sleep(randomRange(
        SCROLL_CONFIG.PAUSE.DURATION.min,
        SCROLL_CONFIG.PAUSE.DURATION.max
      ));
    }
  }

  // 오버슈트 처리
  if (Math.random() < SCROLL_CONFIG.OVERSHOOT.CHANCE) {
    const overshoot = randomRange(
      SCROLL_CONFIG.OVERSHOOT.AMOUNT.min,
      SCROLL_CONFIG.OVERSHOOT.AMOUNT.max
    );
    await dispatchWheelEvent(page, overshoot * sign, mouseX, mouseY);
    await sleep(randomRange(
      SCROLL_CONFIG.OVERSHOOT.RETURN_DELAY.min,
      SCROLL_CONFIG.OVERSHOOT.RETURN_DELAY.max
    ));
    // 복귀 스크롤
    await dispatchWheelEvent(page, -overshoot * sign * 0.8, mouseX, mouseY);
  }
}
```

#### C. `browseScroll()` - 탐색 스크롤 (상품 검색 시)

```javascript
/**
 * 사용자처럼 위아래로 탐색하는 스크롤
 * 상품을 찾기 전에 호출
 */
async function browseScroll(page) {
  const scrollCount = randomRange(
    SCROLL_CONFIG.BROWSE.MIN_SCROLLS,
    SCROLL_CONFIG.BROWSE.MAX_SCROLLS
  );

  let direction = 'down';

  for (let i = 0; i < scrollCount; i++) {
    // 스크롤 거리 (뷰포트 높이의 30-80%)
    const viewport = page.viewportSize();
    const distance = viewport.height * randomRange(0.3, 0.8);

    await naturalScroll(page, distance, direction);

    // 읽는 척 멈춤
    await sleep(randomRange(
      SCROLL_CONFIG.BROWSE.READ_PAUSE.min,
      SCROLL_CONFIG.BROWSE.READ_PAUSE.max
    ));

    // 방향 전환
    if (Math.random() < SCROLL_CONFIG.BROWSE.DIRECTION_CHANGE_CHANCE) {
      direction = direction === 'down' ? 'up' : 'down';
    }
  }
}
```

#### D. `scrollToElement()` - 요소로 스크롤

```javascript
/**
 * 특정 요소까지 자연스럽게 스크롤
 * 기존 scrollIntoView 대체
 */
async function scrollToElement(page, element) {
  const elementBox = await element.boundingBox();
  if (!elementBox) return;

  const viewport = page.viewportSize();
  const currentScroll = await page.evaluate(() => window.scrollY);

  // 요소가 뷰포트 중앙에 오도록 계산
  const targetScroll = elementBox.y - viewport.height / 2 + elementBox.height / 2;
  const distance = targetScroll - currentScroll;

  if (Math.abs(distance) < 50) return; // 이미 보임

  const direction = distance > 0 ? 'down' : 'up';
  await naturalScroll(page, Math.abs(distance), direction);
}
```

---

## 2. 포인터/마우스 이벤트 시뮬레이션

### 2.1 설정값

```javascript
const POINTER_CONFIG = {
  // 마우스 이동
  MOVE: {
    STEPS: { min: 15, max: 30 },       // 이동 스텝 수
    CURVE_FACTOR: 0.3,                  // 곡선 정도
    SPEED_VARIATION: 0.4,               // 속도 변동
  },

  // 호버
  HOVER: {
    DURATION: { min: 100, max: 300 },   // 호버 지속
    MICRO_MOVE: true,                    // 호버 중 미세 움직임
  },

  // 이벤트 발생
  EVENTS: {
    POINTER: true,                       // pointer 이벤트 발생
    MOUSE: true,                         // mouse 이벤트 발생
  }
};
```

### 2.2 핵심 함수들

#### A. `dispatchPointerEvents()` - 포인터 이벤트 발생

```javascript
/**
 * 포인터 이벤트 세트 발생
 * @param {Page} page
 * @param {string} type - 'over' | 'move' | 'out'
 * @param {number} x
 * @param {number} y
 */
async function dispatchPointerEvents(page, type, x, y) {
  await page.evaluate(({ type, x, y }) => {
    const target = document.elementFromPoint(x, y) || document;

    // Pointer Event
    const pointerEvent = new PointerEvent(`pointer${type}`, {
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      view: window
    });
    target.dispatchEvent(pointerEvent);

    // Mouse Event (호환성)
    const mouseEvent = new MouseEvent(`mouse${type}`, {
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      bubbles: true,
      cancelable: true,
      view: window
    });
    target.dispatchEvent(mouseEvent);
  }, { type, x, y });
}
```

#### B. `naturalMouseMove()` - 자연스러운 마우스 이동

```javascript
/**
 * 베지어 곡선 기반 자연스러운 마우스 이동
 * 이동 중 pointermove/mousemove 발생
 */
async function naturalMouseMove(page, fromX, fromY, toX, toY) {
  const steps = randomRange(
    POINTER_CONFIG.MOVE.STEPS.min,
    POINTER_CONFIG.MOVE.STEPS.max
  );

  // 이전 위치에서 out 이벤트
  await dispatchPointerEvents(page, 'out', fromX, fromY);

  // 베지어 곡선 제어점 계산
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const controlX = midX + randomRange(-100, 100) * POINTER_CONFIG.MOVE.CURVE_FACTOR;
  const controlY = midY + randomRange(-50, 50) * POINTER_CONFIG.MOVE.CURVE_FACTOR;

  let lastX = fromX, lastY = fromY;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // 베지어 곡선 보간
    const x = Math.round(
      (1-t)*(1-t)*fromX + 2*(1-t)*t*controlX + t*t*toX
    );
    const y = Math.round(
      (1-t)*(1-t)*fromY + 2*(1-t)*t*controlY + t*t*toY
    );

    // Playwright 마우스 이동 (실제 이동)
    await page.mouse.move(x, y);

    // 포인터/마우스 이벤트 발생
    await dispatchPointerEvents(page, 'move', x, y);

    // 속도 변동 있는 대기
    const baseDelay = 10;
    const variation = baseDelay * POINTER_CONFIG.MOVE.SPEED_VARIATION;
    await sleep(baseDelay + randomRange(-variation, variation));

    lastX = x;
    lastY = y;
  }

  // 새 위치에서 over 이벤트
  await dispatchPointerEvents(page, 'over', toX, toY);
}
```

#### C. `hoverWithMicroMove()` - 호버 + 미세 움직임

```javascript
/**
 * 요소 위에서 호버하면서 미세하게 움직임
 */
async function hoverWithMicroMove(page, element) {
  const box = await element.boundingBox();
  if (!box) return;

  // 요소 내 랜덤 위치
  let x = box.x + box.width * randomRange(0.3, 0.7);
  let y = box.y + box.height * randomRange(0.3, 0.7);

  await page.mouse.move(x, y);
  await dispatchPointerEvents(page, 'over', x, y);

  // 호버 중 미세 움직임
  if (POINTER_CONFIG.HOVER.MICRO_MOVE) {
    const microMoves = randomRange(2, 5);
    for (let i = 0; i < microMoves; i++) {
      await sleep(randomRange(50, 150));
      x += randomRange(-5, 5);
      y += randomRange(-3, 3);
      // 요소 범위 내로 제한
      x = Math.max(box.x + 10, Math.min(box.x + box.width - 10, x));
      y = Math.max(box.y + 5, Math.min(box.y + box.height - 5, y));
      await page.mouse.move(x, y);
      await dispatchPointerEvents(page, 'move', x, y);
    }
  }

  await sleep(randomRange(
    POINTER_CONFIG.HOVER.DURATION.min,
    POINTER_CONFIG.HOVER.DURATION.max
  ));
}
```

---

## 3. 통합 워크플로우

### 3.1 상품 검색 후 상품 찾기 전

```javascript
/**
 * 상품 목록에서 탐색 동작
 * product-click-handler.js에서 사용
 */
async function beforeFindProduct(page) {
  // 1. 랜덤 마우스 이동 (시작점 설정)
  const viewport = page.viewportSize();
  await naturalMouseMove(
    page,
    viewport.width / 2,
    viewport.height / 3,
    randomRange(100, viewport.width - 100),
    randomRange(100, viewport.height - 100)
  );

  // 2. 탐색 스크롤 (위아래)
  await browseScroll(page);

  // 3. 상단으로 복귀
  await naturalScroll(page, await page.evaluate(() => window.scrollY), 'up');
}
```

### 3.2 상품 클릭 전

```javascript
/**
 * 상품 클릭 전 자연스러운 동작
 */
async function beforeProductClick(page, element) {
  // 1. 요소까지 스크롤
  await scrollToElement(page, element);

  // 2. 요소로 마우스 이동
  const box = await element.boundingBox();
  const currentPos = await page.evaluate(() => ({
    x: window.mouseX || window.innerWidth / 2,
    y: window.mouseY || window.innerHeight / 2
  }));

  await naturalMouseMove(
    page,
    currentPos.x, currentPos.y,
    box.x + box.width / 2,
    box.y + box.height / 2
  );

  // 3. 호버 + 미세 움직임
  await hoverWithMicroMove(page, element);
}
```

### 3.3 장바구니 클릭 전 (상품 상세 페이지)

```javascript
/**
 * 장바구니 클릭 전 상품 상세 탐색
 */
async function beforeCartClick(page, cartButton) {
  // 1. 페이지 바닥까지 스크롤
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = page.viewportSize().height;

  await naturalScroll(page, pageHeight - viewportHeight, 'down');

  // 2. 잠시 멈춤 (리뷰 읽는 척)
  await sleep(randomRange(1000, 2000));

  // 3. 상단으로 복귀
  await naturalScroll(page, pageHeight - viewportHeight, 'up');

  // 4. 장바구니 버튼으로 스크롤 및 이동
  await scrollToElement(page, cartButton);
  await naturalMouseMove(
    page,
    page.viewportSize().width / 2,
    page.viewportSize().height / 3,
    (await cartButton.boundingBox()).x + 50,
    (await cartButton.boundingBox()).y + 20
  );

  // 5. 호버
  await hoverWithMicroMove(page, cartButton);
}
```

---

## 4. human-click.js 수정 사항

### 기존 코드 수정 포인트

```javascript
// 기존: scrollIntoView 사용
element.scrollIntoView({ behavior: 'smooth', block: 'center' });

// 변경: naturalScroll 사용
const humanScroll = require('./human-scroll');
await humanScroll.scrollToElement(page, element);
```

```javascript
// 기존: 단순 mouse.move
await page.mouse.move(x, y, { steps: 10 });

// 변경: naturalMouseMove 사용
await humanScroll.naturalMouseMove(page, currentX, currentY, x, y);
```

---

## 5. 구현 우선순위

### Phase 1 (필수)
1. `dispatchWheelEvent()` - wheel 이벤트 발생
2. `naturalScroll()` - 관성 있는 스크롤
3. `dispatchPointerEvents()` - pointer/mouse 이벤트

### Phase 2 (권장)
4. `browseScroll()` - 탐색 스크롤
5. `naturalMouseMove()` - 베지어 곡선 이동
6. `hoverWithMicroMove()` - 호버 + 미세 움직임

### Phase 3 (선택)
7. `beforeFindProduct()` - 통합 워크플로우
8. `beforeCartClick()` - 장바구니 전 동작

---

## 6. 테스트 방법

```bash
# 단일 스레드, 브라우저 유지
node index.js --threads 1 --once --keep-browser

# DevTools Console에서 이벤트 확인
# Akamai 스크립트가 wheel, pointer 이벤트를 캡처하는지 확인
```

---

## 7. 예상 효과

| 항목 | 이전 | 이후 |
|------|------|------|
| wheel 이벤트 | ❌ 없음 | ✅ 실제 발생 |
| pointer 이벤트 | ❌ 없음 | ✅ 실제 발생 |
| 스크롤 패턴 | 선형 | 관성 + 지터 |
| 마우스 이동 | 직선 | 곡선 + 변속 |
| 호버 동작 | 정적 | 미세 움직임 |
| 오버슈트 | ❌ 없음 | ✅ 랜덤 발생 |

---

## 8. 자연스러운 사용자 행동 패턴 (v2 추가)

### 8.1 핵심 개념: "망설임 패턴"

사람은 바로 클릭하지 않음. 다음 행동들을 불규칙하게 수행:

```
[행동 풀 - 랜덤하게 2-5개 선택]
├── 다른 상품 호버 (1-3개)
├── 스크롤 (위 또는 아래)
├── 아무것도 안 함 (멈춤)
├── 화면 다른 곳 마우스 이동
├── 타겟으로 갔다가 다시 나옴
└── 스크롤 했다가 다시 돌아옴
```

### 8.2 행동 유형 정의

```javascript
const BEHAVIOR_ACTIONS = {
  // === 호버 행동 ===
  HOVER_OTHER_PRODUCT: {
    weight: 25,        // 발생 확률 가중치
    description: '다른 상품에 호버',
    params: {
      count: { min: 1, max: 3 },     // 호버할 상품 수
      duration: { min: 500, max: 1500 }, // 호버 시간
      includeTarget: false,           // 타겟 상품 제외
    }
  },

  HOVER_TARGET_THEN_LEAVE: {
    weight: 15,
    description: '타겟 호버했다가 떠남',
    params: {
      hoverDuration: { min: 300, max: 800 },
      leaveDistance: { min: 100, max: 300 }, // 떠나는 거리
    }
  },

  // === 스크롤 행동 ===
  SCROLL_PAST_TARGET: {
    weight: 20,
    description: '타겟 지나쳐서 스크롤',
    params: {
      distance: { min: 200, max: 500 },
      direction: 'random',  // 'up', 'down', 'random'
      returnChance: 0.7,    // 돌아올 확률
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

  // === 대기/멈춤 행동 ===
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

  // === 마우스 이동 행동 ===
  MOUSE_WANDER: {
    weight: 10,
    description: '마우스 방황',
    params: {
      moveCount: { min: 2, max: 4 },
      speed: 'random',  // 'slow', 'normal', 'fast', 'random'
    }
  },

  MOUSE_TO_EDGE: {
    weight: 5,
    description: '화면 가장자리로 이동',
    params: {
      edge: 'random',  // 'top', 'bottom', 'left', 'right', 'random'
      returnChance: 0.8,
    }
  },

  // === 복합 행동 ===
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
```

### 8.3 행동 시퀀스 생성 알고리즘

```javascript
/**
 * 랜덤 행동 시퀀스 생성
 * @param {number} minActions - 최소 행동 수
 * @param {number} maxActions - 최대 행동 수
 * @returns {Array} 행동 시퀀스
 */
function generateActionSequence(minActions = 2, maxActions = 5) {
  const actionCount = randomInt(minActions, maxActions);
  const sequence = [];
  const usedActions = new Set();

  // 가중치 기반 랜덤 선택
  const totalWeight = Object.values(BEHAVIOR_ACTIONS)
    .reduce((sum, action) => sum + action.weight, 0);

  for (let i = 0; i < actionCount; i++) {
    let roll = Math.random() * totalWeight;

    for (const [name, action] of Object.entries(BEHAVIOR_ACTIONS)) {
      roll -= action.weight;
      if (roll <= 0) {
        // 같은 행동 연속 방지 (50% 확률로 재선택)
        if (sequence.length > 0 &&
            sequence[sequence.length - 1].name === name &&
            Math.random() < 0.5) {
          i--; // 재시도
          break;
        }

        sequence.push({
          name,
          ...action,
          // 파라미터 인스턴스화
          instanceParams: instantiateParams(action.params)
        });
        break;
      }
    }
  }

  return sequence;
}

/**
 * 파라미터 범위를 실제 값으로 변환
 */
function instantiateParams(params) {
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'object' && 'min' in value && 'max' in value) {
      result[key] = randomInt(value.min, value.max);
    } else if (value === 'random') {
      // 'random' 값은 실행 시점에 결정
      result[key] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

### 8.4 행동 실행기

```javascript
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

    case 'PAUSE_THINKING':
      await executePauseThinking(page, instanceParams);
      break;

    case 'PAUSE_READING':
      await executePauseReading(page, instanceParams);
      break;

    case 'MOUSE_WANDER':
      await executeMouseWander(page, viewport, instanceParams);
      break;

    case 'COMPARE_PRODUCTS':
      await executeCompareProducts(page, products, targetIndex, instanceParams);
      break;

    // ... 기타 행동들
  }
}

/**
 * 다른 상품에 호버
 */
async function executeHoverOther(page, products, targetIndex, params) {
  const { count, duration } = params;

  // 타겟이 아닌 상품들 중 랜덤 선택
  const otherProducts = products.filter((_, i) => i !== targetIndex);
  const shuffled = otherProducts.sort(() => Math.random() - 0.5);
  const toHover = shuffled.slice(0, count);

  for (const product of toHover) {
    const element = await page.$(product.selector);
    if (!element) continue;

    // 요소로 자연스럽게 이동
    await naturalMouseMove(page, element);

    // pointer 이벤트 발생
    const box = await element.boundingBox();
    await dispatchPointerEvents(page, 'over', box.x + box.width/2, box.y + box.height/2);

    // 호버 중 미세 움직임
    await hoverWithMicroMove(page, element, randomInt(duration * 0.7, duration * 1.3));

    // 떠남
    await dispatchPointerEvents(page, 'out', box.x + box.width/2, box.y + box.height/2);
  }
}

/**
 * 타겟 호버했다가 떠남
 */
async function executeHoverTargetLeave(page, targetProduct, params) {
  const { hoverDuration, leaveDistance } = params;

  const element = await page.$(targetProduct.selector);
  if (!element) return;

  const box = await element.boundingBox();
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // 타겟으로 이동
  await naturalMouseMove(page, element);
  await dispatchPointerEvents(page, 'over', centerX, centerY);

  // 짧게 호버
  await sleep(randomInt(hoverDuration * 0.5, hoverDuration));

  // 떠남 (랜덤 방향)
  const angle = Math.random() * Math.PI * 2;
  const leaveX = centerX + Math.cos(angle) * leaveDistance;
  const leaveY = centerY + Math.sin(angle) * leaveDistance;

  await naturalMouseMoveToPoint(page, centerX, centerY, leaveX, leaveY);
  await dispatchPointerEvents(page, 'out', centerX, centerY);

  // 잠시 대기 (망설이는 듯)
  await sleep(randomInt(300, 800));
}

/**
 * 읽는 척 멈춤 (마우스 미세 움직임)
 */
async function executePauseReading(page, params) {
  const { duration, microMoveCount } = params;

  const viewport = page.viewportSize();
  let currentX = viewport.width / 2;
  let currentY = viewport.height / 2;

  const intervalTime = duration / microMoveCount;

  for (let i = 0; i < microMoveCount; i++) {
    await sleep(intervalTime * randomFloat(0.7, 1.3));

    // 미세 움직임 (-10 ~ +10 픽셀)
    currentX += randomInt(-10, 10);
    currentY += randomInt(-8, 8);

    await page.mouse.move(currentX, currentY, { steps: randomInt(2, 5) });
    await dispatchPointerEvents(page, 'move', currentX, currentY);
  }
}

/**
 * 상품 비교 (왔다갔다)
 */
async function executeCompareProducts(page, products, targetIndex, params) {
  const { productCount, iterations, hoverDuration } = params;

  // 비교할 상품 선택 (타겟 포함)
  const compareIndices = [targetIndex];
  const otherIndices = products
    .map((_, i) => i)
    .filter(i => i !== targetIndex)
    .sort(() => Math.random() - 0.5)
    .slice(0, productCount - 1);

  compareIndices.push(...otherIndices);

  for (let iter = 0; iter < iterations; iter++) {
    // 순서 섞기 (매 iteration마다)
    const shuffled = compareIndices.sort(() => Math.random() - 0.5);

    for (const idx of shuffled) {
      const product = products[idx];
      const element = await page.$(product.selector);
      if (!element) continue;

      await scrollToElement(page, element);
      await naturalMouseMove(page, element);

      const box = await element.boundingBox();
      await dispatchPointerEvents(page, 'over', box.x + box.width/2, box.y + box.height/2);

      await hoverWithMicroMove(
        page, element,
        randomInt(hoverDuration * 0.6, hoverDuration * 1.4)
      );

      await dispatchPointerEvents(page, 'out', box.x + box.width/2, box.y + box.height/2);
    }
  }
}
```

### 8.5 최종 통합 함수

```javascript
/**
 * 상품 클릭 전 자연스러운 행동 (전체 시퀀스)
 * 기존 beforeProductClick 대체
 */
async function naturalBeforeProductClick(page, targetProduct, allProducts) {
  const viewport = page.viewportSize();

  // 1. 행동 시퀀스 생성
  const sequence = generateActionSequence(2, 5);
  console.log(`[HumanBehavior] 생성된 행동: ${sequence.map(a => a.name).join(' → ')}`);

  // 2. 컨텍스트 준비
  const targetIndex = allProducts.findIndex(p => p === targetProduct);
  const context = {
    products: allProducts,
    targetIndex,
    viewport,
    targetProduct
  };

  // 3. 각 행동 실행
  for (const action of sequence) {
    await executeAction(page, action, context);

    // 행동 사이 랜덤 대기
    await sleep(randomInt(200, 600));
  }

  // 4. 마지막으로 타겟으로 이동 및 호버
  await scrollToElement(page, targetProduct.element);
  await naturalMouseMove(page, targetProduct.element);

  const box = await targetProduct.element.boundingBox();
  await dispatchPointerEvents(page, 'over', box.x + box.width/2, box.y + box.height/2);
  await hoverWithMicroMove(page, targetProduct.element, randomInt(400, 900));

  // 5. 클릭 전 미세한 망설임
  await sleep(randomInt(100, 300));
}
```

### 8.6 장바구니 클릭 전 행동 (상품 상세 페이지)

```javascript
/**
 * 장바구니 클릭 전 상품 상세 페이지 탐색
 */
async function naturalBeforeCartClick(page, cartButton) {
  const viewport = page.viewportSize();

  // 행동 풀 (상세 페이지용)
  const detailActions = [
    { name: 'SCROLL_TO_BOTTOM', weight: 30 },      // 리뷰 보기
    { name: 'SCROLL_BROWSE', weight: 25 },          // 상품 정보 탐색
    { name: 'PAUSE_READING', weight: 20 },          // 설명 읽기
    { name: 'MOUSE_WANDER', weight: 15 },           // 마우스 방황
    { name: 'HOVER_IMAGE', weight: 10 },            // 상품 이미지 호버
  ];

  // 2-4개 행동 선택
  const actionCount = randomInt(2, 4);
  const sequence = selectWeightedActions(detailActions, actionCount);

  for (const action of sequence) {
    switch (action.name) {
      case 'SCROLL_TO_BOTTOM':
        // 페이지 끝까지 스크롤 (리뷰 확인)
        const pageHeight = await page.evaluate(() => document.body.scrollHeight);
        await naturalScroll(page, pageHeight - viewport.height, 'down');
        await sleep(randomInt(1000, 2500)); // 리뷰 읽는 척
        break;

      case 'SCROLL_BROWSE':
        // 위아래 탐색
        await browseScroll(page);
        break;

      case 'PAUSE_READING':
        await executePauseReading(page, {
          duration: randomInt(1500, 3000),
          microMoveCount: randomInt(3, 6)
        });
        break;

      case 'MOUSE_WANDER':
        await executeMouseWander(page, viewport, {
          moveCount: randomInt(2, 4),
          speed: 'random'
        });
        break;

      case 'HOVER_IMAGE':
        // 상품 이미지에 호버
        const images = await page.$$('.prod-image img, .gallery img');
        if (images.length > 0) {
          const randomImg = images[randomInt(0, images.length - 1)];
          await naturalMouseMove(page, randomImg);
          await hoverWithMicroMove(page, randomImg, randomInt(500, 1200));
        }
        break;
    }

    await sleep(randomInt(300, 700));
  }

  // 장바구니 버튼으로 이동
  await scrollToElement(page, cartButton);
  await sleep(randomInt(200, 500));
  await naturalMouseMove(page, cartButton);
  await hoverWithMicroMove(page, cartButton, randomInt(300, 600));
}
```

### 8.7 시간 변동성 추가

```javascript
/**
 * 시간대별 행동 속도 조절
 * 새벽엔 느리게, 낮엔 빠르게
 */
function getTimeBasedSpeedMultiplier() {
  const hour = new Date().getHours();

  if (hour >= 0 && hour < 6) return 1.3;   // 새벽: 30% 느리게
  if (hour >= 6 && hour < 9) return 1.1;   // 아침: 10% 느리게
  if (hour >= 9 && hour < 18) return 1.0;  // 낮: 정상
  if (hour >= 18 && hour < 22) return 0.95; // 저녁: 5% 빠르게
  return 1.15;                              // 밤: 15% 느리게
}

/**
 * 세션 피로도 시뮬레이션
 * 오래 사용할수록 행동이 느려짐
 */
let sessionStartTime = null;

function getSessionFatigueMultiplier() {
  if (!sessionStartTime) {
    sessionStartTime = Date.now();
    return 1.0;
  }

  const minutesActive = (Date.now() - sessionStartTime) / 60000;

  if (minutesActive < 10) return 1.0;      // 10분 미만: 정상
  if (minutesActive < 30) return 1.05;     // 30분 미만: 5% 느리게
  if (minutesActive < 60) return 1.1;      // 1시간 미만: 10% 느리게
  return 1.15;                              // 1시간 이상: 15% 느리게
}
```

---

## 9. 파일 구조 (최종)

```
lib/utils/
├── human-scroll.js         # 스크롤 시뮬레이션 (wheel 이벤트)
├── human-pointer.js        # 포인터/마우스 이벤트
├── human-actions.js        # 행동 패턴 정의 및 시퀀스 생성
├── human-executor.js       # 행동 실행기
├── human-behavior.js       # 기존 파일 (호환성 유지, 내부적으로 새 모듈 호출)
└── human-click.js          # 기존 파일 (수정)
```

또는 단일 파일로 통합:

```
lib/utils/
├── human-simulation.js     # 모든 자연스러운 행동 통합
├── human-behavior.js       # 기존 (호환성 래퍼)
└── human-click.js          # 기존 (수정)
```
