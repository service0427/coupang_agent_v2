/**
 * 스마트 프로필 정리 시스템
 * - 캐시는 보존하면서 추적 데이터만 선택적 삭제
 * - 차단 위험 감소 + 트래픽 절약 동시 달성
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * 추적 위험 데이터만 선택적 삭제
 */
async function cleanTrackingData(profilePath) {
  console.log('🧹 추적 데이터 선택적 정리 시작...');
  
  const cleanupTargets = [
    // 쿠키 및 세션 (추적의 핵심)
    'Default/Cookies',
    'Default/Cookies-journal', 
    'Default/Session Storage',
    'Default/Local Storage',
    
    // 브라우징 히스토리 (패턴 분석 방지)
    'Default/History',
    'Default/History-journal',
    'Default/Top Sites',
    'Default/Top Sites-journal',
    
    // 사용자 식별 데이터
    'Default/Preferences',
    'Default/Secure Preferences',
    'Default/Web Data',
    'Default/Web Data-journal',
    
    // 네트워크 학습 데이터
    'Default/Network Action Predictor',
    'Default/Network Action Predictor-journal'
  ];
  
  let cleanedCount = 0;
  
  for (const target of cleanupTargets) {
    const targetPath = path.join(profilePath, target);
    
    try {
      await fs.access(targetPath);
      await fs.unlink(targetPath);
      cleanedCount++;
      console.log(`   ✅ 삭제: ${target}`);
    } catch (error) {
      // 파일이 없으면 무시
    }
  }
  
  console.log(`✅ 추적 데이터 정리 완료: ${cleanedCount}개 파일 삭제`);
  
  // 캐시는 보존됨을 명시
  const cachePreserved = [
    'Default/Cache',
    'ShaderCache', 
    'GrShaderCache',
    'component_crx_cache'
  ];
  
  console.log('💾 보존된 캐시:');
  for (const cache of cachePreserved) {
    const cachePath = path.join(profilePath, cache);
    try {
      await fs.access(cachePath);
      console.log(`   📦 보존: ${cache}`);
    } catch (error) {
      // 캐시가 없으면 무시
    }
  }
}

/**
 * 실행 횟수 기반 자동 정리
 */
async function shouldCleanProfile(keywordId, agent) {
  try {
    const dbServiceV2 = require('../services/db-service-v2');
    
    // 키워드별 실행 횟수 조회
    const result = await dbServiceV2.query(`
      SELECT current_executions, last_profile_clean
      FROM v2_test_keywords 
      WHERE id = $1
    `, [keywordId]);
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const { current_executions, last_profile_clean } = result.rows[0];
    
    // 10회 실행마다 또는 마지막 정리 후 24시간 경과 시
    const executionThreshold = current_executions % 10 === 0;
    const timeThreshold = !last_profile_clean || 
      (Date.now() - new Date(last_profile_clean).getTime()) > 24 * 60 * 60 * 1000;
    
    return executionThreshold || timeThreshold;
    
  } catch (error) {
    console.log('정리 조건 확인 실패:', error.message);
    return false;
  }
}

/**
 * 정리 기록 업데이트
 */
async function recordProfileClean(keywordId) {
  try {
    const dbServiceV2 = require('../services/db-service-v2');
    
    await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET last_profile_clean = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [keywordId]);
    
    console.log(`📝 [키워드 ID:${keywordId}] 프로필 정리 기록 업데이트`);
    
  } catch (error) {
    console.log('정리 기록 실패:', error.message);
  }
}

/**
 * CDP를 통한 런타임 추적 데이터 정리
 */
async function clearRuntimeTrackingData(page) {
  try {
    console.log('🔄 런타임 추적 데이터 정리...');
    
    const client = await page.context().newCDPSession(page);
    
    // 쿠키만 삭제 (가장 중요한 추적 요소)
    await client.send('Network.clearBrowserCookies');
    
    // 스토리지 선택적 삭제
    const origins = [
      'https://www.coupang.com',
      'https://coupang.com'
    ];
    
    for (const origin of origins) {
      try {
        await client.send('Storage.clearDataForOrigin', {
          origin: origin,
          storageTypes: 'cookies,local_storage,session_storage'
        });
      } catch (e) {
        // 도메인이 없으면 무시
      }
    }
    
    console.log('✅ 런타임 추적 데이터 정리 완료');
    
  } catch (error) {
    console.log('⚠️ 런타임 정리 실패:', error.message);
  }
}

module.exports = {
  cleanTrackingData,
  shouldCleanProfile,
  recordProfileClean,
  clearRuntimeTrackingData
};