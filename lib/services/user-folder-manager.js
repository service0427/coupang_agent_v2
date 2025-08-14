/**
 * 유저 폴더 매니저
 * 쓰레드별로 1-30 번호의 유저 폴더를 순차적으로 관리
 */

const path = require('path');

class UserFolderManager {
  constructor(config = {}) {
    this.threadNumber = config.threadNumber || 1;
    this.basePath = config.basePath || './browser-data';
    this.folderRange = { min: 1, max: 30 };
    this.currentFolder = 1;
    
    // 폴더 상태 추적
    this.folderStates = new Map(); // folder_number -> { inUse: boolean, lastUsed: Date }
    
    console.log(`📂 UserFolderManager 초기화: 쓰레드 ${this.threadNumber}`);
    console.log(`   기본 경로: ${this.basePath}`);
    console.log(`   폴더 범위: ${this.folderRange.min}-${this.folderRange.max}`);
  }

  /**
   * 사용 가능한 다음 폴더 번호 가져오기
   */
  getNextFolder() {
    let folderNumber = this.currentFolder;
    let attempts = 0;
    const maxAttempts = this.folderRange.max;

    while (attempts < maxAttempts) {
      const folderState = this.folderStates.get(folderNumber);
      if (!folderState || !folderState.inUse) {
        this.markFolderInUse(folderNumber);
        this.currentFolder = this.getNextFolderNumber(folderNumber);
        
        console.log(`📁 할당된 폴더: ${folderNumber} (다음: ${this.currentFolder})`);
        return folderNumber;
      }

      folderNumber = this.getNextFolderNumber(folderNumber);
      attempts++;
    }

    // 모든 폴더가 사용 중인 경우 첫 번째 폴더 강제 할당
    console.warn(`⚠️ 모든 폴더가 사용 중 - 폴더 1 강제 할당`);
    this.markFolderInUse(1);
    return 1;
  }

  /**
   * 폴더를 사용 중으로 표시
   */
  markFolderInUse(folderNumber) {
    this.folderStates.set(folderNumber, {
      inUse: true,
      lastUsed: new Date(),
      threadNumber: this.threadNumber
    });
  }

  /**
   * 폴더 사용 완료 처리
   */
  releaseFolderUsage(folderNumber) {
    const folderState = this.folderStates.get(folderNumber);
    if (folderState) {
      folderState.inUse = false;
      folderState.releasedAt = new Date();
      console.log(`🔓 폴더 ${folderNumber} 사용 완료`);
    }
  }

  /**
   * 다음 폴더 번호 계산 (1-30 순환)
   */
  getNextFolderNumber(currentNumber) {
    return currentNumber >= this.folderRange.max ? this.folderRange.min : currentNumber + 1;
  }

  /**
   * 폴더 경로 생성
   */
  getFolderPath(folderNumber) {
    return path.join(this.basePath, `thread_${this.threadNumber}`, `${folderNumber.toString().padStart(3, '0')}`);
  }

  /**
   * 모든 폴더 상태 리셋
   */
  resetAllFolderStates() {
    console.log(`🔄 모든 폴더 상태 리셋`);
    this.folderStates.clear();
    this.currentFolder = 1;
  }

  /**
   * 매니저 상태 조회
   */
  getStatus() {
    const inUseFolders = [];
    const availableFolders = [];
    
    for (let i = this.folderRange.min; i <= this.folderRange.max; i++) {
      const state = this.folderStates.get(i);
      if (state && state.inUse) {
        inUseFolders.push(i);
      } else {
        availableFolders.push(i);
      }
    }

    return {
      threadNumber: this.threadNumber,
      basePath: this.basePath,
      currentFolder: this.currentFolder,
      totalFolders: this.folderRange.max - this.folderRange.min + 1,
      inUseFolders: inUseFolders,
      availableFolders: availableFolders,
      utilizationRate: (inUseFolders.length / (this.folderRange.max - this.folderRange.min + 1) * 100).toFixed(1)
    };
  }
}

module.exports = UserFolderManager;