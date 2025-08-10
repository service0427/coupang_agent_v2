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
  const { viewport, windowPosition, clearCache, gpuDisabled, headless } = options;
  
  console.log('🔧 Chrome 인자 생성 - clearCache:', clearCache, 'headless:', headless);
  
  const chromeArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-infobars',
    '--hide-crash-restore-bubble'
  ];
  
  // Ubuntu/Linux 환경에서 추가 인자들 (GUI 모드에서도 안정성을 위해 필요)
  if (process.platform === 'linux') {
    chromeArgs.push(
      '--no-sandbox',                    // Ubuntu GUI에서도 권한 문제로 필요할 수 있음
      '--disable-dev-shm-usage',         // /dev/shm 공간 부족 문제 해결
      '--disable-setuid-sandbox',        // setuid 샌드박스 비활성화
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-extensions-except',     // 불필요한 확장 프로그램 비활성화
      '--disable-plugins-discovery',     // 플러그인 검색 비활성화
      '--no-zygote',                     // zygote 프로세스 비활성화로 안정성 향상
      '--single-process'                 // 단일 프로세스 모드로 메모리 절약 및 안정성 향상
    );
    
    console.log('   🐧 Ubuntu GUI 환경 최적화 인자 추가 (안정성 향상)');
  }
  
  // 창 위치 설정
  if (windowPosition) {
    chromeArgs.push(`--window-position=${windowPosition.x},${windowPosition.y}`);
  }
  
  // clearCache가 true일 때만 캐시 비활성화
  // clearSession과는 무관하게 처리
  if (clearCache) {
    chromeArgs.push(
      '--disable-application-cache',
      '--disable-offline-load-stale-cache',
      '--disable-gpu-shader-disk-cache',
      '--media-cache-size=0',
      '--disk-cache-size=0'
    );
    console.log('   📵 캐시 비활성화 인자 추가');
  } else {
    console.log('   💾 캐시 활성화 (트래픽 절감)');
  }
  
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