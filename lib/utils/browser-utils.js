const path = require('path');
const fs = require('fs').promises;

/**
 * 유저 데이터 디렉토리 경로
 */
function getUserDataDir(profileName) {
  const baseDir = path.join(process.cwd(), 'browser-data');
  return path.join(baseDir, profileName);
}

/**
 * 디렉토리 삭제 (재귀적)
 */
async function removeDirectory(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    console.log(`🗑️ 디렉토리 삭제 완료: ${dirPath}`);
  } catch (error) {
    console.error(`⚠️ 디렉토리 삭제 실패: ${error.message}`);
  }
}

/**
 * 브라우저 창 크기 랜덤 생성
 */
function getRandomViewportSize(baseWidth, baseHeight) {
  // 각 인스턴스마다 -50 ~ +50 픽셀 범위로 랜덤 조정
  const widthVariation = Math.floor(Math.random() * 101) - 50;  // -50 ~ +50
  const heightVariation = Math.floor(Math.random() * 101) - 50; // -50 ~ +50
  
  return {
    width: baseWidth + widthVariation,
    height: baseHeight + heightVariation
  };
}

/**
 * Chrome 실행 인자 생성
 */
function getChromeArgs(options = {}) {
  const { viewport, windowPosition, clearSession, gpuDisabled } = options;
  
  const chromeArgs = [
    '--disable-blink-features=AutomationControlled'
  ];
  
  // 창 위치 설정
  if (windowPosition) {
    chromeArgs.push(`--window-position=${windowPosition.x},${windowPosition.y}`);
  }
  
  if (clearSession) {
    chromeArgs.push(
      '--disable-application-cache',
      '--disable-offline-load-stale-cache',
      '--disable-gpu-shader-disk-cache',
      '--media-cache-size=0',
      '--disk-cache-size=0'
    );
  }
  
  if (gpuDisabled) {
    chromeArgs.push('--disable-gpu');
  }
  
  return chromeArgs;
}

module.exports = {
  getUserDataDir,
  removeDirectory,
  getRandomViewportSize,
  getChromeArgs
};