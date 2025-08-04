const fs = require('fs');
const path = require('path');

class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.configPath = path.join(process.cwd(), 'config', 'proxies.json');
    this.loadProxies();
  }

  loadProxies() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(data);
        this.proxies = config.proxies.filter(p => p.active !== false);
        console.log(`📋 ${this.proxies.length}개의 활성 프록시 로드됨`);
      } else {
        console.log('⚠️ proxies.json 파일이 없습니다. 프록시 없이 실행됩니다.');
      }
    } catch (error) {
      console.error('❌ 프록시 설정 로드 실패:', error.message);
    }
  }

  /**
   * 프록시 선택
   * @param {string} mode - 'sequential', 'random', 'none', 또는 특정 프록시 ID
   * @returns {Object|null} 선택된 프록시 또는 null
   */
  selectProxy(mode = 'none') {
    if (mode === 'none' || this.proxies.length === 0) {
      return null;
    }

    if (mode === 'sequential') {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      return proxy;
    }

    if (mode === 'random') {
      const randomIndex = Math.floor(Math.random() * this.proxies.length);
      return this.proxies[randomIndex];
    }

    // 특정 프록시 ID로 선택
    const specificProxy = this.proxies.find(p => p.id === mode);
    if (specificProxy) {
      return specificProxy;
    }

    console.log(`⚠️ 프록시 모드 '${mode}'를 찾을 수 없습니다. 프록시 없이 실행됩니다.`);
    return null;
  }

  /**
   * 사용 가능한 프록시 목록 반환
   */
  getAvailableProxies() {
    return this.proxies.map(p => ({
      id: p.id,
      name: p.name,
      server: p.server
    }));
  }

  /**
   * 프록시 상태 출력
   */
  printProxyStatus() {
    console.log('\n📊 프록시 상태:');
    this.proxies.forEach((proxy, index) => {
      console.log(`  ${index + 1}. ${proxy.name} (${proxy.id}): ${proxy.server}`);
    });
    console.log('');
  }
}

// 싱글톤 인스턴스
const proxyManager = new ProxyManager();

module.exports = proxyManager;