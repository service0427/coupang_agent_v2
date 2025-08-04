/**
 * 트래커 설정 모듈
 */

/**
 * 다운로드 및 쿠키 트래커 설정
 */
async function setupTrackers(context, page, profileName) {
  const downloadTracker = require('../trackers/download-tracker');
  const cookieTracker = require('../trackers/cookie-tracker');
  
  const trackerProfileName = profileName || 'chrome';
  await downloadTracker.init(trackerProfileName);
  await cookieTracker.init(trackerProfileName);
  
  // 다운로드 이벤트 리스너 추가
  context.on('download', async (download) => {
    try {
      const url = download.url();
      const suggestedFilename = download.suggestedFilename();
      
      // 파일 크기를 얻기 위해 다운로드 완료 대기 (최대 5초)
      let fileSize = null;
      try {
        const path = await download.path();
        if (path) {
          const fs = require('fs');
          const stats = fs.statSync(path);
          fileSize = stats.size;
        }
      } catch (e) {
        // 파일 크기를 얻지 못해도 계속 진행
      }
      
      await downloadTracker.addDownload(url, suggestedFilename, fileSize);
    } catch (error) {
      console.error('다운로드 추적 중 오류:', error);
    }
  });
  
  // 페이지가 있을 때만 네트워크 응답 추적
  if (page) {
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const status = response.status();
        const request = response.request();
        
        // 차단된 요청은 추적하지 않음
        if (request.failure()) {
          return;
        }
        
        // 성공적인 응답만 추적 (200-299) 또는 304 (Not Modified)
        if ((status >= 200 && status < 300) || status === 304) {
          const headers = response.headers();
          const contentType = headers['content-type'] || '';
          const contentLength = headers['content-length'];
          
          // 캐시 상태 확인
          let cacheStatus = null;
          if (status === 304) {
            cacheStatus = 'hit';
          } else if (headers['x-cache'] && headers['x-cache'].includes('Hit')) {
            cacheStatus = 'hit';
          } else if (headers['x-cache'] && headers['x-cache'].includes('Miss')) {
            cacheStatus = 'miss';
          } else if (headers['cache-control'] && headers['cache-control'].includes('no-cache')) {
            cacheStatus = 'miss';
          } else if (headers['etag'] || headers['last-modified']) {
            cacheStatus = 'revalidated';
          }
          
          // URL에서 파일명 추출
          const urlParts = url.split('/');
          const filename = urlParts[urlParts.length - 1].split('?')[0] || 'unknown';
          
          // 파일 크기 (content-length 헤더 사용)
          const fileSize = contentLength ? parseInt(contentLength) : null;
          
          // 실제로 다운로드된 리소스만 추적
          await downloadTracker.addDownload(url, filename, fileSize, cacheStatus);
        }
      } catch (error) {
        // 오류 무시 (너무 많은 로그 방지)
      }
    });
  }
}

module.exports = {
  setupTrackers
};