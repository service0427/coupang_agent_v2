/**
 * 간소화된 트래픽 모니터링 모듈
 * - --monitor 옵션으로 실시간 로그만 출력
 * - v2_execution_logs에 트래픽 데이터 저장
 * - 4개 도메인 최적화 효과 추적
 */

const NetworkMonitor = require('../network/monitor');
const NetworkAnalyzer = require('../network/analyzer');

class TrafficMonitor {
  constructor(options = {}) {
    this.keywordId = options.keywordId || null;
    this.agent = options.agent || null;
    this.keyword = options.keyword || '';
    this.monitorMode = options.monitor || false; // --monitor 옵션
    
    this.monitor = new NetworkMonitor();
    this.analyzer = new NetworkAnalyzer();
    this.isActive = false;
    
    this.logPrefix = this._createLogPrefix();
  }

  _createLogPrefix() {
    if (this.agent && this.keywordId) {
      return `[${this.agent}:${this.keywordId}]`;
    } else if (this.keywordId) {
      return `[ID:${this.keywordId}]`;
    } else if (this.agent) {
      return `[${this.agent}]`;
    }
    return '[Traffic]';
  }

  /**
   * 트래픽 모니터링 시작
   */
  async start(page) {
    if (this.isActive) return;
    
    this.isActive = true;
    await this.monitor.start(page);
    
    if (this.monitorMode) {
      console.log(`${this.logPrefix} 📡 실시간 트래픽 모니터링 시작`);
    }
  }

  /**
   * 트래픽 모니터링 중지 및 데이터 저장
   */
  async stop() {
    if (!this.isActive) return null;
    
    this.isActive = false;
    await this.monitor.stop();
    
    const networkData = this.monitor.getData();
    const analysisResult = this.analyzer.analyze(networkData);
    
    // --monitor 모드일 때만 실시간 요약 출력
    if (this.monitorMode) {
      this._printMonitorSummary(analysisResult);
    }
    
    // v2_execution_logs 업데이트용 데이터 준비
    const trafficData = this._prepareTrafficData(analysisResult);
    
    return {
      analysisResult,
      trafficData
    };
  }

  /**
   * --monitor 모드용 실시간 요약 출력
   */
  _printMonitorSummary(analysisResult) {
    const { summary, cacheStats } = analysisResult;
    const totalMB = parseFloat(summary.totalSizeInMB);
    const targetMB = 0.5; // 500KB 목표
    const achievementRate = Math.min(100, ((targetMB / totalMB) * 100)).toFixed(0);
    
    console.log(`${this.logPrefix} 📊 트래픽: ${totalMB}MB/${targetMB * 1000}KB (목표 대비 ${achievementRate}%)`);
    
    if (cacheStats && cacheStats.fromCache > 0) {
      console.log(`${this.logPrefix} 💾 캐시: ${cacheStats.cacheHitRate}% (${cacheStats.fromCache}개)`);
    }
    
    // 효율성 점수
    const score = this._calculateEfficiencyScore(analysisResult);
    console.log(`${this.logPrefix} ⚡ 효율성: ${score}/100점`);
  }

  /**
   * v2_execution_logs 저장용 트래픽 데이터 준비
   */
  _prepareTrafficData(analysisResult) {
    const { summary, cacheStats, domains } = analysisResult;
    
    // 4개 도메인별 트래픽 분리
    const domainTraffic = this._splitDomainTraffic(domains);
    
    return {
      total_traffic_mb: parseFloat(summary.totalSizeInMB),
      cache_hit_rate: cacheStats ? parseFloat(cacheStats.cacheHitRate) || 0 : 0,
      mercury_traffic_mb: domainTraffic.mercury || 0,
      image_cdn_traffic_mb: domainTraffic.image_cdn || 0,
      img1a_cdn_traffic_mb: domainTraffic.img1a_cdn || 0,
      thumbnail_cdn_traffic_mb: domainTraffic.thumbnail_cdn || 0,
      optimization_effectiveness: this._calculateEfficiencyScore(analysisResult)
    };
  }

  /**
   * 4개 도메인별 트래픽 분리
   */
  _splitDomainTraffic(domains) {
    const traffic = {};
    
    domains.forEach(domain => {
      const domainName = domain.domain;
      const sizeInMB = domain.size / 1024 / 1024;
      
      if (domainName.includes('mercury.coupang.com')) {
        traffic.mercury = sizeInMB;
      } else if (domainName.includes('image') && domainName.includes('coupangcdn.com')) {
        traffic.image_cdn = (traffic.image_cdn || 0) + sizeInMB;
      } else if (domainName.includes('img1a.coupangcdn.com')) {
        traffic.img1a_cdn = sizeInMB;
      } else if (domainName.includes('thumbnail') && domainName.includes('coupangcdn.com')) {
        traffic.thumbnail_cdn = (traffic.thumbnail_cdn || 0) + sizeInMB;
      }
    });
    
    return traffic;
  }

  /**
   * 효율성 점수 계산 (0-100)
   */
  _calculateEfficiencyScore(analysisResult) {
    const { summary, cacheStats } = analysisResult;
    let score = 50; // 기본 점수
    
    // 트래픽 크기 점수 (50점)
    const sizeInMB = parseFloat(summary.totalSizeInMB);
    if (sizeInMB <= 0.3) score += 40;      // 300KB 이하: 최고점
    else if (sizeInMB <= 0.5) score += 35; // 500KB 이하: 우수
    else if (sizeInMB <= 1.0) score += 25; // 1MB 이하: 양호
    else if (sizeInMB <= 2.0) score += 15; // 2MB 이하: 보통
    else score += 5; // 2MB 초과: 낮음
    
    // 캐시 효율성 점수 (10점)
    if (cacheStats) {
      const cacheHitRate = parseFloat(cacheStats.cacheHitRate || 0);
      score += Math.min(10, cacheHitRate * 0.1);
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * 리소스 정리
   */
  async cleanup() {
    if (this.isActive) {
      await this.stop();
    }
    this.monitor.reset();
  }
}

module.exports = TrafficMonitor;