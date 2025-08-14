/**
 * 고급 프로필 정리 시스템
 * - 캐시는 보존하면서 핑거프린팅 데이터만 선택적 제거
 * - IP 변경과 함께 사용하여 최대 익명성 확보
 */

const fs = require('fs').promises;
const path = require('path');
const { randomBytes } = require('crypto');

/**
 * 핑거프린팅 방지 데이터 정리
 */
async function cleanFingerprintingData(profilePath) {
  console.log('🔒 핑거프린팅 방지 데이터 정리 시작...');
  
  // 1단계: 추적/세션 데이터 완전 삭제
  const trackingFiles = [
    'Default/Cookies',
    'Default/Cookies-journal',
    'Default/Session Storage',
    'Default/Local Storage', 
    'Default/IndexedDB',
    'Default/History',
    'Default/History-journal',
    'Default/Top Sites',
    'Default/Top Sites-journal',
    'Default/Web Data',
    'Default/Web Data-journal',
    'Default/Favicons',
    'Default/Favicons-journal',
    'Default/Login Data',
    'Default/Login Data-journal'
  ];
  
  for (const file of trackingFiles) {
    await deleteFileIfExists(path.join(profilePath, file));
  }
  
  // 2단계: 핑거프린팅 민감 설정 초기화
  const fingerprintFiles = [
    'Default/Preferences',
    'Default/Secure Preferences',
    'Default/MediaDeviceSalts',
    'Default/MediaDeviceSalts-journal'
  ];
  
  for (const file of fingerprintFiles) {
    await deleteFileIfExists(path.join(profilePath, file));
  }
  
  // 3단계: 확장 프로그램 제거 (핑거프린팅 요소)
  const extensionsPath = path.join(profilePath, 'Default/Extensions');
  try {
    await fs.rm(extensionsPath, { recursive: true, force: true });
    console.log('   ✅ 확장 프로그램 제거');
  } catch (e) {
    // 없으면 무시
  }
  
  // 4단계: 새로운 랜덤 설정 생성
  await generateRandomPreferences(path.join(profilePath, 'Default'));
  
  console.log('✅ 핑거프린팅 방지 정리 완료');
  
  // 보존된 캐시 확인
  const preservedCaches = [
    'Default/Cache',
    'Default/Code Cache', 
    'ShaderCache',
    'GrShaderCache',
    'GraphiteDawnCache'
  ];
  
  console.log('💾 보존된 캐시:');
  for (const cache of preservedCaches) {
    const cachePath = path.join(profilePath, cache);
    try {
      const stats = await fs.stat(cachePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`   📦 ${cache}: ${sizeMB}MB`);
    } catch (e) {
      console.log(`   📦 ${cache}: 없음`);
    }
  }
}

/**
 * 파일 안전 삭제
 */
async function deleteFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`   ✅ 삭제: ${path.basename(filePath)}`);
  } catch (e) {
    // 파일이 없으면 무시
  }
}

/**
 * 랜덤 브라우저 설정 생성
 */
async function generateRandomPreferences(defaultPath) {
  try {
    await fs.mkdir(defaultPath, { recursive: true });
    
    // 랜덤 설정 생성
    const randomPrefs = {
      "profile": {
        "name": `User${randomBytes(4).toString('hex')}`,
        "managed_user_id": "",
        "avatar_index": Math.floor(Math.random() * 26)
      },
      "browser": {
        "show_home_button": Math.random() > 0.5,
        "check_default_browser": false
      },
      "session": {
        "restore_on_startup": 1,
        "startup_urls": ["chrome://newtab/"]
      },
      "extensions": {
        "ui": {
          "developer_mode": false
        }
      },
      "webkit": {
        "webprefs": {
          "fonts": {
            "serif": {
              "Hang": "Malgun Gothic",
              "Hans": "Microsoft YaHei",
              "Hant": "Microsoft JhengHei"
            }
          }
        }
      }
    };
    
    const prefsPath = path.join(defaultPath, 'Preferences');
    await fs.writeFile(prefsPath, JSON.stringify(randomPrefs, null, 2));
    console.log('   ✅ 랜덤 설정 생성');
    
  } catch (error) {
    console.log('⚠️ 랜덤 설정 생성 실패:', error.message);
  }
}

/**
 * CDP를 통한 런타임 핑거프린트 방지
 */
async function applyRuntimeAntiFingerprinting(page) {
  try {
    console.log('🛡️ 런타임 핑거프린트 방지 적용...');
    
    // WebGL 핑거프린트 방지
    await page.addInitScript(() => {
      // WebGL 컨텍스트 랜덤화
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes) {
        if (contextType === 'webgl' || contextType === 'webgl2') {
          const context = getContext.apply(this, arguments);
          if (context) {
            // GPU 정보 랜덤화
            const getParameter = context.getParameter;
            context.getParameter = function(parameter) {
              if (parameter === context.RENDERER) {
                const renderers = [
                  'Intel(R) HD Graphics 620',
                  'Intel(R) UHD Graphics 620', 
                  'NVIDIA GeForce GTX 1050',
                  'Intel(R) Iris(R) Plus Graphics'
                ];
                return renderers[Math.floor(Math.random() * renderers.length)];
              }
              if (parameter === context.VENDOR) {
                return Math.random() > 0.5 ? 'Intel Inc.' : 'NVIDIA Corporation';
              }
              return getParameter.apply(this, arguments);
            };
          }
          return context;
        }
        return getContext.apply(this, arguments);
      };
      
      // Canvas 핑거프린트 방지
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function() {
        // 약간의 노이즈 추가
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            if (Math.random() < 0.001) { // 0.1% 확률로 픽셀 약간 변경
              data[i] = Math.min(255, data[i] + Math.floor(Math.random() * 3) - 1);
            }
          }
          context.putImageData(imageData, 0, 0);
        }
        return toDataURL.apply(this, arguments);
      };
      
      // Screen 정보 랜덤화
      Object.defineProperty(screen, 'width', {
        get: () => 1920 + Math.floor(Math.random() * 200) - 100
      });
      Object.defineProperty(screen, 'height', {
        get: () => 1080 + Math.floor(Math.random() * 100) - 50  
      });
      
      // Timezone 랜덤화
      Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
        value: function() {
          const options = Object.getPrototypeOf(this).resolvedOptions.call(this);
          const timezones = ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai'];
          options.timeZone = timezones[Math.floor(Math.random() * timezones.length)];
          return options;
        }
      });
    });
    
    console.log('✅ 런타임 핑거프린트 방지 완료');
    
  } catch (error) {
    console.log('⚠️ 런타임 방지 설정 실패:', error.message);
  }
}

/**
 * User-Agent 랜덤 생성
 */
function generateRandomUserAgent() {
  const chromeVersions = ['120.0.6099.109', '119.0.6045.199', '118.0.5993.117'];
  const webkitVersions = ['537.36', '537.35'];
  const windowsVersions = ['Windows NT 10.0; Win64; x64', 'Windows NT 10.0; WOW64'];
  
  const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const webkitVersion = webkitVersions[Math.floor(Math.random() * webkitVersions.length)];
  const windowsVersion = windowsVersions[Math.floor(Math.random() * windowsVersions.length)];
  
  return `Mozilla/5.0 (${windowsVersion}) AppleWebKit/${webkitVersion} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkitVersion}`;
}

module.exports = {
  cleanFingerprintingData,
  applyRuntimeAntiFingerprinting,
  generateRandomUserAgent
};