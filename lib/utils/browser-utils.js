const path = require('path');
const fs = require('fs').promises;

/**
 * 유저 데이터 디렉토리 경로 (순차 폴더 시스템 통합)
 */
async function getUserDataDir(profileName) {
  const SequentialProfileManager = require('./sequential-profile-manager');
  
  try {
    // SequentialProfileManager로 현재 활성 폴더 경로 가져오기
    const manager = new SequentialProfileManager(profileName);
    const currentPath = await manager.getCurrentProfilePath();
    console.log(`📁 순차 폴더 시스템 - 현재 활성 경로: ${currentPath}`);
    return currentPath;
  } catch (error) {
    // 에러 발생 시 기본 방식으로 폴백
    console.log(`⚠️ 순차 폴더 접근 실패, 기본 경로 사용: ${error.message}`);
    const baseDir = path.join(process.cwd(), 'browser-data');
    return path.join(baseDir, profileName);
  }
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
  const { viewport, windowPosition, gpuDisabled, headless } = options;
  
  console.log('🔧 Chrome 인자 생성 - 공유 캐시 모드 (최소 인자)');
  
  // GUI 모드에서 최소 인자만 사용
  const chromeArgs = [
    '--disable-blink-features=AutomationControlled'
  ];
  
  console.log('   ✅ 최소 Chrome 인자 (성능 최적화)');
  
  // 창 위치 설정
  if (windowPosition) {
    chromeArgs.push(`--window-position=${windowPosition.x},${windowPosition.y}`);
  }
  
  // 항상 캐시 활성화 (공유 캐시 시스템)
  console.log('   💾 캐시 활성화 - 공유 캐시 시스템 (트래픽 절감)');
  
  if (gpuDisabled) {
    chromeArgs.push('--disable-gpu');
  }
  
  console.log('🔧 최종 Chrome 인자:', chromeArgs);
  return chromeArgs;
}

module.exports = {
  getUserDataDir,
  removeDirectory,
  getRandomViewportSize,
  getChromeArgs
};