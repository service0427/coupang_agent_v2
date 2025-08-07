/**
 * 전체 서비스 차단 감지 시스템
 * - 모든 에이전트 동시 차단 감지
 * - 임계값 초과 시 모든 유저폴더 삭제
 * - 자동 리셋 및 복구 메커니즘
 */

const dbServiceV2 = require('./db-service-v2');
const SmartProfileManager = require('../utils/smart-profile-manager');
const fs = require('fs').promises;
const path = require('path');

class GlobalBlockDetector {
  constructor() {
    this.checkInterval = 30 * 1000; // 30초마다 체크
    this.blockingThreshold = 0.3; // 30% 에이전트 차단시 전체 리셋 (더 민감)
    this.minimumAgents = 2; // 최소 2개 에이전트 이상일 때만 판단
    this.recentTimeWindow = 10 * 60 * 1000; // 최근 10분 내 기록만 확인
    this.isRunning = false;
    this.lastResetTime = 0;
    this.resetCooldown = 30 * 60 * 1000; // 30분 쿨다운
  }

  /**
   * 전체 차단 감지 시작
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ GlobalBlockDetector 이미 실행 중');
      return;
    }

    this.isRunning = true;
    console.log('🛡️ 전체 서비스 차단 감지 시작');
    console.log(`   - 체크 간격: ${this.checkInterval/1000}초`);
    console.log(`   - 차단 임계값: ${this.blockingThreshold*100}%`);
    console.log(`   - 최소 에이전트 수: ${this.minimumAgents}개`);

    this.intervalId = setInterval(() => {
      this.checkGlobalBlocking().catch(error => {
        console.error('❌ 전체 차단 감지 오류:', error.message);
      });
    }, this.checkInterval);
  }

  /**
   * 전체 차단 감지 중지
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 전체 서비스 차단 감지 중지');
  }

  /**
   * 전체 차단 상황 검사
   */
  async checkGlobalBlocking() {
    try {
      const recentTime = new Date(Date.now() - this.recentTimeWindow);
      
      // 최근 활성 에이전트별 차단 상황 분석
      const blockingAnalysis = await dbServiceV2.query(`
        SELECT 
          k.agent,
          COUNT(DISTINCT k.id) as total_keywords,
          COUNT(CASE WHEN k.consecutive_blocks >= 3 THEN 1 END) as high_risk_keywords,
          MAX(k.consecutive_blocks) as max_consecutive_blocks,
          AVG(k.consecutive_blocks::numeric) as avg_consecutive_blocks,
          COUNT(DISTINCT e.id) as recent_executions,
          COUNT(CASE WHEN e.final_status != 'success' THEN 1 END) as failed_executions
        FROM v2_test_keywords k
        LEFT JOIN v2_execution_logs e ON e.keyword_id = k.id AND e.started_at >= $1
        GROUP BY k.agent
        HAVING COUNT(DISTINCT k.id) >= 1
        ORDER BY avg_consecutive_blocks DESC
      `, [recentTime]);

      const agents = blockingAnalysis.rows;
      
      if (agents.length < this.minimumAgents) {
        console.log(`📊 활성 에이전트 수 부족 (${agents.length}/${this.minimumAgents}) - 전체 차단 감지 패스`);
        return;
      }

      // 차단된 에이전트 수 계산
      const blockedAgents = agents.filter(agent => {
        const failureRate = agent.recent_executions > 0 ? 
          (agent.failed_executions / agent.recent_executions) : 0;
        
        return agent.max_consecutive_blocks >= 3 || failureRate >= 0.7;
      });

      const blockingRate = blockedAgents.length / agents.length;
      
      console.log(`📊 전체 차단 상황 분석:`);
      console.log(`   - 전체 활성 에이전트: ${agents.length}개`);
      console.log(`   - 차단된 에이전트: ${blockedAgents.length}개`);
      console.log(`   - 차단 비율: ${(blockingRate * 100).toFixed(1)}%`);
      console.log(`   - 임계값: ${(this.blockingThreshold * 100).toFixed(1)}%`);

      if (blockedAgents.length > 0) {
        console.log(`🚨 차단된 에이전트 목록:`);
        blockedAgents.forEach(agent => {
          const failureRate = agent.recent_executions > 0 ? 
            ((agent.failed_executions / agent.recent_executions) * 100).toFixed(1) : '0.0';
          console.log(`   - ${agent.agent}: 최대 ${agent.max_consecutive_blocks}회 연속차단, 실패율 ${failureRate}%`);
        });
      }

      // 전체 리셋 조건 확인
      if (blockingRate >= this.blockingThreshold) {
        await this.executeGlobalReset(blockedAgents, agents);
      }

    } catch (error) {
      console.error('❌ 전체 차단 검사 실패:', error.message);
    }
  }

  /**
   * 전체 리셋 실행
   */
  async executeGlobalReset(blockedAgents, allAgents) {
    const now = Date.now();
    
    // 쿨다운 체크
    if (now - this.lastResetTime < this.resetCooldown) {
      const remainingCooldown = Math.ceil((this.resetCooldown - (now - this.lastResetTime)) / 60000);
      console.log(`⏳ 전체 리셋 쿨다운 중 (${remainingCooldown}분 남음)`);
      return;
    }

    console.log(`🚨 전체 서비스 차단 감지! 모든 유저폴더 삭제 실행`);
    console.log(`   - 차단 비율: ${((blockedAgents.length / allAgents.length) * 100).toFixed(1)}%`);
    console.log(`   - 영향 에이전트: ${blockedAgents.map(a => a.agent).join(', ')}`);

    try {
      // 1. 모든 브라우저 프로세스 종료
      await this.killAllBrowsers();

      // 2. 모든 유저 프로필 삭제
      await this.deleteAllProfiles();

      // 3. 데이터베이스 차단 상태 리셋
      await this.resetDatabaseBlocking();

      // 4. 리셋 시간 기록
      this.lastResetTime = now;

      console.log('✅ 전체 리셋 완료!');
      console.log('💡 모든 에이전트가 새로운 브라우저 프로필로 시작됩니다.');

      // 5. 리셋 로그 기록
      await this.logGlobalReset(blockedAgents, allAgents);

    } catch (error) {
      console.error('❌ 전체 리셋 실패:', error.message);
    }
  }

  /**
   * 모든 브라우저 프로세스 종료
   */
  async killAllBrowsers() {
    console.log('🔄 모든 브라우저 프로세스 종료 중...');
    
    const os = require('os');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    try {
      if (os.platform() === 'win32') {
        await execAsync('taskkill /F /IM chrome.exe /T 2>NUL', { windowsHide: true }).catch(() => {});
        await execAsync('taskkill /F /IM chromium.exe /T 2>NUL', { windowsHide: true }).catch(() => {});
        console.log('   ✅ Chrome 프로세스 모두 종료');
      }
      
      // 프로세스 정리 대기
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.log(`   ⚠️ 브라우저 종료 중 오류 (무시됨): ${error.message}`);
    }
  }

  /**
   * 모든 유저 프로필 삭제
   */
  async deleteAllProfiles() {
    console.log('🗑️ 모든 유저 프로필 삭제 중...');
    
    const browserDataPath = path.join('d:', 'dev', 'git', 'dev_coupang_chrome', 'browser-data');
    
    try {
      const profiles = await fs.readdir(browserDataPath);
      let deletedCount = 0;
      
      for (const profile of profiles) {
        const profilePath = path.join(browserDataPath, profile);
        const stats = await fs.stat(profilePath);
        
        if (stats.isDirectory()) {
          try {
            await fs.rm(profilePath, { recursive: true, force: true });
            console.log(`   ✅ ${profile} 프로필 삭제 완료`);
            deletedCount++;
          } catch (error) {
            console.log(`   ⚠️ ${profile} 삭제 실패: ${error.message}`);
          }
        }
      }
      
      console.log(`   📊 총 ${deletedCount}개 프로필 삭제 완료`);
      
    } catch (error) {
      console.error('❌ 프로필 삭제 실패:', error.message);
    }
  }

  /**
   * 데이터베이스 차단 상태 리셋
   */
  async resetDatabaseBlocking() {
    console.log('🔄 데이터베이스 차단 상태 리셋 중...');
    
    try {
      const result = await dbServiceV2.query(`
        UPDATE v2_test_keywords 
        SET consecutive_blocks = 0,
            mode_execution_count = 0,
            current_mode = 'goto',
            last_mode_change = CURRENT_TIMESTAMP,
            mode_switch_reason = 'global_reset'
        WHERE consecutive_blocks > 0
      `);
      
      console.log(`   ✅ ${result.rowCount}개 키워드 차단 상태 리셋 완료`);
      
    } catch (error) {
      console.error('❌ 데이터베이스 리셋 실패:', error.message);
    }
  }

  /**
   * 전체 리셋 로그 기록
   */
  async logGlobalReset(blockedAgents, allAgents) {
    try {
      const logData = {
        reset_time: new Date(),
        total_agents: allAgents.length,
        blocked_agents: blockedAgents.length,
        blocking_rate: (blockedAgents.length / allAgents.length * 100).toFixed(1),
        blocked_agent_list: blockedAgents.map(a => a.agent).join(','),
        trigger_reason: 'global_blocking_threshold_exceeded'
      };

      console.log('📝 전체 리셋 로그 기록:', logData);
      
      // 간단한 파일 로그 (데이터베이스 테이블 없는 경우)
      const logFile = path.join('logs', 'global_reset.log');
      await fs.mkdir('logs', { recursive: true });
      await fs.appendFile(logFile, JSON.stringify(logData) + '\n');
      
    } catch (error) {
      console.log('⚠️ 리셋 로그 기록 실패:', error.message);
    }
  }

  /**
   * 수동 전체 리셋 실행
   */
  async manualGlobalReset(reason = 'manual') {
    console.log(`🔧 수동 전체 리셋 실행: ${reason}`);
    
    // 쿨다운 무시하고 강제 실행
    this.lastResetTime = 0;
    
    const dummyBlockedAgents = [{ agent: 'manual', max_consecutive_blocks: 999 }];
    const dummyAllAgents = [{ agent: 'manual' }];
    
    await this.executeGlobalReset(dummyBlockedAgents, dummyAllAgents);
  }

  /**
   * 현재 상태 조회
   */
  async getStatus() {
    const recentTime = new Date(Date.now() - this.recentTimeWindow);
    
    const agents = await dbServiceV2.query(`
      SELECT 
        agent,
        COUNT(*) as total_keywords,
        COUNT(CASE WHEN consecutive_blocks >= 3 THEN 1 END) as high_risk_keywords,
        MAX(consecutive_blocks) as max_consecutive_blocks,
        AVG(consecutive_blocks) as avg_consecutive_blocks
      FROM v2_test_keywords k
      WHERE EXISTS (
        SELECT 1 FROM v2_execution_logs e 
        WHERE e.keyword_id = k.id 
        AND e.started_at >= $1
      )
      GROUP BY agent
    `, [recentTime]);

    const blockedAgents = agents.rows.filter(agent => agent.max_consecutive_blocks >= 3);
    const blockingRate = agents.rows.length > 0 ? blockedAgents.length / agents.rows.length : 0;

    return {
      isRunning: this.isRunning,
      totalAgents: agents.rows.length,
      blockedAgents: blockedAgents.length,
      blockingRate: (blockingRate * 100).toFixed(1),
      threshold: (this.blockingThreshold * 100).toFixed(1),
      lastResetTime: this.lastResetTime,
      cooldownRemaining: Math.max(0, Math.ceil((this.resetCooldown - (Date.now() - this.lastResetTime)) / 60000))
    };
  }
}

// 싱글톤 인스턴스
const globalBlockDetector = new GlobalBlockDetector();

module.exports = globalBlockDetector;