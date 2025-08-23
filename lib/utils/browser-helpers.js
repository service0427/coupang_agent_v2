/**
 * 통합 브라우저 헬퍼
 * browser-utils.js + browser-checker.js + preferences-cleaner.js
 */

const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// =====================================================
// browser-utils.js
// =====================================================

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

// =====================================================
// browser-checker.js에서 통합
// =====================================================

/**
 * IP 확인 및 프록시 오류 감지 (브라우저 사용)
 * HTTPS를 사용하여 TLS 스택 초기화 및 SSL 차단 감지
 * 프록시 연결 실패시 최대 3회 재시도
 */
async function checkIP(page, threadPrefix = '', maxRetries = 3) {
  let lastError = null;
  let lastErrorType = null;
  
  // 재시도 루프
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();
    
    try {
      if (attempt === 1) {
        console.log(`${threadPrefix}🔍 프록시 IP 확인 중 (HTTPS)...`);
      } else {
        console.log(`${threadPrefix}🔍 프록시 IP 확인 재시도 중 (${attempt}/${maxRetries})...`);
      }
      
      // Promise.race로 더 강력한 타임아웃 처리
      const navigationPromise = page.goto('https://mkt.techb.kr/ip', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000  // 10초 타임아웃
      });
      
      // 추가 타임아웃 보장
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('IP 체크 타임아웃 (10초)'));
        }, 10000);
      });
      
      // 둘 중 먼저 완료되는 것 사용
      await Promise.race([navigationPromise, timeoutPromise]);
      
      // 페이지 내용 읽기도 타임아웃 설정
      const ipInfo = await Promise.race([
        page.evaluate(() => document.body.innerText),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('페이지 읽기 타임아웃')), 2000);
        })
      ]);
      
      const elapsed = Date.now() - startTime;
      
      // IP 추출 및 프록시 오류 감지
      const ipMatch = ipInfo.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        const detectedIp = ipMatch[1];
        const isProxyError = isLocalNetworkIP(detectedIp);
        
        console.log(`${threadPrefix}📌 감지된 IP: ${detectedIp} (${elapsed}ms)`);
        
        if (isProxyError) {
          console.log(`${threadPrefix}❌ 프록시 오류 감지: 로컬 네트워크 IP (${detectedIp})`);
          console.log(`${threadPrefix}   - 192.168.x.100 패턴은 프록시 미작동을 의미`);
          console.log('');
          
          return {
            success: false,
            ip: detectedIp,
            error: '프록시 오류: 로컬 네트워크 IP 감지',
            errorType: 'error_proxy_local_ip',
            fullInfo: ipInfo
          };
        } else {
          console.log(`${threadPrefix}✅ 프록시 정상 작동: 외부 IP (${detectedIp})`);
          console.log('');
          
          return {
            success: true,
            ip: detectedIp,
            error: null,
            errorType: null,
            fullInfo: ipInfo
          };
        }
      } else {
        console.log(`${threadPrefix}⚠️ IP 추출 실패 - 응답 내용:`);
        console.log(ipInfo);
        console.log('');
        
        return {
          success: false,
          ip: null,
          error: 'IP 추출 실패',
          errorType: 'error_parse_failed',
          fullInfo: ipInfo
        };
      }
      
    } catch (error) {
      const elapsed = Date.now() - startTime;
      lastError = error.message;
      
      // 타임아웃 에러 특별 처리 (IP 체크 타임아웃, 페이지 읽기 타임아웃 포함)
      if (error.message.includes('타임아웃') || 
          error.message.includes('Timeout') || 
          error.message.includes('Navigation timeout')) {
        console.log(`${threadPrefix}❌ IP 확인 타임아웃 (${elapsed}ms) - 프록시 무응답`);
        // 타임아웃 타입 구분
        if (error.message.includes('페이지 읽기 타임아웃')) {
          lastErrorType = 'timeout_page_read';
        } else if (error.message.includes('Navigation timeout')) {
          lastErrorType = 'timeout_navigation';
        } else {
          lastErrorType = 'timeout_proxy_response';
        }
        
        // 타임아웃도 재시도 대상
        if (attempt < maxRetries) {
          console.log(`${threadPrefix}⏳ 2초 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      // 프록시 연결 실패 에러 처리
      else if (error.message.includes('ERR_SOCKS_CONNECTION_FAILED') ||
          error.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
        console.log(`${threadPrefix}❌ 프록시 연결 실패 (${elapsed}ms)`);
        lastErrorType = 'error_proxy_connection_failed';
      }
      else if (error.message.includes('ERR_CONNECTION_REFUSED')) {
        console.log(`${threadPrefix}❌ 프록시 연결 거부 (${elapsed}ms)`);
        lastErrorType = 'error_proxy_connection_refused';
      }
      else if (error.message.includes('ERR_CONNECTION_CLOSED') ||
               error.message.includes('ERR_CONNECTION_RESET')) {
        console.log(`${threadPrefix}❌ 프록시 연결 재설정 (${elapsed}ms)`);
        lastErrorType = 'error_proxy_connection_reset';
        
        // 재시도 대상
        if (attempt < maxRetries) {
          console.log(`${threadPrefix}⏳ 2초 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      // 네트워크 에러
      else if (error.message.includes('ERR_INTERNET_DISCONNECTED')) {
        console.log(`${threadPrefix}❌ 인터넷 연결 끊김 (${elapsed}ms)`);
        lastErrorType = 'error_network_disconnected';
      }
      else if (error.message.includes('ERR_NAME_NOT_RESOLVED')) {
        console.log(`${threadPrefix}❌ DNS 해석 실패 (${elapsed}ms)`);
        lastErrorType = 'error_network_dns_failed';
      }
      else if (error.message.includes('ERR_NETWORK')) {
        console.log(`${threadPrefix}❌ 네트워크 도달 불가 (${elapsed}ms)`);
        lastErrorType = 'error_network_unreachable';
        
        // 네트워크 오류도 재시도
        if (attempt < maxRetries) {
          console.log(`${threadPrefix}⏳ 2초 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      // SSL/TLS 관련 에러 감지 (재시도 안함)
      else if (error.message.includes('ERR_SSL_PROTOCOL_ERROR')) {
        console.log(`${threadPrefix}🔒 SSL 프로토콜 오류 (${elapsed}ms):`, error.message);
        return {
          success: false,
          ip: null,
          error: `SSL 프로토콜 오류: ${error.message}`,
          errorType: 'error_ssl_protocol',
          fullInfo: null
        };
      }
      else if (error.message.includes('ERR_CERT_') || error.message.includes('certificate')) {
        console.log(`${threadPrefix}🔒 SSL 인증서 오류 (${elapsed}ms):`, error.message);
        return {
          success: false,
          ip: null,
          error: `SSL 인증서 오류: ${error.message}`,
          errorType: 'error_ssl_certificate',
          fullInfo: null
        };
      }
      else if (error.message.includes('ERR_TLS_') || 
               error.message.includes('SSL') || 
               error.message.includes('TLS')) {
        console.log(`${threadPrefix}🔒 SSL/TLS 차단 (${elapsed}ms):`, error.message);
        return {
          success: false,
          ip: null,
          error: `SSL 차단: ${error.message}`,
          errorType: 'error_ssl_blocked',
          fullInfo: null
        };
      }
      
      // 기타 에러
      else {
        console.log(`${threadPrefix}❌ IP 확인 실패 (${elapsed}ms):`, error.message);
        lastErrorType = 'error_connection_unknown';
        
        // 기타 에러도 재시도
        if (attempt < maxRetries) {
          console.log(`${threadPrefix}⏳ 2초 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
    }
  }
  
  // 모든 재시도 실패
  console.log(`${threadPrefix}❌ 프록시 최종 실패: ${lastError} (${maxRetries}회 시도)`);
  console.log('');
  
  return {
    success: false,
    ip: null,
    error: `프록시 오류: ${lastError}`,
    errorType: lastErrorType || 'error_connection_unknown',
    fullInfo: null
  };
}

/**
 * 로컬 네트워크 IP 확인 (프록시 오류 감지용)
 */
function isLocalNetworkIP(ip) {
  if (!ip) return false;
  
  // 192.168.x.100 패턴 확인 (프록시 오류 시 나타나는 특정 패턴)
  if (/^192\.168\.\d+\.100$/.test(ip)) {
    return true;
  }
  
  // 기타 로컬 네트워크 대역 확인
  const localPatterns = [
    /^10\./,           // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
    /^192\.168\./,     // 192.168.0.0/16 (전체)
    /^127\./,          // 127.0.0.0/8 (localhost)
    /^169\.254\./      // 169.254.0.0/16 (APIPA)
  ];
  
  return localPatterns.some(pattern => pattern.test(ip));
}

/**
 * WebDriver 상태 확인
 */
async function checkWebDriverStatus(page) {
  console.log(`🔍 WebDriver 상태 확인 중...`);
  
  const webdriverStatus = await page.evaluate(() => {
    const results = {};
    
    // navigator의 모든 속성 가져오기
    for (let prop in navigator) {
      try {
        const value = navigator[prop];
        const type = typeof value;
        
        if (type === 'string' || type === 'number' || type === 'boolean') {
          results[`navigator.${prop}`] = value;
        } else if (type === 'object' && value !== null) {
          results[`navigator.${prop}`] = `[${type}]`;
        } else if (type === 'function') {
          results[`navigator.${prop}`] = `[${type}]`;
        } else {
          results[`navigator.${prop}`] = value;
        }
      } catch (e) {
        results[`navigator.${prop}`] = `[Error: ${e.message}]`;
      }
    }
    
    return results;
  });
  
  // webdriver 관련 속성 확인
  const webdriverRelated = ['navigator.webdriver', 'navigator.webdriver (proto)'];
  webdriverRelated.forEach(key => {
    if (webdriverStatus[key] !== undefined) {
      const value = webdriverStatus[key];
      if (value === true) {
        console.log(`  ${key}: ⚠️ ${value} (감지됨)`);
      } else if (value === false) {
        console.log(`  ${key}: ✅ ${value} (정상)`);
      } else if (value === undefined) {
        console.log(`  ${key}: ✅ undefined (정상)`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }
  });
  
  console.log('');
}

// =====================================================
// preferences-cleaner.js에서 통합
// =====================================================

/**
 * Chrome Preferences 파일을 정리하여 복구 메시지 방지
 * @param {string} userDataDir - Chrome 유저 데이터 디렉토리 경로
 */
async function cleanChromePreferences(userDataDir) {
  try {
    const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
    
    // Preferences 파일이 존재하는지 확인
    try {
      await fs.access(prefsPath);
    } catch {
      // 파일이 없으면 스킵 (첫 실행이거나 새 프로필)
      console.log('   📝 Preferences 파일 없음 (첫 실행 또는 새 프로필)');
      return;
    }
    
    // Preferences 파일 읽기
    const prefsData = await fs.readFile(prefsPath, 'utf8');
    const prefs = JSON.parse(prefsData);
    
    // 정상 종료로 설정
    if (!prefs.profile) {
      prefs.profile = {};
    }
    
    // 복구 메시지 관련 필드 설정
    prefs.profile.exit_type = "Normal";
    prefs.profile.exited_cleanly = true;
    
    // 세션 복구 관련 설정 추가
    if (!prefs.session) {
      prefs.session = {};
    }
    prefs.session.restore_on_startup = 5; // 5 = 이전 세션 복구 안함
    
    // 브라우저 충돌 관련 설정
    if (!prefs.browser) {
      prefs.browser = {};
    }
    prefs.browser.check_default_browser = false;
    prefs.browser.show_update_promotion_info_bar = false;
    
    // 파일 저장
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2));
    console.log('   ✅ Chrome Preferences 정리 완료 (복구 메시지 방지)');
    
  } catch (error) {
    // 오류 발생 시 경고만 표시하고 계속 진행
    console.warn('   ⚠️ Preferences 정리 실패 (무시하고 계속):', error.message);
  }
}

/**
 * Local State 파일도 정리 (추가 안전장치)
 * @param {string} userDataDir - Chrome 유저 데이터 디렉토리 경로
 */
async function cleanLocalState(userDataDir) {
  try {
    const localStatePath = path.join(userDataDir, 'Local State');
    
    // Local State 파일이 존재하는지 확인
    try {
      await fs.access(localStatePath);
    } catch {
      // 파일이 없으면 스킵
      return;
    }
    
    // Local State 파일 읽기
    const stateData = await fs.readFile(localStatePath, 'utf8');
    const state = JSON.parse(stateData);
    
    // 정상 종료로 설정
    if (!state.profile) {
      state.profile = {};
    }
    
    if (!state.profile.info_cache) {
      state.profile.info_cache = {};
    }
    
    // Default 프로필의 상태 정리
    if (state.profile.info_cache.Default) {
      state.profile.info_cache.Default.is_using_default_name = true;
      state.profile.info_cache.Default.is_ephemeral = false;
    }
    
    // 파일 저장
    await fs.writeFile(localStatePath, JSON.stringify(state, null, 2));
    
  } catch (error) {
    // Local State 정리 실패는 무시 (선택적)
  }
}

/**
 * Chrome 프로필 전체 정리
 * @param {string} userDataDir - Chrome 유저 데이터 디렉토리 경로
 */
async function cleanChromeProfile(userDataDir) {
  await cleanChromePreferences(userDataDir);
  await cleanLocalState(userDataDir);
}

module.exports = {
  // screen-layout.js에서 통합
  getScreenResolution,
  calculateGrid,
  calculateBrowserPosition,
  calculateBrowserLayoutForAPI,
  calculateBrowserLayoutForSingle,
  // window-position.js에서 통합
  calculateWindowPosition,
  calculateViewportSize,
  setTotalThreadCount,
  initializeScreenResolution,
  // browser-checker.js에서 통합
  checkIP,
  checkWebDriverStatus,
  // preferences-cleaner.js에서 통합
  cleanChromePreferences,
  cleanLocalState,
  cleanChromeProfile
};