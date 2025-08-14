/**
 * 프로필 초기화 테스트 스크립트
 * - 새로운 폴더에 헤드리스 모드로 초기화 테스트
 * - 로그 확인용
 */

const SharedCacheManager = require('./lib/services/shared-cache-manager');
const { cleanChromeProfile } = require('./lib/utils/preferences-cleaner');
const fs = require('fs').promises;
const path = require('path');

async function testProfileInitialization() {
  console.log('🧪 프로필 초기화 테스트 시작\n');
  console.log('='.repeat(60));
  
  // 테스트용 폴더 경로
  const testFolderName = `test_init_${Date.now()}`;
  const testFolderPath = path.join(__dirname, 'browser-data', testFolderName);
  
  console.log(`📁 테스트 폴더: ${testFolderName}`);
  console.log(`📂 전체 경로: ${testFolderPath}`);
  console.log('');
  
  try {
    // SharedCacheManager 초기화
    const cacheManager = new SharedCacheManager({
      basePath: './browser-data'
    });
    
    // 1. 초기화 필요 여부 확인
    console.log('1️⃣ 초기화 필요 여부 확인...');
    const needsInit = await cacheManager.needsProfileInitialization(testFolderPath);
    console.log(`   결과: ${needsInit ? '초기화 필요 ✅' : '이미 존재 ❌'}`);
    console.log('');
    
    if (!needsInit) {
      console.log('⚠️ 테스트 폴더가 이미 존재합니다. 테스트 중단.');
      return;
    }
    
    // 2. 프로필 초기화 실행
    console.log('2️⃣ 헤드리스 모드로 프로필 초기화...');
    const startTime = Date.now();
    const initSuccess = await cacheManager.createInitialProfile(testFolderPath);
    const elapsedTime = Date.now() - startTime;
    
    console.log(`   소요 시간: ${elapsedTime}ms`);
    console.log(`   결과: ${initSuccess ? '성공 ✅' : '실패 ❌'}`);
    console.log('');
    
    if (!initSuccess) {
      console.log('❌ 프로필 초기화 실패');
      return;
    }
    
    // 3. 생성된 폴더 구조 확인
    console.log('3️⃣ 생성된 폴더 구조 확인...');
    const defaultPath = path.join(testFolderPath, 'Default');
    
    // 주요 파일/폴더 확인
    const checkItems = [
      'Preferences',
      'Cache',
      'Local State',
      'Code Cache',
      'GPUCache'
    ];
    
    console.log('   📁 Default 폴더 내용:');
    for (const item of checkItems) {
      const itemPath = item === 'Local State' 
        ? path.join(testFolderPath, item)
        : path.join(defaultPath, item);
        
      try {
        const stat = await fs.stat(itemPath);
        const type = stat.isDirectory() ? '📁' : '📄';
        console.log(`      ${type} ${item} ✅`);
      } catch {
        console.log(`      ❌ ${item} (없음)`);
      }
    }
    console.log('');
    
    // 4. Preferences 정리 테스트
    console.log('4️⃣ Preferences 정리 (복구 메시지 방지)...');
    await cleanChromeProfile(testFolderPath);
    console.log('   ✅ Preferences 정리 완료');
    console.log('');
    
    // 5. 캐시 공유 설정 가능 여부 확인
    console.log('5️⃣ 캐시 공유 설정 테스트...');
    const isFirstRun = await cacheManager.isFirstRun(testFolderPath);
    console.log(`   첫 실행 여부: ${isFirstRun ? '예' : '아니오'}`);
    
    await cacheManager.setupUserFolderCache(testFolderPath, isFirstRun, false);
    console.log('   ✅ 캐시 공유 설정 완료');
    console.log('');
    
    // 6. 심볼릭 링크 확인
    console.log('6️⃣ 심볼릭 링크 상태 확인...');
    const cachePath = path.join(defaultPath, 'Cache');
    const stat = await fs.lstat(cachePath);
    
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(cachePath);
      console.log(`   ✅ Cache → ${target}`);
    } else {
      console.log(`   ❌ Cache는 일반 폴더입니다`);
    }
    console.log('');
    
    // 7. 정리
    console.log('7️⃣ 테스트 폴더 정리...');
    const cleanup = await askUserForCleanup();
    
    if (cleanup) {
      await fs.rm(testFolderPath, { recursive: true, force: true });
      console.log('   ✅ 테스트 폴더 삭제 완료');
    } else {
      console.log('   ⏸️ 테스트 폴더 유지');
      console.log(`   경로: ${testFolderPath}`);
    }
    
  } catch (error) {
    console.error('❌ 테스트 중 오류 발생:', error.message);
    console.error(error.stack);
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('✅ 프로필 초기화 테스트 완료');
}

async function askUserForCleanup() {
  // 자동으로 정리 (실제 테스트시 false로 변경 가능)
  return true;
}

// 테스트 실행
testProfileInitialization().catch(console.error);