/**
 * 브라우저 상태 확인 유틸리티
 * - IP 확인
 * - WebDriver 감지 상태 확인
 */

/**
 * IP 확인 및 프록시 오류 감지
 */
async function checkIP(page) {
  try {
    console.log(`🔍 프록시 IP 확인 중...`);
    await page.goto('http://techb.kr/ip.php', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    const ipInfo = await page.evaluate(() => {
      return document.body.innerText;
    });
    
    // IP 추출 및 프록시 오류 감지
    const ipMatch = ipInfo.match(/(\d+\.\d+\.\d+\.\d+)/);
    if (ipMatch) {
      const detectedIp = ipMatch[1];
      const isProxyError = isLocalNetworkIP(detectedIp);
      
      console.log(`📌 감지된 IP: ${detectedIp}`);
      
      if (isProxyError) {
        console.log(`❌ 프록시 오류 감지: 로컬 네트워크 IP (${detectedIp})`);
        console.log(`   - 192.168.x.100 패턴은 프록시 미작동을 의미`);
        console.log('');
        
        return {
          success: false,
          ip: detectedIp,
          error: '프록시 오류: 로컬 네트워크 IP 감지',
          errorType: 'proxy_failure',
          fullInfo: ipInfo
        };
      } else {
        console.log(`✅ 프록시 정상 작동: 외부 IP (${detectedIp})`);
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
      console.log(`⚠️ IP 추출 실패 - 응답 내용:`);
      console.log(ipInfo);
      console.log('');
      
      return {
        success: false,
        ip: null,
        error: 'IP 추출 실패',
        errorType: 'parse_error',
        fullInfo: ipInfo
      };
    }
    
  } catch (error) {
    console.log(`❌ IP 확인 실패:`, error.message);
    return {
      success: false,
      ip: null,
      error: `IP 확인 실패: ${error.message}`,
      errorType: 'connection_error',
      fullInfo: null
    };
  }
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

module.exports = {
  checkIP,
  checkWebDriverStatus
};