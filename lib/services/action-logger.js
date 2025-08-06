/**
 * 액션 로그 기록 모듈
 * - 브라우저 액션을 상세히 기록
 * - 성능 메트릭 수집
 * - UI 상태 추적
 */

const dbServiceV2 = require('./db-service-v2');

class ActionLogger {
  constructor(executionId, sessionId) {
    this.executionId = executionId;
    this.sessionId = sessionId;
    this.actionSequence = 0;
    this.currentActionId = null;
  }

  /**
   * 액션 시작
   */
  async startAction(actionType, actionTarget, actionDetail = null) {
    this.actionSequence++;
    const startTime = Date.now();
    
    const actionData = {
      actionSeq: this.actionSequence,
      actionType,
      actionTarget,
      actionDetail,
      processStep: this.getProcessStep(actionType),
      started_at: new Date()
    };
    
    try {
      // 액션 로그 시작
      this.currentActionId = await dbServiceV2.logActionV2(
        this.executionId,
        this.sessionId,
        actionData
      );
      
      console.log(`\n🎯 [${this.actionSequence}] ${actionType}: ${actionTarget}`);
      
      return {
        actionId: this.currentActionId,
        startTime
      };
    } catch (error) {
      console.error('액션 시작 로그 실패:', error);
      return { actionId: null, startTime };
    }
  }

  /**
   * 액션 완료
   */
  async completeAction(actionId, result) {
    if (!actionId) return;
    
    const {
      success = false,
      errorType = null,
      errorMessage = null,
      currentUrl = null,
      pageTitle = null,
      domReadyMs = null,
      loadCompleteMs = null,
      elementVisible = null,
      elementClickable = null,
      elementSelector = null,
      elementText = null,
      screenshotPath = null,
      domSnapshot = null,
      duration = null
    } = result;
    
    try {
      // 액션 결과 업데이트
      const updateData = {
        success,
        errorType,
        errorMessage,
        currentUrl,
        pageTitle,
        domReadyMs,
        loadCompleteMs,
        elementVisible,
        elementClickable,
        elementSelector,
        elementText,
        screenshotPath,
        domSnapshot,
        durationMs: duration,
        completed_at: new Date()
      };
      
      // TODO: dbServiceV2에 액션 업데이트 메서드 추가 필요
      // await dbServiceV2.updateActionV2(actionId, updateData);
      
      const statusIcon = success ? '✅' : '❌';
      const durationText = duration ? ` (${duration}ms)` : '';
      console.log(`   ${statusIcon} 액션 완료${durationText}`);
      
      if (!success && errorMessage) {
        console.log(`   └─ 오류: ${errorMessage}`);
      }
    } catch (error) {
      console.error('액션 완료 로그 실패:', error);
    }
  }

  /**
   * 네비게이션 액션 로그
   */
  async logNavigation(url, options = {}) {
    const action = await this.startAction('navigate', url, options);
    return action;
  }

  /**
   * 클릭 액션 로그
   */
  async logClick(selector, options = {}) {
    const actionDetail = {
      selector,
      ...options
    };
    
    const action = await this.startAction('click', selector, actionDetail);
    return action;
  }

  /**
   * 입력 액션 로그
   */
  async logInput(selector, value, options = {}) {
    const actionDetail = {
      selector,
      value,
      ...options
    };
    
    const action = await this.startAction('input', selector, actionDetail);
    return action;
  }

  /**
   * 대기 액션 로그
   */
  async logWait(target, options = {}) {
    const actionDetail = {
      waitType: options.waitType || 'selector',
      timeout: options.timeout,
      ...options
    };
    
    const action = await this.startAction('wait', target, actionDetail);
    return action;
  }

  /**
   * 스크롤 액션 로그
   */
  async logScroll(target, options = {}) {
    const actionDetail = {
      scrollTo: target,
      ...options
    };
    
    const action = await this.startAction('scroll', target, actionDetail);
    return action;
  }

  /**
   * 페이지 평가 액션 로그
   */
  async logEvaluate(description, code = null) {
    const actionDetail = {
      description,
      codeSnippet: code ? code.substring(0, 200) : null
    };
    
    const action = await this.startAction('evaluate', description, actionDetail);
    return action;
  }

  /**
   * 프로세스 단계 결정
   */
  getProcessStep(actionType) {
    const stepMap = {
      'navigate': 'navigation',
      'search_input': 'search',
      'click': 'interaction',
      'input': 'interaction',
      'wait': 'waiting',
      'scroll': 'interaction',
      'evaluate': 'analysis',
      'cart_click': 'checkout'
    };
    
    return stepMap[actionType] || 'other';
  }

  /**
   * 페이지 상태 캡처
   */
  async capturePageState(page) {
    try {
      const state = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          scrollY: window.scrollY,
          hasActiveElement: !!document.activeElement,
          activeElementTag: document.activeElement ? document.activeElement.tagName : null
        };
      });
      
      return state;
    } catch (error) {
      console.error('페이지 상태 캡처 실패:', error);
      return null;
    }
  }

  /**
   * 요소 상태 캡처
   */
  async captureElementState(page, selector) {
    try {
      const state = await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (!element) return null;
        
        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        
        return {
          found: true,
          visible: rect.width > 0 && rect.height > 0,
          inViewport: rect.top >= 0 && rect.left >= 0 && 
                      rect.bottom <= window.innerHeight && 
                      rect.right <= window.innerWidth,
          position: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          },
          display: styles.display,
          visibility: styles.visibility,
          opacity: styles.opacity,
          disabled: element.disabled || false,
          text: element.textContent ? element.textContent.substring(0, 100) : null,
          tagName: element.tagName,
          type: element.type || null,
          href: element.href || null
        };
      }, selector);
      
      return state;
    } catch (error) {
      console.error('요소 상태 캡처 실패:', error);
      return null;
    }
  }

  /**
   * 성능 메트릭 캡처
   */
  async capturePerformanceMetrics(page) {
    try {
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        if (!navigation) return null;
        
        return {
          domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart),
          loadComplete: Math.round(navigation.loadEventEnd - navigation.loadEventStart),
          domInteractive: Math.round(navigation.domInteractive - navigation.fetchStart),
          firstPaint: Math.round(navigation.responseEnd - navigation.fetchStart),
          resourceCount: performance.getEntriesByType('resource').length
        };
      });
      
      return metrics;
    } catch (error) {
      console.error('성능 메트릭 캡처 실패:', error);
      return null;
    }
  }

  /**
   * 콘솔 로그 수집 시작
   */
  startConsoleCapture(page) {
    const logs = [];
    
    page.on('console', msg => {
      logs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
      
      // 최근 100개만 유지
      if (logs.length > 100) {
        logs.shift();
      }
    });
    
    return logs;
  }

  /**
   * 스크린샷 캡처
   */
  async captureScreenshot(page, options = {}) {
    try {
      const screenshotOptions = {
        type: 'jpeg',
        quality: 70,
        fullPage: false,
        ...options
      };
      
      const screenshot = await page.screenshot(screenshotOptions);
      return screenshot.toString('base64');
    } catch (error) {
      console.error('스크린샷 캡처 실패:', error);
      return null;
    }
  }
}

module.exports = ActionLogger;