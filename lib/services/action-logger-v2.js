/**
 * 향상된 액션 로그 기록 모듈
 * - 상태 기반 액션 추적
 * - 상태 전환 검증
 * - 자동 타이밍 측정
 */

const dbServiceV2 = require('./db-service-v2');
const { 
  ActionStatus, 
  ActionType, 
  ProcessStep, 
  ErrorLevel,
  isValidTransition,
  isSuccessStatus,
  isErrorStatus 
} = require('../constants/action-status');

class ActionLoggerV2 {
  constructor(executionId, sessionId) {
    this.executionId = executionId;
    this.sessionId = sessionId;
    this.actionSequence = 0;
    this.activeActions = new Map(); // 진행 중인 액션들
    this.actionHistory = [];
    this.currentActionId = null; // 현재 진행 중인 액션 ID
  }

  /**
   * 현재 액션의 데이터베이스 ID 반환
   */
  getCurrentActionDbId() {
    if (!this.currentActionId) return null;
    const action = this.activeActions.get(this.currentActionId);
    return action?.dbId || null;
  }

  /**
   * 액션 시작 - 상태 기반
   */
  async startAction(actionType, actionTarget, options = {}) {
    this.actionSequence++;
    const actionId = `action_${this.executionId}_${this.actionSequence}`;
    const startTime = Date.now();
    
    const action = {
      id: actionId,
      sequence: this.actionSequence,
      type: actionType,
      target: actionTarget,
      status: ActionStatus.INIT,
      processStep: options.processStep || this.determineProcessStep(actionType),
      startTime,
      statusHistory: [{
        status: ActionStatus.INIT,
        timestamp: startTime,
        duration: 0
      }],
      detail: options.detail || {},
      metrics: {
        retryCount: 0,
        networkRequests: 0,
        domMutations: 0
      }
    };
    
    this.activeActions.set(actionId, action);
    this.currentActionId = actionId; // 현재 액션 ID로 설정
    
    // DB에 초기 상태 기록
    try {
      const dbActionId = await dbServiceV2.logActionV2(
        this.executionId,
        this.sessionId,
        {
          actionSeq: this.actionSequence,
          actionType,
          actionTarget,
          actionDetail: {
            ...options.detail,
            status: ActionStatus.INIT,
            processStep: action.processStep
          },
          processStep: action.processStep
        }
      );
      
      action.dbId = dbActionId;
      
      // 자동으로 PENDING 상태로 전환
      await this.updateActionStatus(actionId, ActionStatus.PENDING, {}, true);
      
      console.log(`\n🎯 [${this.actionSequence}] ${actionType}: ${actionTarget}`);
      console.log(`   └─ 상태: ${ActionStatus.INIT} → ${ActionStatus.PENDING}`);
      
    } catch (error) {
      console.error('액션 시작 로그 실패:', error);
      action.error = error;
    }
    
    return actionId;
  }

  /**
   * 액션 상태 업데이트
   */
  async updateActionStatus(actionId, newStatus, data = {}, forceTransition = false) {
    const action = this.activeActions.get(actionId);
    if (!action) {
      console.error(`액션을 찾을 수 없음: ${actionId}`);
      return false;
    }
    
    // undefined 상태 체크
    if (!newStatus || newStatus === 'undefined') {
      console.warn(`⚠️  잘못된 상태 값: ${newStatus} (actionId: ${actionId})`);
      return false;
    }
    
    const currentStatus = action.status;
    const timestamp = Date.now();
    
    // 상태 전환 유효성 검사
    if (!forceTransition && !isValidTransition(currentStatus, newStatus)) {
      // 개발 단계에서는 유연한 전환 허용, 로그 레벨도 낮춤
      if (!this.isFlexibleTransition(currentStatus, newStatus)) {
        console.warn(`⚠️  잘못된 상태 전환: ${currentStatus} → ${newStatus}`);
        return false;
      }
      // 유연한 전환의 경우 디버그 레벨로만 출력
      // console.debug(`🔀 유연한 상태 전환: ${currentStatus} → ${newStatus}`);
    }
    
    // 이전 상태의 지속 시간 계산
    const lastStatusEntry = action.statusHistory[action.statusHistory.length - 1];
    lastStatusEntry.duration = timestamp - lastStatusEntry.timestamp;
    
    // 새 상태 기록
    action.status = newStatus;
    action.statusHistory.push({
      status: newStatus,
      timestamp,
      duration: 0,
      data
    });
    
    // 상태별 추가 처리
    await this.handleStatusChange(action, newStatus, data);
    
    // 로그 출력
    const statusIcon = this.getStatusIcon(newStatus);
    console.log(`   ${statusIcon} 상태: ${currentStatus} → ${newStatus} (${lastStatusEntry.duration}ms)`);
    
    if (data.message) {
      console.log(`   └─ ${data.message}`);
    }
    
    return true;
  }

  /**
   * 상태 변경 처리
   */
  async handleStatusChange(action, newStatus, data) {
    switch (newStatus) {
      case ActionStatus.STARTED:
        action.actualStartTime = Date.now();
        break;
        
      case ActionStatus.DOM_READY:
        action.metrics.domReadyTime = Date.now() - action.actualStartTime;
        break;
        
      case ActionStatus.LOADED:
        action.metrics.loadCompleteTime = Date.now() - action.actualStartTime;
        break;
        
      case ActionStatus.ELEMENT_FOUND:
        action.metrics.elementFoundTime = Date.now() - action.actualStartTime;
        break;
        
      case ActionStatus.SUCCESS:
      case ActionStatus.PARTIAL_SUCCESS:
        await this.completeAction(action.id, {
          success: true,
          partialSuccess: newStatus === ActionStatus.PARTIAL_SUCCESS,
          ...data
        });
        break;
        
      default:
        if (isErrorStatus(newStatus)) {
          await this.completeAction(action.id, {
            success: false,
            errorType: newStatus,
            errorMessage: data.message || `액션 실패: ${newStatus}`,
            ...data
          });
        }
    }
  }

  /**
   * 액션 완료
   */
  async completeAction(actionId, result) {
    const action = this.activeActions.get(actionId);
    if (!action) return;
    
    const endTime = Date.now();
    const totalDuration = endTime - action.startTime;
    
    // 최종 상태 업데이트
    if (!isSuccessStatus(action.status) && !isErrorStatus(action.status)) {
      // 명시적인 완료 상태가 없으면 결과에 따라 설정
      const finalStatus = result.success ? ActionStatus.SUCCESS : ActionStatus.ERROR_UNKNOWN;
      await this.updateActionStatus(actionId, finalStatus, result);
    }
    
    // 액션 히스토리에 추가
    this.actionHistory.push({
      ...action,
      endTime,
      totalDuration,
      result
    });
    
    // 활성 액션에서 제거
    this.activeActions.delete(actionId);
    
    // 현재 액션이었다면 리셋
    if (this.currentActionId === actionId) {
      this.currentActionId = null;
    }
    
    // DB 업데이트 (TODO: db-service-v2에 updateAction 메서드 추가 필요)
    try {
      // 상태 요약 생성
      const statusSummary = this.generateStatusSummary(action);
      
      const updateData = {
        success: result.success,
        errorType: result.errorType,
        errorMessage: result.errorMessage,
        duration_ms: totalDuration,
        dom_ready_ms: action.metrics.domReadyTime,
        load_complete_ms: action.metrics.loadCompleteTime,
        current_url: result.currentUrl,
        page_title: result.pageTitle,
        element_visible: result.elementVisible,
        element_clickable: result.elementClickable,
        completed_at: new Date(endTime),
        action_detail: {
          ...action.detail,
          statusHistory: action.statusHistory,
          metrics: action.metrics,
          statusSummary
        }
      };
      
      // await dbServiceV2.updateActionV2(action.dbId, updateData);
      
    } catch (error) {
      console.error('액션 완료 업데이트 실패:', error);
    }
    
    // 완료 로그
    const statusIcon = result.success ? '✅' : '❌';
    console.log(`   ${statusIcon} 액션 완료 (${totalDuration}ms)`);
    if (action.statusHistory.length > 2) {
      console.log(`   └─ 상태 전환: ${this.generateStatusPath(action)}`);
    }
  }

  /**
   * 상태 요약 생성
   */
  generateStatusSummary(action) {
    const summary = {
      totalStates: action.statusHistory.length,
      timeInStates: {},
      criticalPath: []
    };
    
    // 각 상태별 시간 계산
    action.statusHistory.forEach(entry => {
      if (!summary.timeInStates[entry.status]) {
        summary.timeInStates[entry.status] = 0;
      }
      summary.timeInStates[entry.status] += entry.duration;
      
      // 주요 상태만 critical path에 포함
      if ([
        ActionStatus.STARTED,
        ActionStatus.DOM_READY,
        ActionStatus.LOADED,
        ActionStatus.ELEMENT_FOUND,
        ActionStatus.CLICKED,
        ActionStatus.SUCCESS,
        ActionStatus.PARTIAL_SUCCESS
      ].includes(entry.status) || isErrorStatus(entry.status)) {
        summary.criticalPath.push({
          status: entry.status,
          timestamp: entry.timestamp,
          duration: entry.duration
        });
      }
    });
    
    return summary;
  }

  /**
   * 상태 경로 생성
   */
  generateStatusPath(action) {
    return action.statusHistory
      .map(entry => entry.status)
      .join(' → ');
  }

  /**
   * 프로세스 단계 결정
   */
  determineProcessStep(actionType) {
    const stepMap = {
      [ActionType.NAVIGATE]: ProcessStep.NAVIGATION,
      [ActionType.SEARCH_INPUT]: ProcessStep.SEARCH,
      [ActionType.SEARCH_SUBMIT]: ProcessStep.SEARCH,
      [ActionType.PRODUCT_SEARCH]: ProcessStep.FIND_PRODUCT,
      [ActionType.PRODUCT_CLICK]: ProcessStep.CLICK_PRODUCT,
      [ActionType.CART_CLICK]: ProcessStep.ADD_CART,
      [ActionType.WAIT_NAVIGATION]: ProcessStep.WAIT,
      [ActionType.WAIT_SELECTOR]: ProcessStep.WAIT
    };
    
    return stepMap[actionType] || ProcessStep.INITIALIZATION;
  }

  /**
   * 상태 아이콘 가져오기
   */
  getStatusIcon(status) {
    const iconMap = {
      [ActionStatus.INIT]: '🔄',
      [ActionStatus.PENDING]: '⏳',
      [ActionStatus.STARTED]: '▶️',
      [ActionStatus.NAVIGATING]: '🚀',
      [ActionStatus.DOM_READY]: '📄',
      [ActionStatus.LOADED]: '✓',
      [ActionStatus.ELEMENT_FOUND]: '🎯',
      [ActionStatus.CLICKING]: '👆',
      [ActionStatus.SUCCESS]: '✅',
      [ActionStatus.PARTIAL_SUCCESS]: '⚠️',
      [ActionStatus.ERROR_TIMEOUT]: '⏱️',
      [ActionStatus.ERROR_BLOCKED]: '🚫',
      [ActionStatus.ERROR_CRITICAL]: '💥'
    };
    
    return iconMap[status] || '•';
  }

  /**
   * 특화된 액션 메서드들
   */
  async logNavigation(url, options = {}) {
    const actionId = await this.startAction(ActionType.NAVIGATE, url, {
      ...options,
      processStep: ProcessStep.NAVIGATION
    });
    
    // 자동으로 STARTED 상태로
    await this.updateActionStatus(actionId, ActionStatus.STARTED, {}, true);
    await this.updateActionStatus(actionId, ActionStatus.NAVIGATING, {}, true);
    
    return actionId;
  }

  async logClick(selector, options = {}) {
    const actionId = await this.startAction(ActionType.CLICK, selector, options);
    await this.updateActionStatus(actionId, ActionStatus.STARTED, {}, true);
    await this.updateActionStatus(actionId, ActionStatus.ELEMENT_WAITING, {}, true);
    
    return actionId;
  }

  async logProductSearch(keyword, options = {}) {
    const actionId = await this.startAction(ActionType.PRODUCT_SEARCH, keyword, {
      ...options,
      processStep: ProcessStep.FIND_PRODUCT
    });
    
    await this.updateActionStatus(actionId, ActionStatus.STARTED, {}, true);
    
    return actionId;
  }

  /**
   * 페이지 로드 상태 추적
   */
  async trackPageLoad(actionId, page) {
    try {
      // DOM 상호작용 가능
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      await this.updateActionStatus(actionId, ActionStatus.DOM_READY);
      
      // 페이지 완전 로드
      await page.waitForLoadState('load', { timeout: 10000 });
      await this.updateActionStatus(actionId, ActionStatus.LOADED);
      
      // 네트워크 유휴 상태
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      await this.updateActionStatus(actionId, ActionStatus.NETWORK_IDLE);
      
      return true;
    } catch (error) {
      if (error.name === 'TimeoutError') {
        await this.updateActionStatus(actionId, ActionStatus.ERROR_TIMEOUT, {
          message: '페이지 로드 타임아웃'
        });
      }
      return false;
    }
  }

  /**
   * 요소 상태 추적
   */
  async trackElement(actionId, page, selector) {
    try {
      // 요소 찾기
      const element = await page.waitForSelector(selector, { timeout: 5000 });
      if (!element) {
        await this.updateActionStatus(actionId, ActionStatus.ELEMENT_NOT_FOUND);
        return null;
      }
      
      await this.updateActionStatus(actionId, ActionStatus.ELEMENT_FOUND);
      
      // 요소 가시성 확인
      const isVisible = await element.isVisible();
      if (isVisible) {
        await this.updateActionStatus(actionId, ActionStatus.ELEMENT_VISIBLE);
      }
      
      // 요소 클릭 가능 확인
      const isEnabled = await element.isEnabled();
      if (isEnabled && isVisible) {
        await this.updateActionStatus(actionId, ActionStatus.ELEMENT_CLICKABLE);
      }
      
      return element;
    } catch (error) {
      await this.updateActionStatus(actionId, ActionStatus.ERROR_ELEMENT, {
        message: `요소를 찾을 수 없음: ${selector}`
      });
      return null;
    }
  }

  /**
   * 유연한 상태 전환 허용 여부 체크
   */
  isFlexibleTransition(fromStatus, toStatus) {
    // 개발/테스트 단계에서 허용할 전환들
    const flexibleTransitions = [
      // INIT에서 모든 상태로의 전환 허용 (테스트용)
      { from: ActionStatus.INIT, to: ActionStatus.STARTED },
      { from: ActionStatus.INIT, to: ActionStatus.NAVIGATING },
      { from: ActionStatus.INIT, to: ActionStatus.DOM_READY },
      { from: ActionStatus.INIT, to: ActionStatus.LOADED },
      { from: ActionStatus.INIT, to: ActionStatus.ELEMENT_WAITING },
      { from: ActionStatus.INIT, to: ActionStatus.ELEMENT_FOUND },
      { from: ActionStatus.INIT, to: ActionStatus.ELEMENT_VISIBLE },
      { from: ActionStatus.INIT, to: ActionStatus.ELEMENT_CLICKABLE },
      { from: ActionStatus.INIT, to: ActionStatus.CLICKING },
      { from: ActionStatus.INIT, to: ActionStatus.CLICKED },
      { from: ActionStatus.INIT, to: ActionStatus.SUCCESS },
      { from: ActionStatus.INIT, to: ActionStatus.ERROR_TIMEOUT },
      { from: ActionStatus.INIT, to: ActionStatus.ERROR_UNKNOWN },
      
      // PENDING에서 모든 상태로의 전환 허용
      { from: ActionStatus.PENDING, to: ActionStatus.STARTED },
      { from: ActionStatus.PENDING, to: ActionStatus.NAVIGATING },
      { from: ActionStatus.PENDING, to: ActionStatus.DOM_READY },
      { from: ActionStatus.PENDING, to: ActionStatus.LOADED },
      { from: ActionStatus.PENDING, to: ActionStatus.ELEMENT_WAITING },
      { from: ActionStatus.PENDING, to: ActionStatus.ELEMENT_FOUND },
      { from: ActionStatus.PENDING, to: ActionStatus.ELEMENT_VISIBLE },
      { from: ActionStatus.PENDING, to: ActionStatus.ELEMENT_CLICKABLE },
      { from: ActionStatus.PENDING, to: ActionStatus.CLICKING },
      { from: ActionStatus.PENDING, to: ActionStatus.CLICKED },
      { from: ActionStatus.PENDING, to: ActionStatus.SUCCESS },
      { from: ActionStatus.PENDING, to: ActionStatus.ERROR_TIMEOUT },
      { from: ActionStatus.PENDING, to: ActionStatus.ERROR_UNKNOWN },
      
      // 오류 상태에서 성공으로의 전환 허용
      { from: ActionStatus.ERROR_TIMEOUT, to: ActionStatus.SUCCESS },
      { from: ActionStatus.ERROR_ELEMENT, to: ActionStatus.SUCCESS }
    ];
    
    return flexibleTransitions.some(transition => 
      transition.from === fromStatus && transition.to === toStatus
    );
  }

  /**
   * 현재 진행 중인 액션 상태
   */
  getActiveActions() {
    return Array.from(this.activeActions.values()).map(action => ({
      id: action.id,
      type: action.type,
      target: action.target,
      status: action.status,
      duration: Date.now() - action.startTime,
      processStep: action.processStep
    }));
  }

  /**
   * 액션 통계
   */
  getStatistics() {
    const stats = {
      totalActions: this.actionHistory.length,
      activeActions: this.activeActions.size,
      successCount: 0,
      partialSuccessCount: 0,
      errorCount: 0,
      averageDuration: 0,
      statusDistribution: {},
      errorTypes: {}
    };
    
    let totalDuration = 0;
    
    this.actionHistory.forEach(action => {
      if (action.status === ActionStatus.SUCCESS) stats.successCount++;
      else if (action.status === ActionStatus.PARTIAL_SUCCESS) stats.partialSuccessCount++;
      else if (isErrorStatus(action.status)) {
        stats.errorCount++;
        stats.errorTypes[action.status] = (stats.errorTypes[action.status] || 0) + 1;
      }
      
      totalDuration += action.totalDuration;
      
      // 상태 분포
      action.statusHistory.forEach(entry => {
        stats.statusDistribution[entry.status] = 
          (stats.statusDistribution[entry.status] || 0) + 1;
      });
    });
    
    if (stats.totalActions > 0) {
      stats.averageDuration = Math.round(totalDuration / stats.totalActions);
    }
    
    return stats;
  }
}

module.exports = ActionLoggerV2;