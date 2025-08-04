/**
 * 브라우저 상태 확인 유틸리티
 * - IP 확인
 * - WebDriver 감지 상태 확인
 */

/**
 * IP 확인
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
    
    console.log(`📌 프록시 정보:`);
    console.log(ipInfo);
    console.log('');
    
    return ipInfo;
  } catch (error) {
    console.log(`⚠️ IP 확인 실패:`, error.message);
    return null;
  }
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