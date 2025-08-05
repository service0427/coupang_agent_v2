/**
 * 차단 리소스 분석 모듈
 * - 최적화로 인해 차단된 리소스 분석
 * - 캐시와 구분하여 실제 차단 효과 측정
 */

const fs = require('fs').promises;
const path = require('path');

class BlockAnalyzer {
  constructor() {
    this.blockResults = null;
  }

  /**
   * 차단 데이터 분석
   */
  analyze(blockStats, blockedDomains, networkData) {
    if (!blockStats || !networkData) {
      return null;
    }

    // 전체 네트워크 요청에서 캐시된 요청 제외
    const actualNetworkRequests = networkData.requests.filter(req => !req.fromCache);
    const totalNetworkRequests = actualNetworkRequests.length;
    const totalNetworkSize = actualNetworkRequests.reduce((sum, req) => sum + (req.size || 0), 0);

    // 차단된 리소스 수
    const totalBlocked = Object.values(blockStats)
      .reduce((sum, stat) => sum + stat.count, 0);

    // 차단률 계산
    const blockRate = totalNetworkRequests > 0 
      ? ((totalBlocked / (totalBlocked + totalNetworkRequests)) * 100).toFixed(2)
      : 0;

    // 도메인별 차단 상세
    const domainDetails = Array.from(blockedDomains.entries())
      .map(([domain, stats]) => ({
        domain,
        count: stats.count,
        types: Array.from(stats.types)
      }))
      .sort((a, b) => b.count - a.count);

    this.blockResults = {
      summary: {
        totalBlocked,
        totalNetworkRequests,
        totalRequests: totalBlocked + totalNetworkRequests,
        blockRate,
        totalNetworkSize,
        totalNetworkSizeMB: (totalNetworkSize / 1024 / 1024).toFixed(2)
      },
      byCategory: blockStats,
      byDomain: domainDetails,
      timestamp: new Date().toISOString()
    };

    return this.blockResults;
  }

  /**
   * 차단 분석 결과 출력
   */
  printAnalysis() {
    if (!this.blockResults) return;

    const { summary, byCategory, byDomain } = this.blockResults;

    console.log('\n' + '='.repeat(80));
    console.log('🚫 리소스 차단 분석 결과');
    console.log('='.repeat(80));

    // 요약
    console.log('\n📊 차단 요약:');
    console.log(`   총 요청: ${summary.totalRequests}개 (차단: ${summary.totalBlocked}개, 허용: ${summary.totalNetworkRequests}개)`);
    console.log(`   차단률: ${summary.blockRate}%`);
    console.log(`   네트워크 트래픽: ${summary.totalNetworkSizeMB} MB (캐시 제외)`);

    // 카테고리별 차단
    console.log('\n📈 카테고리별 차단 현황:');
    Object.entries(byCategory).forEach(([category, stats]) => {
      if (stats.count > 0) {
        console.log(`   ${category}: ${stats.count}개`);
      }
    });

    // 도메인별 차단 (상위 10개)
    if (byDomain.length > 0) {
      console.log('\n🌐 차단된 도메인 TOP 10:');
      byDomain.slice(0, 10).forEach((domain, index) => {
        const types = domain.types.join(', ');
        console.log(`   ${index + 1}. ${domain.domain}: ${domain.count}개 [${types}]`);
      });
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * 차단 분석 리포트 저장
   */
  async saveReport(keywordId, agent, blockStats, blockedDomains) {
    if (!blockStats) return;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hourStr = now.getHours().toString().padStart(2, '0');
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `block-analysis-${agent}-${keywordId}-${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'reports', dateStr, hourStr, filename);

    try {
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      const reportData = {
        timestamp: now.toISOString(),
        agent,
        keywordId,
        blockStats,
        blockedDomains: Array.from(blockedDomains.entries()).map(([domain, stats]) => ({
          domain,
          count: stats.count,
          types: Array.from(stats.types)
        })),
        analysis: this.blockResults
      };

      await fs.writeFile(filepath, JSON.stringify(reportData, null, 2));
      console.log(`📄 차단 분석 리포트 저장됨: ${filepath}`);

      // 텍스트 리포트도 생성
      await this.saveTextReport(keywordId, agent, blockStats, blockedDomains);

    } catch (error) {
      console.error('차단 리포트 저장 실패:', error.message);
    }
  }

  /**
   * 텍스트 형식의 차단 리포트 저장
   */
  async saveTextReport(keywordId, agent, blockStats, blockedDomains) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hourStr = now.getHours().toString().padStart(2, '0');
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `block-analysis-${agent}-${keywordId}-${timestamp}.txt`;
    const filepath = path.join(process.cwd(), 'reports', dateStr, hourStr, filename);

    try {
      let content = '리소스 차단 상세 분석 리포트\n';
      content += '=' .repeat(80) + '\n';
      content += `생성 시각: ${now.toISOString()}\n`;
      content += `에이전트: ${agent}\n`;
      content += `키워드 ID: ${keywordId}\n`;
      content += '=' .repeat(80) + '\n\n';

      // 카테고리별 차단 상세
      content += '📊 카테고리별 차단 상세\n';
      content += '-'.repeat(40) + '\n';
      
      Object.entries(blockStats).forEach(([category, stats]) => {
        if (stats.count > 0) {
          content += `\n[${category.toUpperCase()}] - ${stats.count}개 차단\n`;
          if (stats.urls && stats.urls.length > 0) {
            content += '샘플 URL:\n';
            stats.urls.forEach(url => {
              content += `  - ${url}\n`;
            });
          }
        }
      });

      // 도메인별 차단 상세
      content += '\n\n🌐 도메인별 차단 상세\n';
      content += '=' .repeat(80) + '\n';
      
      if (blockedDomains instanceof Map && blockedDomains.size > 0) {
        const sortedDomains = Array.from(blockedDomains.entries())
          .sort((a, b) => b[1].count - a[1].count);

        sortedDomains.forEach(([domain, stats], index) => {
          const types = stats.types ? Array.from(stats.types).join(', ') : '';
          content += `${index + 1}. ${domain}\n`;
          content += `   차단 수: ${stats.count}개\n`;
          if (types) {
            content += `   차단 타입: ${types}\n`;
          }
          content += '-'.repeat(40) + '\n';
        });
      } else {
        content += '차단된 도메인 정보 없음\n';
      }

      await fs.writeFile(filepath, content, 'utf8');
      console.log(`📄 차단 분석 텍스트 리포트 저장됨: ${filepath}`);

    } catch (error) {
      console.error('텍스트 리포트 저장 실패:', error.message);
    }
  }
}

module.exports = BlockAnalyzer;