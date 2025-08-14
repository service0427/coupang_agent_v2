/**
 * Chrome Preferences 파일 정리 유틸리티
 * - Chrome 복구 메시지 방지
 * - 정상 종료 상태로 설정
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Chrome Preferences 파일을 정리하여 복구 메시지 방지
 * @param {string} userDataDir - Chrome 유저 데이터 디렉토리 경로
 */
async function cleanChromePreferences(userDataDir) {
  try {
    const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
    
    // Preferences 파일이 존재하는지 확인
    try {
      await fs.access(prefsPath);
    } catch {
      // 파일이 없으면 스킵 (첫 실행이거나 새 프로필)
      console.log('   📝 Preferences 파일 없음 (첫 실행 또는 새 프로필)');
      return;
    }
    
    // Preferences 파일 읽기
    const prefsData = await fs.readFile(prefsPath, 'utf8');
    const prefs = JSON.parse(prefsData);
    
    // 정상 종료로 설정
    if (!prefs.profile) {
      prefs.profile = {};
    }
    
    // 복구 메시지 관련 필드 설정
    prefs.profile.exit_type = "Normal";
    prefs.profile.exited_cleanly = true;
    
    // 세션 복구 관련 설정 추가
    if (!prefs.session) {
      prefs.session = {};
    }
    prefs.session.restore_on_startup = 5; // 5 = 이전 세션 복구 안함
    
    // 브라우저 충돌 관련 설정
    if (!prefs.browser) {
      prefs.browser = {};
    }
    prefs.browser.check_default_browser = false;
    prefs.browser.show_update_promotion_info_bar = false;
    
    // 파일 저장
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2));
    console.log('   ✅ Chrome Preferences 정리 완료 (복구 메시지 방지)');
    
  } catch (error) {
    // 오류 발생 시 경고만 표시하고 계속 진행
    console.warn('   ⚠️ Preferences 정리 실패 (무시하고 계속):', error.message);
  }
}

/**
 * Local State 파일도 정리 (추가 안전장치)
 * @param {string} userDataDir - Chrome 유저 데이터 디렉토리 경로
 */
async function cleanLocalState(userDataDir) {
  try {
    const localStatePath = path.join(userDataDir, 'Local State');
    
    // Local State 파일이 존재하는지 확인
    try {
      await fs.access(localStatePath);
    } catch {
      // 파일이 없으면 스킵
      return;
    }
    
    // Local State 파일 읽기
    const stateData = await fs.readFile(localStatePath, 'utf8');
    const state = JSON.parse(stateData);
    
    // 정상 종료로 설정
    if (!state.profile) {
      state.profile = {};
    }
    
    if (!state.profile.info_cache) {
      state.profile.info_cache = {};
    }
    
    // Default 프로필의 상태 정리
    if (state.profile.info_cache.Default) {
      state.profile.info_cache.Default.is_using_default_name = true;
      state.profile.info_cache.Default.is_ephemeral = false;
    }
    
    // 파일 저장
    await fs.writeFile(localStatePath, JSON.stringify(state, null, 2));
    
  } catch (error) {
    // Local State 정리 실패는 무시 (선택적)
  }
}

/**
 * Chrome 프로필 전체 정리
 * @param {string} userDataDir - Chrome 유저 데이터 디렉토리 경로
 */
async function cleanChromeProfile(userDataDir) {
  await cleanChromePreferences(userDataDir);
  await cleanLocalState(userDataDir);
}

module.exports = {
  cleanChromePreferences,
  cleanLocalState,
  cleanChromeProfile
};