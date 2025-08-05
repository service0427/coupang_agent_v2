/**
 * 네트워크 트래픽 분석 모듈
 * - 수집된 네트워크 데이터 분석
 * - 트래픽 감소를 위한 인사이트 제공
 */

const fs = require('fs').promises;
const path = require('path');

class NetworkAnalyzer {
  constructor() {
    this.analysisResults = null;
  }

  /**
   * 네트워크 데이터 분석
   */
  analyze(networkData) {
    const { duration, totalRequests, totalSize, domains, resourceTypes, protocols, requests, cacheStats } = networkData;

    // 도메인별 정렬 (크기 기준)
    const sortedDomains = Array.from(domains.entries())
      .map(([domain, stats]) => ({
        domain,
        count: stats.count,
        size: stats.size,
        percentage: (stats.size / totalSize * 100).toFixed(2),
        types: Array.from(stats.types.entries()).map(([type, typeStats]) => ({
          type,
          count: typeStats.count,
          size: typeStats.size
        }))
      }))
      .sort((a, b) => b.size - a.size);

    // 리소스 타입별 정렬
    const sortedResourceTypes = Array.from(resourceTypes.entries())
      .map(([type, stats]) => ({
        type,
        count: stats.count,
        size: stats.size,
        percentage: (stats.size / totalSize * 100).toFixed(2)
      }))
      .sort((a, b) => b.size - a.size);

    // 프로토콜별 통계
    const protocolStats = Array.from(protocols.entries())
      .map(([protocol, stats]) => ({
        protocol,
        count: stats.count,
        size: stats.size,
        percentage: (stats.count / totalRequests * 100).toFixed(2)
      }));

    // 대용량 리소스 찾기 (1MB 이상)
    const largeResources = requests
      .filter(req => req.size > 1024 * 1024)
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(req => ({
        url: req.url,
        domain: req.domain,
        type: req.type,
        size: req.size,
        sizeInMB: (req.size / 1024 / 1024).toFixed(2)
      }));

    // 트래픽 감소 권장사항 생성
    const recommendations = this.generateRecommendations(sortedDomains, sortedResourceTypes, largeResources);

    this.analysisResults = {
      summary: {
        duration: duration.toFixed(2),
        totalRequests,
        totalSize,
        totalSizeInMB: (totalSize / 1024 / 1024).toFixed(2),
        avgRequestSize: Math.round(totalSize / totalRequests),
        requestsPerSecond: (totalRequests / duration).toFixed(2)
      },
      domains: sortedDomains.slice(0, 10), // 상위 10개 도메인
      allDomains: domains, // 전체 도메인 Map 객체
      resourceTypes: sortedResourceTypes,
      protocols: protocolStats,
      largeResources,
      cacheStats: cacheStats || null, // 캐시 통계 추가
      recommendations,
      requests: requests, // 전체 요청 목록 추가
      timestamp: new Date().toISOString()
    };

    return this.analysisResults;
  }

  /**
   * 트래픽 감소 권장사항 생성
   */
  generateRecommendations(domains, resourceTypes, largeResources) {
    const recommendations = [];
    const { cacheStats } = this.analysisResults || {};

    // 이미지 최적화 권장
    const imageStats = resourceTypes.find(r => r.type === 'image');
    if (imageStats && parseFloat(imageStats.percentage) > 30) {
      recommendations.push({
        type: 'IMAGE_OPTIMIZATION',
        priority: 'HIGH',
        message: `이미지가 전체 트래픽의 ${imageStats.percentage}%를 차지합니다. 이미지 차단이나 최적화를 고려하세요.`,
        savingPotential: `${(imageStats.size / 1024 / 1024).toFixed(2)} MB`
      });
    }

    // 광고/추적 도메인 차단 권장
    const adDomains = ['doubleclick', 'google-analytics', 'googletagmanager', 'facebook', 'criteo'];
    const blockableDomains = domains.filter(d => 
      adDomains.some(ad => d.domain.includes(ad))
    );
    
    if (blockableDomains.length > 0) {
      const totalBlockableSize = blockableDomains.reduce((sum, d) => sum + d.size, 0);
      recommendations.push({
        type: 'AD_BLOCKING',
        priority: 'MEDIUM',
        message: `광고/추적 관련 도메인 ${blockableDomains.length}개를 차단할 수 있습니다.`,
        domains: blockableDomains.map(d => d.domain),
        savingPotential: `${(totalBlockableSize / 1024 / 1024).toFixed(2)} MB`
      });
    }

    // 대용량 리소스 최적화 권장
    if (largeResources.length > 0) {
      recommendations.push({
        type: 'LARGE_RESOURCE_OPTIMIZATION',
        priority: 'HIGH',
        message: `1MB 이상의 대용량 리소스가 ${largeResources.length}개 발견되었습니다.`,
        resources: largeResources.slice(0, 3).map(r => `${r.domain} (${r.sizeInMB} MB)`),
        savingPotential: `${largeResources.reduce((sum, r) => sum + r.size, 0) / 1024 / 1024} MB`
      });
    }

    // 폰트 최적화 권장
    const fontStats = resourceTypes.find(r => r.type === 'font');
    if (fontStats && fontStats.count > 5) {
      recommendations.push({
        type: 'FONT_OPTIMIZATION',
        priority: 'LOW',
        message: `폰트 파일 ${fontStats.count}개가 로드됩니다. 필수 폰트만 로드하도록 최적화하세요.`,
        savingPotential: `${(fontStats.size / 1024 / 1024).toFixed(2)} MB`
      });
    }

    // HTTP/2 활용도
    const http2Stats = domains.filter(d => d.protocol === 'HTTP/2');
    if (http2Stats.length < domains.length * 0.5) {
      recommendations.push({
        type: 'PROTOCOL_OPTIMIZATION',
        priority: 'LOW',
        message: 'HTTP/2 프로토콜 사용률이 낮습니다. 더 나은 성능을 위해 HTTP/2 지원 확인이 필요합니다.'
      });
    }

    // 캐시 최적화 권장사항
    if (cacheStats) {
      const cacheHitRate = parseFloat(cacheStats.cacheHitRate || 0);
      
      // 전체 캐시 히트율이 낮은 경우
      if (cacheHitRate < 30) {
        recommendations.push({
          type: 'CACHE_OPTIMIZATION',
          priority: 'HIGH',
          message: `캐시 히트율이 ${cacheHitRate}%로 낮습니다. 브라우저 캐시 활용도를 높여 트래픽을 줄일 수 있습니다.`,
          savingPotential: `최대 ${((1 - cacheHitRate/100) * 0.7 * 100).toFixed(0)}% 트래픽 감소 가능`
        });
      }

      // 특정 리소스 타입의 캐시 활용도 낮은 경우
      if (cacheStats.byType) {
        cacheStats.byType.forEach(typeStats => {
          if (typeStats.total > 10 && parseFloat(typeStats.hitRate) < 20) {
            recommendations.push({
              type: 'CACHE_BY_TYPE',
              priority: 'MEDIUM',
              message: `${typeStats.type} 리소스의 캐시 히트율이 ${typeStats.hitRate}%로 매우 낮습니다.`,
              detail: `${typeStats.type} 타입: ${typeStats.cached}/${typeStats.total}개 캐시됨`
            });
          }
        });
      }
    }

    return recommendations;
  }

  /**
   * 콘솔에 분석 결과 출력 (요약)
   */
  printAnalysis() {
    if (!this.analysisResults) return;

    const { summary, domains, resourceTypes, protocols, largeResources, recommendations } = this.analysisResults;

    console.log('\n' + '='.repeat(80));
    console.log('📊 네트워크 트래픽 분석 결과 (요약)');
    console.log('='.repeat(80));

    // 요약 정보
    console.log('\n📈 요약:');
    console.log(`   총 요청 수: ${summary.totalRequests}개`);
    console.log(`   총 데이터 크기: ${summary.totalSizeInMB} MB`);
    console.log(`   평균 요청 크기: ${(summary.avgRequestSize / 1024).toFixed(2)} KB`);
    console.log(`   초당 요청 수: ${summary.requestsPerSecond}`);
    console.log(`   분석 시간: ${summary.duration}초`);

    // 상위 도메인
    console.log('\n🌐 상위 도메인 (데이터 사용량 기준):');
    domains.slice(0, 10).forEach((domain, index) => {
      console.log(`   ${index + 1}. ${domain.domain}`);
      console.log(`      요청: ${domain.count}개, 크기: ${(domain.size / 1024 / 1024).toFixed(2)} MB (${domain.percentage}%)`);
      // 도메인별 주요 리소스 타입 표시
      const topTypes = domain.types.sort((a, b) => b.size - a.size).slice(0, 3);
      topTypes.forEach(type => {
        console.log(`        - ${type.type}: ${type.count}개, ${(type.size / 1024 / 1024).toFixed(2)} MB`);
      });
    });

    // 리소스 타입별 분포
    console.log('\n📁 리소스 타입별 분포:');
    resourceTypes.forEach(type => {
      const sizeInMB = (type.size / 1024 / 1024).toFixed(2);
      console.log(`   ${type.type}: ${type.count}개, ${sizeInMB} MB (${type.percentage}%)`);
    });

    // 프로토콜 사용 현황
    console.log('\n🔐 프로토콜 사용 현황:');
    protocols.forEach(proto => {
      console.log(`   ${proto.protocol}: ${proto.count}개 (${proto.percentage}%)`);
    });

    // 캐시 통계
    if (this.analysisResults.cacheStats) {
      const { cacheStats, requests } = this.analysisResults;
      console.log('\n💾 캐시 사용 현황:');
      console.log(`   전체 요청: ${cacheStats.total}개`);
      console.log(`   캐시 히트: ${cacheStats.fromCache}개 (${cacheStats.cacheHitRate}%)`);
      console.log(`   네트워크: ${cacheStats.fromNetwork}개`);
      
      // 캐시된 데이터 크기 계산
      const cachedRequests = requests.filter(req => req.fromCache);
      const cachedSize = cachedRequests.reduce((sum, req) => sum + (req.size || 0), 0);
      console.log(`   캐시된 데이터: ${(cachedSize / 1024 / 1024).toFixed(2)} MB`);
      
      if (cacheStats.byType && cacheStats.byType.length > 0) {
        console.log('\n   리소스 타입별 캐시 히트율:');
        cacheStats.byType
          .sort((a, b) => b.total - a.total)
          .forEach(type => {
            console.log(`   - ${type.type}: ${type.cached}/${type.total} (${type.hitRate}%)`);
          });
      }
      
      // 캐시 효율성 평가
      if (cacheStats.fromCache > 0) {
        const cacheEfficiency = (cachedSize / 1024 / 1024).toFixed(2);
        console.log(`\n   💡 캐시 효율성: ${cacheEfficiency} MB의 네트워크 트래픽 절감`);
      }
    }

    // 대용량 리소스
    if (largeResources.length > 0) {
      console.log('\n⚠️  대용량 리소스 (1MB 이상):');
      largeResources.slice(0, 3).forEach((resource, index) => {
        console.log(`   ${index + 1}. ${resource.domain} - ${resource.type}`);
        console.log(`      크기: ${resource.sizeInMB} MB`);
      });
    }

    // 권장사항
    if (recommendations.length > 0) {
      console.log('\n💡 트래픽 감소 권장사항:');
      recommendations.forEach((rec, index) => {
        console.log(`\n   ${index + 1}. [${rec.priority}] ${rec.type}`);
        console.log(`      ${rec.message}`);
        if (rec.savingPotential) {
          console.log(`      예상 절감량: ${rec.savingPotential}`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * 콘솔에 상세 분석 결과 출력
   */
  printDetailedAnalysis() {
    if (!this.analysisResults) return;

    const { requests, allDomains } = this.analysisResults;

    // 간단한 요약 정보만 출력
    const { summary, cacheStats } = this.analysisResults;
    console.log(`\n📊 네트워크 요약: ${summary.totalRequests}개 요청, ${(summary.totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // 캐시 정보가 있으면 출력
    if (cacheStats && cacheStats.fromCache > 0) {
      const cacheRate = ((cacheStats.fromCache / summary.totalRequests) * 100).toFixed(1);
      console.log(`💾 캐시 히트: ${cacheStats.fromCache}개 (${cacheRate}%)`);
    }
  }

  /**
   * 분석 결과를 JSON 파일로 저장
   */
  async saveReport(keywordId, agent) {
    if (!this.analysisResults) return;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hourStr = now.getHours().toString().padStart(2, '0'); // HH
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `network-analysis-${agent}-${keywordId}-${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'reports', dateStr, hourStr, filename);

    try {
      // reports/날짜/시간 디렉토리 생성
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      
      // JSON 파일 저장
      await fs.writeFile(filepath, JSON.stringify(this.analysisResults, null, 2));
      console.log(`\n📄 JSON 리포트 저장됨: ${filepath}`);
    } catch (error) {
      console.error('리포트 저장 실패:', error.message);
    }
  }

  /**
   * 캐시 분석 리포트를 별도 파일로 저장
   */
  async saveCacheReport(keywordId, agent) {
    if (!this.analysisResults || !this.analysisResults.cacheStats) return;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hourStr = now.getHours().toString().padStart(2, '0'); // HH
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `cache-analysis-${agent}-${keywordId}-${timestamp}.txt`;
    const filepath = path.join(process.cwd(), 'reports', dateStr, hourStr, filename);

    try {
      // reports 디렉토리 생성
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      
      const { requests, cacheStats, summary } = this.analysisResults;
      
      // 캐시된 요청만 필터링
      const cachedRequests = requests.filter(req => req.fromCache);
      
      // 캐시된 요청을 도메인별로 그룹화
      const cachedByDomain = new Map();
      cachedRequests.forEach(req => {
        if (!cachedByDomain.has(req.domain)) {
          cachedByDomain.set(req.domain, {
            requests: [],
            totalSize: 0,
            count: 0,
            types: new Map()
          });
        }
        const domainData = cachedByDomain.get(req.domain);
        domainData.requests.push(req);
        domainData.totalSize += req.size || 0;
        domainData.count++;
        
        // 타입별 통계
        if (!domainData.types.has(req.type)) {
          domainData.types.set(req.type, { count: 0, size: 0 });
        }
        const typeData = domainData.types.get(req.type);
        typeData.count++;
        typeData.size += req.size || 0;
      });

      // 리포트 내용 생성
      let content = '캐시 분석 상세 리포트\n';
      content += '=' .repeat(80) + '\n';
      content += `생성 시각: ${new Date().toISOString()}\n`;
      content += `에이전트: ${agent}\n`;
      content += `키워드 ID: ${keywordId}\n`;
      content += '=' .repeat(80) + '\n\n';

      // 캐시 요약 통계
      content += '📊 캐시 요약 통계\n';
      content += '-'.repeat(40) + '\n';
      content += `전체 요청 수: ${cacheStats.total}개\n`;
      content += `캐시 히트: ${cacheStats.fromCache}개 (${cacheStats.cacheHitRate}%)\n`;
      content += `네트워크 요청: ${cacheStats.fromNetwork}개\n`;
      content += `캐시된 데이터 크기: ${(cachedRequests.reduce((sum, req) => sum + (req.size || 0), 0) / 1024 / 1024).toFixed(2)} MB\n\n`;

      // 리소스 타입별 캐시 통계
      content += '📁 리소스 타입별 캐시 통계\n';
      content += '-'.repeat(40) + '\n';
      if (cacheStats.byType && cacheStats.byType.length > 0) {
        cacheStats.byType
          .sort((a, b) => b.cached - a.cached)
          .forEach(type => {
            content += `${type.type.padEnd(15)} | ${type.cached.toString().padStart(4)}/${type.total.toString().padStart(4)} | ${type.hitRate.padStart(6)}%\n`;
          });
      }
      content += '\n';

      // 도메인별 캐시된 리소스
      content += '🌐 도메인별 캐시된 리소스\n';
      content += '=' .repeat(80) + '\n';
      
      // 크기순으로 정렬
      const sortedDomains = Array.from(cachedByDomain.entries())
        .sort((a, b) => b[1].totalSize - a[1].totalSize);

      sortedDomains.forEach(([domain, data], index) => {
        content += `\n${index + 1}. ${domain}\n`;
        content += `   캐시된 요청: ${data.count}개, 총 크기: ${(data.totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        
        // 타입별 분포
        const types = Array.from(data.types.entries())
          .sort((a, b) => b[1].size - a[1].size);
        content += '   타입별 분포:\n';
        types.forEach(([type, stats]) => {
          content += `     - ${type}: ${stats.count}개, ${(stats.size / 1024).toFixed(2)} KB\n`;
        });
        
        content += '-'.repeat(80) + '\n';
        
        // 요청 목록 (크기순)
        const sortedRequests = data.requests.sort((a, b) => (b.size || 0) - (a.size || 0));
        sortedRequests.forEach(req => {
          const sizeStr = req.size > 1024 * 1024 
            ? `${(req.size / 1024 / 1024).toFixed(2)} MB`
            : `${(req.size / 1024).toFixed(2)} KB`;
          const cacheType = req.cacheType || 'unknown';
          content += `   [${req.type.padEnd(10)}] ${sizeStr.padStart(10)} | ${cacheType.padEnd(15)} | ${req.status} | ${req.url}\n`;
        });
      });

      // 캐시되지 않은 대용량 리소스 (최적화 기회)
      const uncachedLargeResources = requests
        .filter(req => !req.fromCache && req.size > 50 * 1024) // 50KB 이상
        .sort((a, b) => b.size - a.size)
        .slice(0, 20);

      if (uncachedLargeResources.length > 0) {
        content += '\n\n⚠️  캐시되지 않은 대용량 리소스 (최적화 기회)\n';
        content += '=' .repeat(80) + '\n';
        uncachedLargeResources.forEach((req, index) => {
          const sizeStr = req.size > 1024 * 1024 
            ? `${(req.size / 1024 / 1024).toFixed(2)} MB`
            : `${(req.size / 1024).toFixed(2)} KB`;
          content += `${(index + 1).toString().padStart(3)}. [${req.type.padEnd(10)}] ${sizeStr.padStart(10)} | ${req.domain} | ${req.url}\n`;
        });
      }

      // 파일 저장
      await fs.writeFile(filepath, content, 'utf8');
      console.log(`📄 캐시 분석 리포트 저장됨: ${filepath}`);

      // 캐시된 URL 목록만 JSON으로 저장
      const cacheListFilename = `cache-urls-${agent}-${keywordId}-${timestamp}.json`;
      const cacheListPath = path.join(process.cwd(), 'reports', dateStr, hourStr, cacheListFilename);
      
      const cacheUrlData = {
        timestamp: new Date().toISOString(),
        agent,
        keywordId,
        stats: cacheStats,
        cachedUrls: cachedRequests.map(req => ({
          url: req.url,
          domain: req.domain,
          type: req.type,
          size: req.size,
          cacheType: req.cacheType,
          status: req.status
        }))
      };
      
      await fs.writeFile(cacheListPath, JSON.stringify(cacheUrlData, null, 2));
      console.log(`📄 캐시 URL 목록 저장됨: ${cacheListPath}`);
      
    } catch (error) {
      console.error('캐시 리포트 저장 실패:', error.message);
    }
  }

  /**
   * 상세 분석 결과를 텍스트 파일로 저장
   */
  async saveDetailedReport(keywordId, agent) {
    if (!this.analysisResults) return;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hourStr = now.getHours().toString().padStart(2, '0'); // HH
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `network-detailed-${agent}-${keywordId}-${timestamp}.txt`;
    const filepath = path.join(process.cwd(), 'reports', dateStr, hourStr, filename);

    try {
      // reports 디렉토리 생성
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      
      // 상세 리포트 내용 생성
      let content = '네트워크 트래픽 상세 분석 리포트\n';
      content += '=' .repeat(80) + '\n';
      content += `생성 시각: ${new Date().toISOString()}\n`;
      content += `에이전트: ${agent}\n`;
      content += `키워드 ID: ${keywordId}\n`;
      content += '=' .repeat(80) + '\n\n';

      // 요약 정보
      const { summary, requests, allDomains, cacheStats } = this.analysisResults;
      content += '📊 요약 정보\n';
      content += '-'.repeat(40) + '\n';
      content += `총 요청 수: ${summary.totalRequests}개\n`;
      content += `총 데이터 크기: ${summary.totalSizeInMB} MB\n`;
      content += `평균 요청 크기: ${(summary.avgRequestSize / 1024).toFixed(2)} KB\n`;
      content += `분석 시간: ${summary.duration}초\n`;
      
      // 캐시 통계 추가
      if (cacheStats) {
        content += `\n캐시 사용 현황:\n`;
        content += `  - 캐시 히트: ${cacheStats.fromCache}개 (${cacheStats.cacheHitRate}%)\n`;
        content += `  - 네트워크: ${cacheStats.fromNetwork}개\n`;
      }
      content += '\n';

      // 도메인별 상세 요청 목록
      content += '🌐 도메인별 상세 요청 목록\n';
      content += '=' .repeat(80) + '\n';
      
      // 도메인별로 요청 그룹화
      const domainRequests = new Map();
      requests.forEach(req => {
        if (!domainRequests.has(req.domain)) {
          domainRequests.set(req.domain, []);
        }
        domainRequests.get(req.domain).push(req);
      });

      // 크기순으로 정렬된 도메인
      const sortedDomains = Array.from(allDomains.entries())
        .sort((a, b) => b[1].size - a[1].size);

      sortedDomains.forEach(([domain, stats], index) => {
        content += `\n${index + 1}. ${domain}\n`;
        content += `   총 요청: ${stats.count}개, 총 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`;
        content += '-'.repeat(80) + '\n';
        
        const reqs = domainRequests.get(domain) || [];
        const sortedReqs = reqs.sort((a, b) => b.size - a.size);
        
        sortedReqs.forEach(req => {
          const sizeStr = req.size > 1024 * 1024 
            ? `${(req.size / 1024 / 1024).toFixed(2)} MB`
            : `${(req.size / 1024).toFixed(2)} KB`;
          content += `   [${req.type}] ${sizeStr.padStart(10)} - ${req.url}\n`;
        });
      });

      // 전체 요청 목록 (크기 순)
      content += '\n\n📋 전체 요청 목록 (크기 순)\n';
      content += '=' .repeat(80) + '\n';
      
      const sortedRequests = requests
        .filter(req => req.size > 0)
        .sort((a, b) => b.size - a.size);

      sortedRequests.forEach((req, index) => {
        const sizeStr = req.size > 1024 * 1024 
          ? `${(req.size / 1024 / 1024).toFixed(2)} MB`
          : `${(req.size / 1024).toFixed(2)} KB`;
        const cacheStr = req.fromCache ? '[CACHE]' : '[NET]';
        content += `${(index + 1).toString().padStart(4)}. [${req.type.padEnd(10)}] ${sizeStr.padStart(10)} ${cacheStr} | ${req.status} | ${req.domain} | ${req.url}\n`;
      });

      // 파일 저장
      await fs.writeFile(filepath, content, 'utf8');
      console.log(`📄 상세 텍스트 리포트 저장됨: ${filepath}`);
    } catch (error) {
      console.error('상세 리포트 저장 실패:', error.message);
    }
  }
}

module.exports = NetworkAnalyzer;