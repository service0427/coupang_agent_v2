/**
 * 쿠키 체크 유틸리티
 * - 현재 페이지의 쿠키 정보를 체크하고 분석
 */

/**
 * 페이지의 쿠키 체크
 */
async function checkCookies(context) {
  try {
    console.log(`\n🍪 쿠키 상태 체크 중...`);
    
    // 모든 쿠키 가져오기
    const cookies = await context.cookies();
    console.log(`   총 쿠키 수: ${cookies.length}개`);
    
    // 쿠팡 관련 중요 쿠키 체크
    const importantCookies = [
      'PCID',           // PC 식별자
      'sid',            // 세션 ID
      'x-coupang-accept-language',
      'x-coupang-target-market',
      'bm_sz',          // 봇 감지 관련
      'ak_bmsc',        // Akamai 봇 매니저
      '_abck'           // Akamai 봇 감지
    ];
    
    console.log(`   중요 쿠키 상태:`);
    for (const cookieName of importantCookies) {
      const cookie = cookies.find(c => c.name === cookieName);
      if (cookie) {
        console.log(`   ✓ ${cookieName}: ${cookie.value.substring(0, 20)}...`);
      } else {
        console.log(`   ✗ ${cookieName}: 없음`);
      }
    }
    
    // 봇 감지 관련 쿠키 분석
    const botCookies = cookies.filter(c => 
      c.name.includes('bm_') || 
      c.name.includes('ak_') || 
      c.name === '_abck'
    );
    
    if (botCookies.length > 0) {
      console.log(`   ⚠️  봇 감지 쿠키 발견: ${botCookies.length}개`);
      botCookies.forEach(cookie => {
        console.log(`      - ${cookie.name}: ${cookie.domain}`);
      });
    }
    
    // 쿠키 도메인 분석
    const domains = [...new Set(cookies.map(c => c.domain))];
    console.log(`   쿠키 도메인: ${domains.join(', ')}`);
    
    console.log('');
    
  } catch (error) {
    console.error('❌ 쿠키 체크 중 오류:', error.message);
  }
}

/**
 * 쿠키 비교 (초기 쿠키와 현재 쿠키)
 */
async function compareCookies(context, initialCookies) {
  try {
    const currentCookies = await context.cookies();
    
    // 새로 추가된 쿠키
    const newCookies = currentCookies.filter(current => 
      !initialCookies.find(initial => 
        initial.name === current.name && initial.domain === current.domain
      )
    );
    
    if (newCookies.length > 0) {
      console.log(`🍪 새로 추가된 쿠키: ${newCookies.length}개`);
      newCookies.forEach(cookie => {
        console.log(`   + ${cookie.name} (${cookie.domain})`);
      });
    }
    
    // 삭제된 쿠키
    const deletedCookies = initialCookies.filter(initial => 
      !currentCookies.find(current => 
        current.name === initial.name && current.domain === initial.domain
      )
    );
    
    if (deletedCookies.length > 0) {
      console.log(`🍪 삭제된 쿠키: ${deletedCookies.length}개`);
      deletedCookies.forEach(cookie => {
        console.log(`   - ${cookie.name} (${cookie.domain})`);
      });
    }
    
  } catch (error) {
    console.error('❌ 쿠키 비교 중 오류:', error.message);
  }
}

module.exports = {
  checkCookies,
  compareCookies
};