const fs = require('fs').promises;
const path = require('path');

class CookieTracker {
  constructor() {
    this.profileName = null;
    this.dataDir = null;
    this.initialCookiesFile = null;
    this.finalCookiesFile = null;
    this.comparisonFile = null;
  }

  setProfile(profileName) {
    this.profileName = profileName || 'default';
    this.dataDir = path.join(__dirname, '..', '..', 'data', 'tracking', 'cookies', this.profileName);
    this.initialCookiesFile = path.join(this.dataDir, 'initial-cookies.json');
    this.finalCookiesFile = path.join(this.dataDir, 'final-cookies.json');
    this.comparisonFile = path.join(this.dataDir, 'cookie-comparison.json');
  }

  async init(profileName) {
    try {
      this.setProfile(profileName);
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('❌ 쿠키 추적 모듈 초기화 실패:', error);
    }
  }

  async saveInitialCookies(context) {
    try {
      const cookies = await context.cookies();
      await fs.writeFile(this.initialCookiesFile, JSON.stringify(cookies, null, 2));
      console.log(`\n🍪 초기 쿠키 저장됨: ${cookies.length}개`);
      return cookies;
    } catch (error) {
      console.error('❌ 초기 쿠키 저장 실패:', error);
      return [];
    }
  }

  async saveFinalCookies(context) {
    try {
      const cookies = await context.cookies();
      await fs.writeFile(this.finalCookiesFile, JSON.stringify(cookies, null, 2));
      console.log(`\n🍪 최종 쿠키 저장됨: ${cookies.length}개`);
      return cookies;
    } catch (error) {
      console.error('❌ 최종 쿠키 저장 실패:', error);
      return [];
    }
  }

  async compareCookies(initialCookies, finalCookies) {
    const comparison = {
      timestamp: new Date().toISOString(),
      initial: {
        count: initialCookies.length,
        domains: this.getDomains(initialCookies)
      },
      final: {
        count: finalCookies.length,
        domains: this.getDomains(finalCookies)
      },
      newCookies: [],
      modifiedCookies: [],
      deletedCookies: [],
      unchangedCookies: []
    };

    // 쿠키 맵 생성 (도메인+이름을 키로 사용)
    const initialMap = new Map();
    const finalMap = new Map();

    initialCookies.forEach(cookie => {
      const key = `${cookie.domain}:${cookie.name}`;
      initialMap.set(key, cookie);
    });

    finalCookies.forEach(cookie => {
      const key = `${cookie.domain}:${cookie.name}`;
      finalMap.set(key, cookie);
    });

    // 새로운 쿠키와 수정된 쿠키 찾기
    for (const [key, finalCookie] of finalMap) {
      if (!initialMap.has(key)) {
        // 새로운 쿠키
        comparison.newCookies.push({
          domain: finalCookie.domain,
          name: finalCookie.name,
          value: finalCookie.value.substring(0, 20) + '...',
          httpOnly: finalCookie.httpOnly,
          secure: finalCookie.secure,
          sameSite: finalCookie.sameSite,
          expires: finalCookie.expires
        });
      } else {
        // 기존 쿠키와 비교
        const initialCookie = initialMap.get(key);
        if (this.cookieChanged(initialCookie, finalCookie)) {
          comparison.modifiedCookies.push({
            domain: finalCookie.domain,
            name: finalCookie.name,
            changes: this.getChanges(initialCookie, finalCookie)
          });
        } else {
          comparison.unchangedCookies.push({
            domain: finalCookie.domain,
            name: finalCookie.name
          });
        }
      }
    }

    // 삭제된 쿠키 찾기
    for (const [key, initialCookie] of initialMap) {
      if (!finalMap.has(key)) {
        comparison.deletedCookies.push({
          domain: initialCookie.domain,
          name: initialCookie.name
        });
      }
    }

    await fs.writeFile(this.comparisonFile, JSON.stringify(comparison, null, 2));
    return comparison;
  }

  getDomains(cookies) {
    const domains = new Set();
    cookies.forEach(cookie => domains.add(cookie.domain));
    return Array.from(domains).sort();
  }

  cookieChanged(cookie1, cookie2) {
    // expires 변경은 무시하고 value 변경만 체크
    return cookie1.value !== cookie2.value;
  }

  getChanges(initial, final) {
    const changes = [];
    if (initial.value !== final.value) {
      const oldValue = initial.value ? initial.value.substring(0, 40) + '...' : '(빈 값)';
      const newValue = final.value ? final.value.substring(0, 40) + '...' : '(빈 값)';
      const oldLen = initial.value ? initial.value.length : 0;
      const newLen = final.value ? final.value.length : 0;
      changes.push(`${oldValue} (${oldLen}자) → ${newValue} (${newLen}자)`);
    }
    return changes;
  }

  printComparison(comparison) {
    console.log('\n📊 쿠키 변화 분석 리포트');
    console.log('========================');
    console.log(`초기 쿠키: ${comparison.initial.count}개`);
    console.log(`최종 쿠키: ${comparison.final.count}개`);
    console.log(`변화: ${comparison.final.count - comparison.initial.count}개\n`);

    if (comparison.newCookies.length > 0) {
      console.log(`🆕 새로운 쿠키 (${comparison.newCookies.length}개):`);
      
      // 쿠팡 도메인 쿠키만 표시
      const coupangCookies = comparison.newCookies.filter(c => 
        c.domain.includes('coupang.com')
      );
      
      if (coupangCookies.length > 0) {
        console.log('\n  [쿠팡 쿠키]');
        coupangCookies.forEach(cookie => {
          const valuePreview = cookie.value ? cookie.value.substring(0, 40) + '...' : '(빈 값)';
          const valueLen = cookie.value ? cookie.value.length : 0;
          console.log(`  ${cookie.name}: ${valuePreview} (${valueLen}자)`);
        });
      }
      
      // 외부 광고 쿠키 수 표시
      const adCookies = comparison.newCookies.filter(c => 
        !c.domain.includes('coupang.com')
      );
      
      if (adCookies.length > 0) {
        console.log(`\n  [외부 광고/추적 쿠키]: ${adCookies.length}개`);
        const adDomains = [...new Set(adCookies.map(c => c.domain))];
        console.log(`  도메인: ${adDomains.slice(0, 5).join(', ')}${adDomains.length > 5 ? ` 외 ${adDomains.length - 5}개` : ''}`);
      }
      console.log('');
    }

    if (comparison.modifiedCookies.length > 0 || comparison.unchangedCookies.length > 0) {
      console.log(`\n📝 쿠팡 쿠키 상태:`);
      
      // 변경된 쿠키
      if (comparison.modifiedCookies.length > 0) {
        console.log('\n  [값이 변경된 쿠키]');
        comparison.modifiedCookies.filter(c => c.domain.includes('coupang.com')).forEach(cookie => {
          console.log(`  ✏️ ${cookie.name}:`);
          cookie.changes.forEach(change => console.log(`     ${change}`));
        });
      }
      
      // 변경되지 않은 쿠키 
      const unchangedCoupang = comparison.unchangedCookies.filter(c => c.domain.includes('coupang.com'));
      if (unchangedCoupang.length > 0) {
        console.log('\n  [변경되지 않은 쿠키]');
        unchangedCoupang.forEach(cookie => {
          console.log(`  ✅ ${cookie.name}`);
        });
      }
      console.log('');
    }

    if (comparison.deletedCookies.length > 0) {
      console.log(`🗑️ 삭제된 쿠키 (${comparison.deletedCookies.length}개):`);
      comparison.deletedCookies.forEach(cookie => {
        console.log(`  - ${cookie.domain} | ${cookie.name}`);
      });
      console.log('');
    }

    console.log(`♻️ 변경 없는 쿠키: ${comparison.unchangedCookies.length}개`);

    // 도메인별 통계 간략화
    console.log('\n🌐 도메인별 쿠키:');
    const coupangDomains = comparison.final.domains.filter(d => d.includes('coupang.com'));
    const adDomains = comparison.final.domains.filter(d => !d.includes('coupang.com'));
    
    console.log(`쿠팡 도메인: ${coupangDomains.length}개`);
    console.log(`광고/추적 도메인: ${adDomains.length}개`);

    console.log(`\n✅ 쿠키 비교 결과 저장됨: ${this.comparisonFile}`);
  }
}

module.exports = new CookieTracker();