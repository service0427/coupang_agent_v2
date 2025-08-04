/**
 * 다운로드 추적 모듈 (간소화 버전)
 */

class DownloadTracker {
  constructor() {
    this.downloads = [];
    this.profileName = null;
  }

  async init(profileName) {
    this.profileName = profileName;
    this.downloads = [];
    console.log(`📊 다운로드 추적 초기화: ${profileName}`);
  }

  async addDownload(url, filename, fileSize, cacheStatus) {
    this.downloads.push({
      url,
      filename,
      fileSize,
      cacheStatus,
      timestamp: new Date()
    });
  }

  async saveStats() {
    console.log(`📊 다운로드 통계: ${this.downloads.length}개 리소스`);
  }
}

module.exports = new DownloadTracker();