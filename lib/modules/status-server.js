/**
 * HTTP 상태 모니터링 서버
 * - 실시간 쓰레드 상태 확인
 * - 삭제 가능한 모듈 (api-mode.js에서 import 제거하면 됨)
 *
 * Created: 2025-11-21
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class StatusServer {
  constructor(port = 3303) {
    this.port = port;
    this.server = null;

    // 쓰레드 상태
    this.threads = new Map();

    // 전체 통계
    this.stats = {
      startTime: new Date(),
      totalTasks: 0,
      success: 0,
      failed: 0,
      blocked: 0
    };

    // 로그 디렉토리
    this.logDir = path.join(process.cwd(), 'logs', 'monitor');
    this.ensureLogDir();
    this.cleanOldLogs(30);  // 30일 이상 된 로그 삭제
  }

  /**
   * 로그 디렉토리 생성
   */
  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 오래된 로그 삭제 (days일 이상)
   */
  cleanOldLogs(days) {
    try {
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = days * 24 * 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ 오래된 로그 삭제: ${file}`);
        }
      });
    } catch (e) {
      // 삭제 실패 무시
    }
  }

  /**
   * 작업 결과 로그 저장
   */
  logTask(threadNumber, result) {
    try {
      const today = new Date().toISOString().split('T')[0];  // 2025-11-21
      const logFile = path.join(this.logDir, `${today}.json`);

      const logEntry = {
        timestamp: new Date().toISOString(),
        thread: threadNumber,
        status: result.status,
        keyword: result.keyword || '-',
        proxy: result.proxy || '-',
        chrome: result.chrome || '-',
        executionTime: result.executionTime || 0
      };

      // 파일에 append (줄바꿈으로 구분된 JSON)
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (e) {
      // 로그 저장 실패 무시
    }
  }

  /**
   * 서버 시작
   */
  start() {
    this.server = http.createServer((req, res) => {
      if (req.url === '/status' || req.url === '/') {
        this.handleStatus(req, res);
      } else if (req.url === '/api/status') {
        this.handleApiStatus(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`📊 상태 모니터링 서버 시작: http://localhost:${this.port}/status`);

      // 브라우저에서 자동으로 열기 (우측 하단, 작은 창)
      const url = `http://localhost:${this.port}/status`;

      if (process.platform === 'linux') {
        // 화면 해상도 감지 후 우측 하단에 배치
        exec('xrandr | grep "\\*" | head -1', (err, stdout) => {
          let screenWidth = 1920, screenHeight = 1080;
          if (!err && stdout) {
            const match = stdout.match(/(\d+)x(\d+)/);
            if (match) {
              screenWidth = parseInt(match[1]);
              screenHeight = parseInt(match[2]);
            }
          }

          // 창 크기
          const winWidth = 500;
          const winHeight = 780;
          const posX = screenWidth - winWidth - 10;  // 우측 여백 10px
          const posY = screenHeight - winHeight - 10;  // 하단 여백 10px

          // Chrome으로 열기 (위치/크기 지정)
          const chromeCmd = `google-chrome --app=${url} --window-size=${winWidth},${winHeight} --window-position=${posX},${posY} 2>/dev/null || chromium-browser --app=${url} --window-size=${winWidth},${winHeight} --window-position=${posX},${posY} 2>/dev/null`;
          exec(chromeCmd, (err) => {
            if (err) {
              console.log(`   ℹ️ 브라우저에서 직접 열어주세요: ${url}`);
            }
          });
        });
      } else {
        const openCommand = process.platform === 'darwin' ? 'open' : 'start';
        exec(`${openCommand} ${url}`, (err) => {
          if (err) {
            console.log(`   ℹ️ 브라우저에서 직접 열어주세요: ${url}`);
          }
        });
      }
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ 포트 ${this.port} 사용 중 - 상태 서버 비활성화`);
      }
    });

    // 6시간마다 자동 재시작 (메모리 정리)
    this.restartInterval = setInterval(() => {
      this.restart();
    }, 6 * 60 * 60 * 1000);  // 6시간

    // 프로세스 종료 시 서버 정리
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    process.on('exit', () => this.stop());
  }

  /**
   * 서버 재시작 (메모리 정리)
   */
  restart() {
    console.log('🔄 상태 서버 재시작 (메모리 정리)...');

    // 서버 종료
    if (this.server) {
      this.server.close();
    }

    // 통계는 유지, 쓰레드 상태만 초기화
    this.threads.clear();

    // 서버 재시작
    this.server = http.createServer((req, res) => {
      if (req.url === '/status' || req.url === '/') {
        this.handleStatus(req, res);
      } else if (req.url === '/api/status') {
        this.handleApiStatus(req, res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, () => {
      console.log(`📊 상태 서버 재시작 완료: http://localhost:${this.port}/status`);
    });
  }

  /**
   * 서버 종료
   */
  stop() {
    if (this.restartInterval) {
      clearInterval(this.restartInterval);
    }
    if (this.server) {
      this.server.close();
      console.log('📊 상태 모니터링 서버 종료');
    }
  }

  /**
   * 쓰레드 상태 업데이트
   */
  updateThread(threadNumber, status) {
    this.threads.set(threadNumber, {
      ...status,
      updatedAt: new Date()
    });
  }

  /**
   * 통계 업데이트
   */
  updateStats(type) {
    this.stats.totalTasks++;
    if (type === 'success') this.stats.success++;
    else if (type === 'failed') this.stats.failed++;
    else if (type === 'blocked') this.stats.blocked++;
  }

  /**
   * HTML 상태 페이지
   */
  handleStatus(req, res) {
    const uptime = Math.floor((new Date() - this.stats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeStr = `${hours}시간 ${minutes}분 ${seconds}초`;

    let threadRows = '';
    for (let i = 1; i <= this.threads.size; i++) {
      const t = this.threads.get(i);
      if (t) {
        const statusClass = t.status === 'running' ? 'running' :
                           t.status === 'idle' ? 'idle' : 'error';
        const keyword = t.keyword && t.keyword.length > 12 ? t.keyword.substring(0, 12) + '..' : (t.keyword || '-');
        const proxy = t.proxy && t.proxy.length > 15 ? t.proxy.substring(0, 15) + '..' : (t.proxy || '-');
        threadRows += `
          <tr>
            <td>${i}</td>
            <td class="${statusClass}">${t.status || '-'}</td>
            <td>${keyword}</td>
            <td>${proxy}</td>
            <td>${t.chrome || '-'}</td>
          </tr>
        `;
      }
    }

    const successRate = this.stats.totalTasks > 0
      ? Math.round((this.stats.success / this.stats.totalTasks) * 100)
      : 0;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="3">
  <title>상태</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', sans-serif; font-size: 14px; background: #1e1e1e; color: #fff; padding: 12px; }
    .stats { display: flex; gap: 10px; margin-bottom: 12px; }
    .stat { flex: 1; text-align: center; padding: 10px; border-radius: 6px; }
    .stat.total { background: #2196F3; }
    .stat.success { background: #4CAF50; }
    .stat.failed { background: #f44336; }
    .stat.blocked { background: #FF9800; }
    .stat.rate { background: #9C27B0; }
    .stat-value { font-size: 28px; font-weight: bold; }
    .stat-label { font-size: 12px; opacity: 0.8; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #333; font-weight: 600; }
    .running { color: #4CAF50; }
    .idle { color: #9E9E9E; }
    .error { color: #f44336; }
    .info { font-size: 12px; color: #888; text-align: right; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="info">${uptimeStr} | ${successRate}%</div>
  <div class="stats">
    <div class="stat total"><div class="stat-value">${this.stats.totalTasks}</div><div class="stat-label">전체</div></div>
    <div class="stat success"><div class="stat-value">${this.stats.success}</div><div class="stat-label">성공</div></div>
    <div class="stat failed"><div class="stat-value">${this.stats.failed}</div><div class="stat-label">실패</div></div>
    <div class="stat blocked"><div class="stat-value">${this.stats.blocked}</div><div class="stat-label">차단</div></div>
  </div>
  <table>
    <thead>
      <tr><th>T</th><th>상태</th><th>키워드</th><th>프록시</th><th>Chr</th></tr>
    </thead>
    <tbody>
      ${threadRows || '<tr><td colspan="5" style="text-align:center;color:#666;">대기중</td></tr>'}
    </tbody>
  </table>
</body>
</html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  /**
   * JSON API
   */
  handleApiStatus(req, res) {
    const data = {
      uptime: Math.floor((new Date() - this.stats.startTime) / 1000),
      stats: this.stats,
      threads: Object.fromEntries(this.threads)
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }
}

// 싱글톤 인스턴스
let statusServerInstance = null;

function getStatusServer(port = 3303) {
  if (!statusServerInstance) {
    statusServerInstance = new StatusServer(port);
  }
  return statusServerInstance;
}

module.exports = {
  StatusServer,
  getStatusServer
};
