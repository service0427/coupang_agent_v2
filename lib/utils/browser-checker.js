/**
 * 브라우저 상태 확인 유틸리티
 * - IP 확인 (HTTPS)
 * - SSL/TLS 차단 감지
 * - WebDriver 감지 상태 확인
 */

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

module.exports = {
  checkIP,
  checkWebDriverStatus
};