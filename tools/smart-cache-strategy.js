/**
 * 스마트 캐시 전략 
 * - IP 변경 시 핑거프린팅 데이터 자동 정리
 * - 캐시는 보존하면서 추적 요소만 제거
 */

const dbServiceV2 = require('../lib/services/db-service-v2');
const { cleanFingerprintingData } = require('../lib/utils/advanced-profile-cleaner');
const path = require('path');

async function smartCacheStrategy() {
  console.log('🧠 스마트 캐시 전략 분석\n');
  
  try {
    // 1. 현재 차단 상황 분석
    const blockAnalysis = await dbServiceV2.query(`
      SELECT 
        agent,
        COUNT(*) as total_keywords,
        COUNT(CASE WHEN consecutive_blocks >= 3 THEN 1 END) as high_risk_keywords,
        MAX(consecutive_blocks) as max_blocks,
        AVG(consecutive_blocks) as avg_blocks
      FROM v2_test_keywords
      GROUP BY agent
      ORDER BY max_blocks DESC
    `);
    
    console.log('📊 에이전트별 차단 위험 분석:');
    console.log('에이전트\t키워드수\t고위험\t최대차단\t평균차단');
    console.log('='.repeat(60));
    
    const riskAgents = [];
    
    blockAnalysis.rows.forEach(row => {
      const riskLevel = row.max_blocks >= 4 ? '🔴 위험' : 
                       row.max_blocks >= 2 ? '🟡 주의' : '🟢 안전';
      
      console.log(`${row.agent}\t\t${row.total_keywords}\t${row.high_risk_keywords}\t${row.max_blocks}\t${parseFloat(row.avg_blocks).toFixed(1)}\t${riskLevel}`);
      
      if (row.max_blocks >= 3) {
        riskAgents.push(row.agent);
      }
    });
    
    // 2. 권장 전략 제시
    console.log('\n💡 권장 전략:');
    
    if (riskAgents.length > 0) {
      console.log('🔴 고위험 상황 - 즉시 조치 필요');
      console.log('   1. 프로필 완전 리셋 (캐시 포기, 익명성 우선)');
      console.log('   2. IP 변경 + 핑거프린팅 데이터 정리');
      console.log('   3. 새로운 프록시 서버 사용');
      
      console.log(`\n🛠️ 고위험 에이전트: ${riskAgents.join(', ')}`);
      console.log('   실행 명령어:');
      riskAgents.forEach(agent => {
        console.log(`   node tools/reset-agent-profile.js ${agent}`);
      });
      
    } else {
      console.log('🟢 안전 상황 - 예방적 관리');
      console.log('   1. 캐시 보존 + 추적 데이터만 정리');
      console.log('   2. 정기적 핑거프린팅 방지');
      console.log('   3. 로테이션 프록시 사용');
    }
    
    // 3. 프로필별 캐시 크기 분석
    console.log('\n💾 프로필별 캐시 현황:');
    // OS 독립적 경로 처리
    const path = require('path');
    const profilePath = path.join(process.cwd(), 'browser-data');
    
    const fs = require('fs').promises;
    
    try {
      const profiles = await fs.readdir(profilePath);
      
      for (const profile of profiles) {
        if (profile.startsWith('instance_') || profile === 'chrome') {
          const cacheSize = await getDirectorySize(path.join(profilePath, profile, 'Default', 'Cache'));
          console.log(`   ${profile}: ${cacheSize}MB 캐시`);
        }
      }
    } catch (e) {
      console.log('   프로필 폴더 접근 실패');
    }
    
    // 4. 최적 전략 결론
    console.log('\n🎯 최종 권장사항:');
    console.log('   1. IP 변경 시마다 핑거프린팅 데이터만 정리');
    console.log('   2. 캐시는 최대 보존 (트래픽 절약)');
    console.log('   3. 5회 차단 시 프로필 완전 리셋');
    console.log('   4. 프록시 로테이션 주기: 24시간');
    
  } catch (error) {
    console.error('분석 실패:', error.message);
  } finally {
    process.exit(0);
  }
}

async function getDirectorySize(dirPath) {
  try {
    const fs = require('fs').promises;
    let totalSize = 0;
    
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return (totalSize / 1024 / 1024).toFixed(2);
  } catch (e) {
    return '0.00';
  }
}

smartCacheStrategy();