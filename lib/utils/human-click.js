/**
 * 사람처럼 클릭하는 유틸리티
 * - 랜덤 좌표 클릭
 * - 마우스 다운/업 랜덤 딜레이
 * - 시각적 효과 (하이라이트, 클릭 애니메이션)
 *
 * Updated: 2025-10-09 - 마우스 다운/클릭 지속/업 딜레이 개선
 * Updated: 2025-12-01 - wheel/pointer 이벤트 통합 (human-simulation.js)
 */

const humanSimulation = require('./human-simulation');

// 마우스 클릭 타이밍 설정 (Akamai 차단 개선)
const MOUSE_DELAYS = {
  BEFORE_DOWN: { min: 50, max: 150 },    // 마우스 다운 전 대기
  CLICK_HOLD: { min: 30, max: 100 },     // 버튼 누르고 있는 시간
  AFTER_UP: { min: 100, max: 200 }       // 마우스 업 후 대기
};

/**
 * 랜덤 딜레이 헬퍼
 */
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * 요소의 클릭 가능한 랜덤 좌표 생성
 */
async function getRandomClickPoint(element) {
  // 요소가 보이는지 확인
  const isVisible = await element.isVisible();
  if (!isVisible) {
    throw new Error('요소가 화면에 보이지 않습니다');
  }
  
  // boundingBox 가져오기 (최대 3번 재시도)
  let box = null;
  for (let i = 0; i < 3; i++) {
    box = await element.boundingBox();
    if (box) break;
    await element.page().waitForTimeout(500);
  }
  
  if (!box) {
    // boundingBox 실패 시 요소 정보 디버깅
    const elementInfo = await element.evaluate(el => ({
      tagName: el.tagName,
      className: el.className,
      id: el.id,
      display: window.getComputedStyle(el).display,
      visibility: window.getComputedStyle(el).visibility,
      width: el.offsetWidth,
      height: el.offsetHeight
    }));
    console.error('   요소 정보:', elementInfo);
    throw new Error('요소의 boundingBox를 가져올 수 없습니다');
  }
  
  // 요소 크기의 20~80% 범위 내에서 랜덤 좌표 선택 (가장자리 제외)
  const xMin = box.x + box.width * 0.2;
  const xMax = box.x + box.width * 0.8;
  const yMin = box.y + box.height * 0.2;
  const yMax = box.y + box.height * 0.8;
  
  const x = xMin + Math.random() * (xMax - xMin);
  const y = yMin + Math.random() * (yMax - yMin);
  
  return { x, y };
}

/**
 * 사람처럼 자연스러운 클릭
 */
async function humanClick(page, element, keywordId = null) {
  const idPrefix = keywordId ? `[ID:${keywordId}] ` : '';

  try {
    // v2: 자연스러운 스크롤 (wheel 이벤트 발생)
    await humanSimulation.scrollToElement(page, element);
    await page.waitForTimeout(300 + Math.random() * 200);
    
    // 요소 하이라이트 효과 추가
    await element.evaluate(el => {
      el.style.outline = '3px solid #ff6b6b';
      el.style.outlineOffset = '2px';
      el.style.transition = 'all 0.3s ease';
      el.style.boxShadow = '0 0 20px rgba(255, 107, 107, 0.5)';
    });
    console.log(`   ${idPrefix}🎯 클릭할 요소 하이라이트`);
    await page.waitForTimeout(500); // 하이라이트 효과 보여주기
    
    // 랜덤 클릭 좌표 가져오기
    const { x, y } = await getRandomClickPoint(element);

    // v2: 자연스러운 마우스 이동 (pointer/mouse 이벤트 발생)
    await humanSimulation.naturalMouseMove(page, x, y);

    // 클릭 포인트 시각화 (디버그용)
    try {
      await page.evaluate(({clickX, clickY}) => {
        const marker = document.createElement('div');
        marker.style.cssText = `
          position: fixed; left: ${clickX}px; top: ${clickY}px;
          width: 20px; height: 20px; border-radius: 50%;
          background-color: #ff0000; border: 2px solid #ffffff;
          box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
          pointer-events: none; z-index: 999999;
          transform: translate(-50%, -50%);
        `;
        marker.id = 'click-marker';
        document.body.appendChild(marker);

        const ripple = document.createElement('div');
        ripple.style.cssText = `
          position: fixed; left: ${clickX}px; top: ${clickY}px;
          width: 40px; height: 40px; border-radius: 50%;
          border: 2px solid #ff0000; background-color: transparent;
          pointer-events: none; z-index: 999998;
          transform: translate(-50%, -50%);
          animation: ripple 1s ease-out;
        `;
        ripple.id = 'click-ripple';

        if (!document.getElementById('ripple-style')) {
          const style = document.createElement('style');
          style.id = 'ripple-style';
          style.textContent = `
            @keyframes ripple {
              0% { width: 40px; height: 40px; opacity: 1; }
              100% { width: 100px; height: 100px; opacity: 0; }
            }
          `;
          document.head.appendChild(style);
        }
        document.body.appendChild(ripple);
      }, {clickX: x, clickY: y});
    } catch (e) {
      // 시각화 실패는 무시
    }

    // 이동 후 짧은 대기
    await page.waitForTimeout(randomDelay(80, 150));

    // 마우스 다운 전 짧은 대기 (사람처럼)
    const beforeDownDelay = randomDelay(MOUSE_DELAYS.BEFORE_DOWN.min, MOUSE_DELAYS.BEFORE_DOWN.max);
    await page.waitForTimeout(beforeDownDelay);

    // 마우스 다운
    await page.mouse.down();
    
    // 마우스 다운 시 시각 효과 (네비게이션으로 인한 컨텍스트 파괴 오류 무시)
    try {
      await page.evaluate(() => {
        const marker = document.getElementById('click-marker');
        if (marker) {
          marker.style.backgroundColor = '#ff6600';
          marker.style.transform = 'translate(-50%, -50%) scale(0.8)';
        }
      });
    } catch (error) {
      // 네비게이션으로 인한 컨텍스트 파괴는 정상적인 동작
      if (!error.message.includes('Execution context was destroyed')) {
        console.log(`   ${idPrefix}마우스 다운 시각 효과 중 오류: ${error.message}`);
      }
    }

    // 클릭 지속 시간 (버튼 누르고 있기)
    const holdDelay = randomDelay(MOUSE_DELAYS.CLICK_HOLD.min, MOUSE_DELAYS.CLICK_HOLD.max);
    await page.waitForTimeout(holdDelay);

    // 마우스 업
    await page.mouse.up();
    
    // 마우스 업 시 시각 효과 (네비게이션으로 인한 컨텍스트 파괴 오류 무시)
    try {
      await page.evaluate(() => {
        const marker = document.getElementById('click-marker');
        if (marker) {
          marker.style.backgroundColor = '#00ff00';
          marker.style.transform = 'translate(-50%, -50%) scale(1.2)';
        }
      });
    } catch (error) {
      // 네비게이션으로 인한 컨텍스트 파괴는 정상적인 동작
      if (!error.message.includes('Execution context was destroyed')) {
        console.log(`   ${idPrefix}마우스 업 시각 효과 중 오류: ${error.message}`);
      }
    }

    // 클릭 후 대기
    const afterUpDelay = randomDelay(MOUSE_DELAYS.AFTER_UP.min, MOUSE_DELAYS.AFTER_UP.max);
    await page.waitForTimeout(afterUpDelay);
    
    // 시각 효과 제거 (네비게이션으로 인한 컨텍스트 파괴 오류 무시)
    try {
      await page.evaluate(() => {
        const marker = document.getElementById('click-marker');
        const ripple = document.getElementById('click-ripple');
        if (marker) marker.remove();
        if (ripple) ripple.remove();
      });
    } catch (error) {
      // 네비게이션으로 인한 컨텍스트 파괴는 정상적인 동작
      if (!error.message.includes('Execution context was destroyed')) {
        console.log(`   ${idPrefix}시각 효과 제거 중 오류: ${error.message}`);
      }
    }
    
    // 요소 하이라이트 제거 (네비게이션으로 인한 컨텍스트 파괴 오류 무시)
    try {
      await element.evaluate(el => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
      });
    } catch (error) {
      // 네비게이션으로 인한 컨텍스트 파괴는 정상적인 동작
      if (!error.message.includes('Execution context was destroyed')) {
        console.log(`   ${idPrefix}하이라이트 제거 중 오류: ${error.message}`);
      }
    }
    
    console.log(`   ${idPrefix}✅ 사람처럼 클릭 완료`);
    
  } catch (error) {
    console.error(`   ${idPrefix}❌ 사람처럼 클릭 실패:`, error.message);
    throw error;
  }
}

/**
 * 요소의 중심점 좌표 가져오기 (디버깅용)
 */
async function getElementCenter(element) {
  const box = await element.boundingBox();
  if (!box) {
    throw new Error('요소의 boundingBox를 가져올 수 없습니다');
  }
  
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

module.exports = {
  humanClick,
  getRandomClickPoint,
  getElementCenter
};