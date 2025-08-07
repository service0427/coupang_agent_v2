/**
 * 스마트 프로필 관리자
 * - 최초: 완전 리셋
 * - 10회마다: 핑거프린팅 데이터만 정리 (캐시 보존)
 * - 실행 횟수 자동 추적
 */

const fs = require('fs').promises;
const path = require('path');
const { cleanFingerprintingData } = require('./advanced-profile-cleaner');

class SmartProfileManager {
  constructor(profileName = 'chrome') {
    this.profileName = profileName;
    this.profilePath = path.join('d:', 'dev', 'git', 'dev_coupang_chrome', 'browser-data', profileName);
    this.counterFile = path.join(this.profilePath, '.execution_counter');
    this.RESET_CYCLE = 10; // 10회마다 핑거프린팅 정리
  }

  /**
   * 실행 전 프로필 관리
   */
  async prepareProfile() {
    console.log(`🔧 프로필 관리: ${this.profileName}`);
    
    try {
      const executionCount = await this.getExecutionCount();
      console.log(`📊 현재 실행 횟수: ${executionCount}`);
      
      if (executionCount === 0) {
        // 최초 실행: 완전 리셋
        await this.fullReset();
        console.log('🆕 최초 실행 - 완전 리셋 완료');
      } else if (executionCount % this.RESET_CYCLE === 0) {
        // 10회마다: 핑거프린팅 정리
        await this.fingerprintCleanup();
        console.log(`🧹 ${this.RESET_CYCLE}회 주기 - 핑거프린팅 정리 완료`);
      } else {
        // 일반 실행: 캐시 최대 활용
        console.log('💾 캐시 활용 실행 (변경사항 없음)');
      }
      
      // 실행 횟수 증가
      await this.incrementExecutionCount();
      
      return {
        isFirstRun: executionCount === 0,
        isCycleReset: executionCount % this.RESET_CYCLE === 0,
        executionCount: executionCount + 1
      };
      
    } catch (error) {
      console.error('❌ 프로필 관리 실패:', error.message);
      // 에러 시 안전하게 완전 리셋
      await this.fullReset();
      await this.setExecutionCount(1);
      return { isFirstRun: true, isCycleReset: false, executionCount: 1 };
    }
  }

  /**
   * 실행 횟수 조회
   */
  async getExecutionCount() {
    try {
      const data = await fs.readFile(this.counterFile, 'utf8');
      return parseInt(data) || 0;
    } catch (e) {
      return 0; // 파일이 없으면 0 (최초 실행)
    }
  }

  /**
   * 실행 횟수 증가
   */
  async incrementExecutionCount() {
    const current = await this.getExecutionCount();
    await this.setExecutionCount(current + 1);
  }

  /**
   * 실행 횟수 설정
   */
  async setExecutionCount(count) {
    await fs.mkdir(this.profilePath, { recursive: true });
    await fs.writeFile(this.counterFile, count.toString());
  }

  /**
   * 완전 리셋 (최초 실행)
   */
  async fullReset() {
    console.log('🗑️ 프로필 완전 삭제 중...');
    
    try {
      // 프로필 폴더 완전 삭제
      await fs.rm(this.profilePath, { recursive: true, force: true });
      console.log('   ✅ 프로필 폴더 삭제 완료');
      
      // 새로운 폴더 생성
      await fs.mkdir(this.profilePath, { recursive: true });
      console.log('   ✅ 새 프로필 폴더 생성');
      
      // 실행 횟수 초기화
      await this.setExecutionCount(0);
      
    } catch (error) {
      console.log(`   ⚠️ 완전 삭제 실패 (무시됨): ${error.message}`);
    }
  }

  /**
   * 핑거프린팅 데이터만 정리 (캐시 보존)
   */
  async fingerprintCleanup() {
    console.log('🧹 핑거프린팅 데이터 정리 중...');
    
    try {
      await cleanFingerprintingData(this.profilePath);
      console.log('   ✅ 핑거프린팅 정리 완료 (캐시 보존됨)');
    } catch (error) {
      console.log(`   ⚠️ 정리 실패: ${error.message}`);
      // 실패 시 완전 리셋으로 폴백
      await this.fullReset();
    }
  }

  /**
   * 수동 리셋 (차단 발생 시)
   */
  async manualReset(reason = 'manual') {
    console.log(`🚨 수동 리셋 실행: ${reason}`);
    await this.fullReset();
    await this.setExecutionCount(0);
    console.log('✅ 수동 리셋 완료');
  }

  /**
   * 상태 조회
   */
  async getStatus() {
    const executionCount = await this.getExecutionCount();
    const nextAction = executionCount === 0 ? '완전 리셋' : 
                      executionCount % this.RESET_CYCLE === 0 ? '핑거프린팅 정리' : 
                      '캐시 활용';
    
    return {
      profileName: this.profileName,
      executionCount,
      nextAction,
      cyclePosition: `${executionCount % this.RESET_CYCLE}/${this.RESET_CYCLE}`,
      profileExists: await this.profileExists()
    };
  }

  /**
   * 프로필 존재 확인
   */
  async profileExists() {
    try {
      await fs.access(this.profilePath);
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = SmartProfileManager;