/**
 * 화면 레이아웃 자동 계산 유틸리티
 * 1~16개의 브라우저 창을 화면에 자동 배치
 * 최소 크기 1024x768 보장하며 필요시 겹침 허용
 */

const os = require('os');

// 최소 창 크기 상수
const MIN_WINDOW_WIDTH = 1024;
const MIN_WINDOW_HEIGHT = 768;

// 계단식 배치 오프셋
const CASCADE_OFFSET_X = 40;  // X축 40px씩 이동
const CASCADE_OFFSET_Y = 30;  // Y축 30px씩 이동

/**
 * 시스템 화면 해상도 감지
 * Linux에서는 xrandr 명령 사용, 실패 시 기본값 사용
 */
async function getScreenResolution() {
  try {
    // DISPLAY 환경변수 확인 및 설정
    if (!process.env.DISPLAY) {
      process.env.DISPLAY = ':0';
    }
    
    if (os.platform() === 'linux') {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        // xrandr 명령으로 현재 디스플레이 해상도 확인
        const { stdout } = await execAsync('DISPLAY=:0 xrandr 2>/dev/null | grep "\\*" | head -1');
        const match = stdout.match(/(\d+)x(\d+)/);
        if (match) {
          const width = parseInt(match[1]);
          const height = parseInt(match[2]);
          console.log(`📺 화면 해상도 감지: ${width}x${height}`);
          return { width, height };
        }
      } catch (e) {
        // xrandr 실패는 정상적인 상황일 수 있음 (헤드리스 환경 등)
      }
    }
    
    // 환경변수에서 해상도 확인 (사용자 설정 가능)
    if (process.env.SCREEN_WIDTH && process.env.SCREEN_HEIGHT) {
      return {
        width: parseInt(process.env.SCREEN_WIDTH),
        height: parseInt(process.env.SCREEN_HEIGHT)
      };
    }
    
    // 기본값 (4K 모니터 고려)
    console.log('📺 기본 해상도 사용: 2560x1440');
    return {
      width: 2560,
      height: 1440
    };
  } catch (error) {
    console.log('⚠️ 화면 해상도 감지 실패, 기본값 사용');
    return {
      width: 2560,
      height: 1440
    };
  }
}

/**
 * 브라우저 수에 따른 그리드 레이아웃 계산
 * @param {number} browserCount - 브라우저 수 (1~16)
 * @returns {Object} 그리드 정보 {cols, rows}
 */
function calculateGrid(browserCount) {
  const grids = {
    1: { cols: 1, rows: 1 },
    2: { cols: 2, rows: 1 },
    3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 },
    5: { cols: 3, rows: 2 },
    6: { cols: 3, rows: 2 },
    7: { cols: 4, rows: 2 },
    8: { cols: 4, rows: 2 },
    9: { cols: 3, rows: 3 },
    10: { cols: 4, rows: 3 },
    11: { cols: 4, rows: 3 },
    12: { cols: 4, rows: 3 },
    13: { cols: 4, rows: 4 },
    14: { cols: 4, rows: 4 },
    15: { cols: 4, rows: 4 },
    16: { cols: 4, rows: 4 }
  };
  
  return grids[browserCount] || grids[16];
}

/**
 * 각 브라우저의 위치와 크기 계산 (스마트 배치)
 * @param {number} threadNumber - 스레드 번호 (1부터 시작)
 * @param {number} totalThreads - 전체 스레드 수
 * @param {Object} screenRes - 화면 해상도 {width, height}
 * @returns {Object} 브라우저 위치와 크기 {x, y, width, height}
 */
function calculateBrowserPosition(threadNumber, totalThreads, screenRes = null) {
  // 기본 화면 해상도
  const screen = screenRes || { width: 2560, height: 1440 };
  
  // 태스크바/메뉴바 공간 확보 (상단 30px, 하단 50px)
  const usableHeight = screen.height - 80;
  const usableWidth = screen.width;
  
  // 배치 전략 결정
  if (totalThreads <= 4) {
    // 1-4개: 그리드 배치 (창 크기 최대화)
    const grid = calculateGrid(totalThreads);
    const padding = 5;
    const browserWidth = Math.floor((usableWidth - (grid.cols + 1) * padding) / grid.cols);
    const browserHeight = Math.floor((usableHeight - (grid.rows + 1) * padding) / grid.rows);
    
    // 최소 크기 보장
    const finalWidth = Math.max(browserWidth, MIN_WINDOW_WIDTH);
    const finalHeight = Math.max(browserHeight, MIN_WINDOW_HEIGHT);
    
    const index = threadNumber - 1;
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    
    return {
      x: padding + col * (finalWidth + padding),
      y: 30 + padding + row * (finalHeight + padding),
      width: finalWidth,
      height: finalHeight
    };
    
  } else {
    // 5개 이상: 계단식 배치 (겹침 허용)
    const index = threadNumber - 1;
    
    // 기본 위치 (좌상단)
    const baseX = 10;
    const baseY = 30;
    
    // 계단식 오프셋 적용
    let x = baseX + (index * CASCADE_OFFSET_X);
    let y = baseY + (index * CASCADE_OFFSET_Y);
    
    // 화면 경계 체크 및 순환
    const maxX = usableWidth - MIN_WINDOW_WIDTH;
    const maxY = usableHeight - MIN_WINDOW_HEIGHT;
    
    // X축 순환: 화면 끝에 도달하면 다시 왼쪽으로
    if (x > maxX) {
      const cycles = Math.floor(x / maxX);
      x = baseX + (x % maxX) + (cycles * 20); // 사이클마다 20px 추가 오프셋
    }
    
    // Y축 순환: 화면 끝에 도달하면 다시 위로
    if (y > maxY) {
      const cycles = Math.floor(y / maxY);
      y = baseY + (y % maxY) + (cycles * 20); // 사이클마다 20px 추가 오프셋
    }
    
    console.log(`🪟 브라우저 ${threadNumber}/${totalThreads}: 위치(${x}, ${y}) 크기(${MIN_WINDOW_WIDTH}x${MIN_WINDOW_HEIGHT})`);
    
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT
    };
  }
}

/**
 * API 모드용 브라우저 위치 계산
 * 인스턴스 번호와 스레드 번호를 고려한 배치
 */
async function calculateBrowserLayoutForAPI(instanceNumber, threadNumber, totalThreads) {
  const screenRes = await getScreenResolution();
  
  console.log(`📐 화면 해상도: ${screenRes.width}x${screenRes.height}`);
  console.log(`🔢 브라우저 배치: 인스턴스 ${instanceNumber}, 스레드 ${threadNumber}/${totalThreads}`);
  
  const position = calculateBrowserPosition(threadNumber, totalThreads, screenRes);
  
  console.log(`📍 브라우저 위치: (${position.x}, ${position.y}) 크기: ${position.width}x${position.height}`);
  
  return position;
}

/**
 * 단일 모드용 브라우저 위치 계산
 */
async function calculateBrowserLayoutForSingle() {
  const screenRes = await getScreenResolution();
  
  // 단일 모드는 화면 중앙에 적당한 크기로 배치
  const width = Math.min(1200, screenRes.width * 0.8);
  const height = Math.min(800, screenRes.height * 0.8);
  const x = Math.floor((screenRes.width - width) / 2);
  const y = Math.floor((screenRes.height - height) / 2);
  
  return {
    x: x,
    y: y,
    width: width,
    height: height
  };
}

module.exports = {
  getScreenResolution,
  calculateGrid,
  calculateBrowserPosition,
  calculateBrowserLayoutForAPI,
  calculateBrowserLayoutForSingle
};