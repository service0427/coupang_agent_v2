/**
 * 순차 유저폴더 관리 시스템
 * - 차단 발생 시 새 폴더 생성 (browser-data/instance_0/001, 002, 003...)
 * - JSON 파일로 에이전트 상태 관리 (DB 컬럼 사용 안함)
 * - 폴더별 차단 이력 추적 및 분석
 */

const fs = require('fs').promises;
const path = require('path');

class SequentialProfileManager {
  constructor(agentName = 'instance_0') {
    this.agentName = agentName;
    this.agentBasePath = path.join('d:', 'dev', 'git', 'dev_coupang_chrome', 'browser-data', agentName);
    this.agentJsonPath = path.join(this.agentBasePath, 'agent.json');
    this.browserDataPath = 'd:\\dev\\git\\dev_coupang_chrome\\browser-data';
  }

  /**
   * 에이전트 상태 정보 로드
   */
  async loadAgentStatus() {
    try {
      const data = await fs.readFile(this.agentJsonPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // 파일이 없으면 기본 상태 생성
      return await this.initializeAgent();
    }
  }

  /**
   * 에이전트 상태 정보 저장
   */
  async saveAgentStatus(status) {
    await fs.mkdir(this.agentBasePath, { recursive: true });
    await fs.writeFile(this.agentJsonPath, JSON.stringify(status, null, 2));
  }

  /**
   * 새 에이전트 초기화
   */
  async initializeAgent() {
    console.log(`🆕 새 에이전트 초기화: ${this.agentName}`);
    
    const initialStatus = {
      agent: this.agentName,
      current_folder: '001',
      total_folders: 1,
      blocking_history: [],
      current_status: {
        folder: '001',
        created_at: new Date().toISOString(),
        executions: 0,
        consecutive_blocks: 0,
        success_count: 0,
        failure_count: 0,
        last_success: null,
        last_failure: null
      },
      statistics: {
        total_executions: 0,
        total_successes: 0,
        total_failures: 0,
        overall_success_rate: 1.0,
        average_folder_lifetime: 0,
        most_successful_folder: '001',
        longest_lasting_folder: '001'
      }
    };

    await this.saveAgentStatus(initialStatus);
    
    // 첫 번째 프로필 폴더 생성
    const firstFolderPath = path.join(this.agentBasePath, '001');
    await fs.mkdir(firstFolderPath, { recursive: true });
    
    console.log(`   ✅ 첫 번째 프로필 폴더 생성: ${firstFolderPath}`);
    
    return initialStatus;
  }

  /**
   * 현재 활성 프로필 경로 가져오기
   */
  async getCurrentProfilePath() {
    const status = await this.loadAgentStatus();
    return path.join(this.agentBasePath, status.current_folder);
  }

  /**
   * 차단 발생 시 새 폴더 생성
   */
  async handleBlocking(blockingReason = 'unknown', additionalInfo = {}) {
    console.log(`🚨 ${this.agentName} 차단 감지: ${blockingReason}`);
    
    const status = await this.loadAgentStatus();
    const currentFolder = status.current_folder;
    const currentFolderNum = parseInt(currentFolder);
    const newFolderNum = currentFolderNum + 1;
    const newFolder = newFolderNum.toString().padStart(3, '0');
    
    // 현재 폴더를 차단 이력에 추가
    const blockingRecord = {
      folder: currentFolder,
      created_at: status.current_status.created_at,
      blocked_at: new Date().toISOString(),
      blocking_reason: blockingReason,
      executions: status.current_status.executions,
      success_count: status.current_status.success_count,
      failure_count: status.current_status.failure_count,
      success_rate: status.current_status.executions > 0 ? 
        (status.current_status.success_count / status.current_status.executions).toFixed(3) : '0.000',
      consecutive_blocks: status.current_status.consecutive_blocks,
      lifetime_minutes: this.calculateLifetime(status.current_status.created_at),
      additional_info: additionalInfo
    };
    
    status.blocking_history.push(blockingRecord);
    
    // 새 폴더로 전환
    status.current_folder = newFolder;
    status.total_folders = newFolderNum;
    status.current_status = {
      folder: newFolder,
      created_at: new Date().toISOString(),
      executions: 0,
      consecutive_blocks: 0,
      success_count: 0,
      failure_count: 0,
      last_success: null,
      last_failure: null
    };
    
    // 통계 업데이트
    await this.updateStatistics(status);
    
    // 상태 저장
    await this.saveAgentStatus(status);
    
    // 새 프로필 폴더 생성
    const newFolderPath = path.join(this.agentBasePath, newFolder);
    await fs.mkdir(newFolderPath, { recursive: true });
    
    console.log(`   📁 새 프로필 폴더 생성: ${newFolderPath}`);
    console.log(`   📊 차단된 폴더 ${currentFolder}: ${blockingRecord.executions}회 실행, 성공률 ${blockingRecord.success_rate}`);
    console.log(`   ⏱️ 폴더 수명: ${blockingRecord.lifetime_minutes}분`);
    
    return {
      oldFolder: currentFolder,
      newFolder: newFolder,
      newPath: newFolderPath,
      blockingRecord: blockingRecord
    };
  }

  /**
   * 실행 결과 기록
   */
  async recordExecution(success = true, errorInfo = null) {
    const status = await this.loadAgentStatus();
    
    status.current_status.executions += 1;
    status.statistics.total_executions += 1;
    
    if (success) {
      status.current_status.success_count += 1;
      status.current_status.consecutive_blocks = 0; // 성공 시 연속 차단 리셋
      status.current_status.last_success = new Date().toISOString();
      status.statistics.total_successes += 1;
    } else {
      status.current_status.failure_count += 1;
      status.current_status.consecutive_blocks += 1;
      status.current_status.last_failure = new Date().toISOString();
      status.statistics.total_failures += 1;
    }
    
    // 성공률 계산
    status.statistics.overall_success_rate = status.statistics.total_executions > 0 ?
      (status.statistics.total_successes / status.statistics.total_executions).toFixed(3) : '1.000';
    
    await this.saveAgentStatus(status);
    
    // 자동 차단 감지 (5회 연속 실패 시)
    if (status.current_status.consecutive_blocks >= 5) {
      console.log(`⚠️ ${this.agentName} 연속 ${status.current_status.consecutive_blocks}회 차단 감지`);
      const blockingInfo = {
        trigger: 'consecutive_blocks',
        count: status.current_status.consecutive_blocks,
        error_info: errorInfo
      };
      
      return await this.handleBlocking('consecutive_blocks_5', blockingInfo);
    }
    
    return null; // 차단 없음
  }

  /**
   * 폴더 수명 계산 (분 단위)
   */
  calculateLifetime(createdAt) {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now - created) / (1000 * 60));
  }

  /**
   * 통계 업데이트
   */
  async updateStatistics(status) {
    if (status.blocking_history.length === 0) return;
    
    // 평균 폴더 수명 계산
    const lifetimes = status.blocking_history.map(h => h.lifetime_minutes);
    status.statistics.average_folder_lifetime = lifetimes.length > 0 ?
      Math.round(lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length) : 0;
    
    // 가장 성공적인 폴더 찾기
    const bestFolder = status.blocking_history.reduce((best, current) => {
      return parseFloat(current.success_rate) > parseFloat(best.success_rate) ? current : best;
    }, status.blocking_history[0]);
    status.statistics.most_successful_folder = bestFolder.folder;
    
    // 가장 오래 지속된 폴더 찾기
    const longestFolder = status.blocking_history.reduce((longest, current) => {
      return current.lifetime_minutes > longest.lifetime_minutes ? current : longest;
    }, status.blocking_history[0]);
    status.statistics.longest_lasting_folder = longestFolder.folder;
  }

  /**
   * 에이전트 상태 조회
   */
  async getStatus() {
    const status = await this.loadAgentStatus();
    const currentPath = await this.getCurrentProfilePath();
    
    return {
      agent: status.agent,
      current_folder: status.current_folder,
      current_path: currentPath,
      total_folders: status.total_folders,
      current_executions: status.current_status.executions,
      current_consecutive_blocks: status.current_status.consecutive_blocks,
      current_success_rate: status.current_status.executions > 0 ?
        (status.current_status.success_count / status.current_status.executions * 100).toFixed(1) : '100.0',
      overall_success_rate: (parseFloat(status.statistics.overall_success_rate) * 100).toFixed(1),
      total_executions: status.statistics.total_executions,
      folder_history_count: status.blocking_history.length,
      average_folder_lifetime: status.statistics.average_folder_lifetime,
      most_successful_folder: status.statistics.most_successful_folder,
      longest_lasting_folder: status.statistics.longest_lasting_folder
    };
  }

  /**
   * 차단 이력 조회
   */
  async getBlockingHistory() {
    const status = await this.loadAgentStatus();
    return status.blocking_history;
  }

  /**
   * 수동 폴더 전환 (테스트용)
   */
  async manualSwitchFolder(reason = 'manual') {
    console.log(`🔧 ${this.agentName} 수동 폴더 전환: ${reason}`);
    return await this.handleBlocking(reason, { trigger: 'manual' });
  }

  /**
   * 전체 에이전트 상태 조회 (정적 메서드)
   */
  static async getAllAgents() {
    const browserDataPath = 'd:\\dev\\git\\dev_coupang_chrome\\browser-data';
    
    try {
      const agents = [];
      const entries = await fs.readdir(browserDataPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const agentPath = path.join(browserDataPath, entry.name);
          const jsonPath = path.join(agentPath, 'agent.json');
          
          try {
            const data = await fs.readFile(jsonPath, 'utf8');
            const agentData = JSON.parse(data);
            agents.push(agentData);
          } catch (e) {
            // agent.json이 없으면 스킵
            continue;
          }
        }
      }
      
      return agents;
    } catch (error) {
      console.error('❌ 전체 에이전트 조회 실패:', error.message);
      return [];
    }
  }
}

module.exports = SequentialProfileManager;