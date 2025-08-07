/**
 * 핑거프린팅 데이터 정리 도구
 * - 캐시는 보존하면서 추적 요소만 제거
 * - 실행: node tools/clean-fingerprinting.js [프로필명]
 */

const { cleanFingerprintingData } = require('../lib/utils/advanced-profile-cleaner');
const fs = require('fs').promises;
const path = require('path');

async function cleanFingerprinting() {
  const profileName = process.argv[2] || 'chrome'; // 기본값: chrome
  const profilePath = path.join('d:', 'dev', 'git', 'dev_coupang_chrome', 'browser-data', profileName);
  
  console.log('🧹 핑거프린팅 데이터 정리 시작');
  console.log(`📁 대상 프로필: ${profilePath}\n`);
  
  try {
    // 프로필 폴더 존재 확인
    await fs.access(profilePath);
    console.log('✅ 프로필 폴더 확인됨');
    
    // 정리 전 상태 확인
    await checkProfileStatus(profilePath, '정리 전');
    
    // 핑거프린팅 데이터 정리 실행
    await cleanFingerprintingData(profilePath);
    
    // 정리 후 상태 확인
    await checkProfileStatus(profilePath, '정리 후');
    
    console.log('\n🎉 핑거프린팅 정리 완료!');
    console.log('💡 이제 동일 IP로도 차단 위험이 크게 감소합니다.');
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ 프로필 폴더를 찾을 수 없습니다: ${profilePath}`);
      console.log('\n📋 사용 가능한 프로필:');
      await showAvailableProfiles();
    } else {
      console.error('❌ 정리 중 오류:', error.message);
    }
  }
}

/**
 * 프로필 상태 확인
 */
async function checkProfileStatus(profilePath, stage) {
  console.log(`\n📊 프로필 상태 (${stage}):`);
  
  const checkFiles = [
    { name: 'Cookies', desc: '쿠키', tracking: true },
    { name: 'History', desc: '브라우징 기록', tracking: true },
    { name: 'Preferences', desc: '브라우저 설정', tracking: true },
    { name: 'Local Storage', desc: '로컬 스토리지', tracking: true },
    { name: 'Cache', desc: '캐시', tracking: false },
    { name: 'Code Cache', desc: '코드 캐시', tracking: false }
  ];
  
  for (const file of checkFiles) {
    const filePath = path.join(profilePath, 'Default', file.name);
    const icon = file.tracking ? '🚫' : '💾';
    
    try {
      const stats = await fs.stat(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`   ${icon} ${file.desc}: ${sizeKB}KB`);
    } catch (e) {
      console.log(`   ${icon} ${file.desc}: 없음`);
    }
  }
}

/**
 * 사용 가능한 프로필 목록 표시
 */
async function showAvailableProfiles() {
  try {
    const browserDataPath = path.join('d:', 'dev', 'git', 'dev_coupang_chrome', 'browser-data');
    const profiles = await fs.readdir(browserDataPath);
    
    profiles.forEach(profile => {
      console.log(`   - ${profile}`);
    });
    
    console.log('\n사용법:');
    console.log('   node tools/clean-fingerprinting.js chrome');
    console.log('   node tools/clean-fingerprinting.js instance_0');
    
  } catch (e) {
    console.log('   프로필 목록을 가져올 수 없습니다.');
  }
}

if (require.main === module) {
  cleanFingerprinting();
}

module.exports = { cleanFingerprinting };