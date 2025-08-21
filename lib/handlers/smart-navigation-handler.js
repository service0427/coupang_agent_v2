/**
 * 스마트 네비게이션 핸들러
 * 페이지 이동 오류를 지능적으로 처리하고 상품 발견 페이지를 추적
 */

class SmartNavigationHandler {
  constructor(page, logger) {
    this.page = page;
    this.logger = logger; // V2ExecutionLogger 인스턴스
    this.navigationHistory = [];
    this.currentPage = 1;
    this.productFinderResults = [];
  }

  /**
   * 상품 검색 페이지 네비게이션 시작
   */
  async startProductSearch(targetProductCode) {
    this.targetProductCode = targetProductCode;
    this.navigationHistory = [];
    this.currentPage = 1;
    this.productFinderResults = [];
    
    console.log(`🔍 [Smart Nav] 상품 검색 시작: ${targetProductCode}`);
  }

  /**
   * 페이지별 상품 검색 및 추적
   */
  async searchProductsOnPage(pageNumber) {
    this.currentPage = pageNumber;
    
    const pageStartTime = Date.now();
    const navigationResult = {
      pageNumber: pageNumber,
      loadStartTime: pageStartTime,
      loadSuccess: false,
      productCount: 0,
      targetFound: false,
      targetPosition: null,
      loadDuration: 0,
      error: null
    };

    try {
      console.log(`📄 [Smart Nav] ${pageNumber}페이지 검색 중...`);

      // 페이지 로드 대기 (최대 10초)
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      navigationResult.loadSuccess = true;
      navigationResult.loadDuration = Date.now() - pageStartTime;

      // 상품 목록 요소 찾기
      const productElements = await this.page.$$('.search-product');
      navigationResult.productCount = productElements.length;

      console.log(`   📦 ${pageNumber}페이지에서 ${productElements.length}개 상품 발견`);

      // 각 상품의 data-product-id 확인
      for (let i = 0; i < productElements.length; i++) {
        const element = productElements[i];
        
        try {
          const productId = await element.getAttribute('data-product-id');
          const isTarget = productId === this.targetProductCode;
          
          if (isTarget) {
            navigationResult.targetFound = true;
            navigationResult.targetPosition = i + 1; // 1-based index
            
            console.log(`🎯 [Smart Nav] 타겟 상품 발견! ${pageNumber}페이지 ${i + 1}번째 위치`);
            
            // 로거에 성공 기록
            if (this.logger) {
              await this.logger.completeStage2Success({
                pagesSearched: pageNumber,
                foundPage: pageNumber,
                rank: i + 1,
                totalProducts: this.getTotalProductCount()
              });
            }
            
            this.navigationHistory.push(navigationResult);
            return {
              found: true,
              page: pageNumber,
              position: i + 1,
              element: element,
              totalPages: pageNumber,
              navigationHistory: this.navigationHistory
            };
          }
        } catch (elementError) {
          console.warn(`⚠️  [Smart Nav] 상품 요소 처리 오류 (${i + 1}번째):`, elementError.message);
        }
      }

      this.navigationHistory.push(navigationResult);

      // 이 페이지에서 찾지 못함 - 다음 페이지로
      if (pageNumber < 10) {
        console.log(`   ➡️  ${pageNumber}페이지에서 미발견, 다음 페이지로 이동`);
        
        // 다음 페이지 버튼 클릭
        const nextPageResult = await this.navigateToNextPage(pageNumber);
        if (nextPageResult.success) {
          return await this.searchProductsOnPage(pageNumber + 1);
        } else {
          // 페이지 이동 실패
          navigationResult.error = nextPageResult.error;
          this.navigationHistory.push(navigationResult);
          
          if (this.logger) {
            await this.logger.completeStage2Failed({
              pagesSearched: pageNumber,
              totalProducts: this.getTotalProductCount()
            }, `페이지 네비게이션 실패: ${nextPageResult.error}`);
          }
          
          return {
            found: false,
            error: `페이지 ${pageNumber + 1} 이동 실패: ${nextPageResult.error}`,
            totalPages: pageNumber,
            navigationHistory: this.navigationHistory
          };
        }
      } else {
        // 10페이지까지 검색했지만 찾지 못함
        if (this.logger) {
          await this.logger.completeStage2Failed({
            pagesSearched: 10,
            totalProducts: this.getTotalProductCount()
          }, `10페이지까지 검색했지만 상품을 찾을 수 없음`);
        }
        
        return {
          found: false,
          error: '10페이지까지 검색했지만 상품을 찾을 수 없습니다',
          totalPages: 10,
          navigationHistory: this.navigationHistory
        };
      }

    } catch (error) {
      navigationResult.loadSuccess = false;
      navigationResult.error = error.message;
      navigationResult.loadDuration = Date.now() - pageStartTime;
      
      console.error(`❌ [Smart Nav] ${pageNumber}페이지 로드 실패:`, error.message);
      
      this.navigationHistory.push(navigationResult);
      
      if (this.logger) {
        await this.logger.completeStage2Failed({
          pagesSearched: pageNumber,
          totalProducts: this.getTotalProductCount()
        }, `페이지 ${pageNumber} 로드 오류: ${error.message}`);
      }
      
      return {
        found: false,
        error: `페이지 ${pageNumber} 로드 오류: ${error.message}`,
        totalPages: pageNumber - 1,
        navigationHistory: this.navigationHistory
      };
    }
  }

  /**
   * 다음 페이지로 이동
   */
  async navigateToNextPage(currentPageNumber) {
    const nextPageNumber = currentPageNumber + 1;
    
    try {
      console.log(`   🔄 [Smart Nav] ${nextPageNumber}페이지로 이동 중...`);

      // 다음 페이지 링크 찾기 (여러 가능한 셀렉터 시도)
      const nextPageSelectors = [
        `a[aria-label="${nextPageNumber}페이지"]`,
        `a[data-page="${nextPageNumber}"]`,
        `.pagination a:has-text("${nextPageNumber}")`,
        '.pagination .page-next',
        '.pagination-next'
      ];

      let nextPageElement = null;
      for (const selector of nextPageSelectors) {
        try {
          nextPageElement = await this.page.waitForSelector(selector, { 
            timeout: 2000, 
            state: 'visible' 
          });
          
          if (nextPageElement) {
            console.log(`   ✓ 다음 페이지 버튼 발견: ${selector}`);
            break;
          }
        } catch (e) {
          // 이 셀렉터로는 찾을 수 없음, 다음 시도
        }
      }

      if (!nextPageElement) {
        return {
          success: false,
          error: `${nextPageNumber}페이지 버튼을 찾을 수 없음`
        };
      }

      // 페이지 이동 전 URL 기록
      const beforeUrl = this.page.url();
      
      // 클릭 및 대기
      await Promise.all([
        this.page.waitForURL(url => url !== beforeUrl, { timeout: 10000 }),
        nextPageElement.click()
      ]);

      // 페이지 로드 완료 대기
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      const afterUrl = this.page.url();
      console.log(`   ✅ ${nextPageNumber}페이지 이동 완료: ${afterUrl}`);
      
      return {
        success: true,
        url: afterUrl,
        pageNumber: nextPageNumber
      };

    } catch (error) {
      console.error(`   ❌ ${nextPageNumber}페이지 이동 실패:`, error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 스마트 상품 클릭 (재시도 로직 포함)
   */
  async smartProductClick(productElement, productInfo) {
    const maxAttempts = 3;
    let attemptCount = 0;
    
    if (this.logger) {
      this.logger.startStage3();
    }

    while (attemptCount < maxAttempts) {
      attemptCount++;
      
      try {
        console.log(`🖱️  [Smart Nav] 상품 클릭 시도 ${attemptCount}/${maxAttempts}`);

        const beforeUrl = this.page.url();
        
        // 요소 표시 및 클릭 가능 상태 확인
        await productElement.waitFor({ state: 'visible', timeout: 5000 });
        
        // 스크롤해서 요소를 보이게 하기
        await productElement.scrollIntoViewIfNeeded();
        await this.page.waitForTimeout(500);

        // 클릭 실행 및 네비게이션 대기
        await Promise.all([
          this.page.waitForURL(url => url !== beforeUrl, { timeout: 15000 }),
          productElement.click()
        ]);

        const afterUrl = this.page.url();
        console.log(`   ✅ 상품 페이지 이동 성공: ${afterUrl}`);
        
        // 상품 페이지 로드 대기
        await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });

        if (this.logger) {
          await this.logger.completeStage3Success({
            attempts: attemptCount,
            finalUrl: afterUrl
          });
        }

        return {
          success: true,
          attempts: attemptCount,
          finalUrl: afterUrl
        };

      } catch (clickError) {
        console.warn(`   ⚠️  클릭 시도 ${attemptCount} 실패:`, clickError.message);
        
        if (attemptCount < maxAttempts) {
          console.log(`   🔄 ${1000}ms 후 재시도...`);
          await this.page.waitForTimeout(1000);
        }
      }
    }

    // 모든 시도 실패
    const errorMessage = `${maxAttempts}회 시도 후 상품 클릭 실패`;
    
    if (this.logger) {
      await this.logger.completeStage3Failed({
        attempts: maxAttempts
      }, errorMessage);
    }

    return {
      success: false,
      attempts: maxAttempts,
      error: errorMessage
    };
  }

  /**
   * 스마트 장바구니 클릭 (재시도 로직 포함)
   */
  async smartCartClick() {
    const maxAttempts = 3;
    let attemptCount = 0;
    
    if (this.logger) {
      this.logger.startStage4();
    }

    while (attemptCount < maxAttempts) {
      attemptCount++;
      
      try {
        console.log(`🛒 [Smart Nav] 장바구니 클릭 시도 ${attemptCount}/${maxAttempts}`);

        // 장바구니 버튼 찾기 (여러 셀렉터 시도)
        const cartSelectors = [
          'button[data-product-id]', // 메인 장바구니 버튼
          '.add-to-cart',
          '.cart-add-button',
          'button:has-text("장바구니")',
          'button:has-text("담기")'
        ];

        let cartButton = null;
        for (const selector of cartSelectors) {
          try {
            cartButton = await this.page.waitForSelector(selector, { 
              timeout: 3000, 
              state: 'visible' 
            });
            if (cartButton) {
              console.log(`   ✓ 장바구니 버튼 발견: ${selector}`);
              break;
            }
          } catch (e) {
            // 다음 셀렉터 시도
          }
        }

        if (!cartButton) {
          throw new Error('장바구니 버튼을 찾을 수 없음');
        }

        // 버튼 클릭 가능 상태 확인
        const isEnabled = await cartButton.isEnabled();
        if (!isEnabled) {
          throw new Error('장바구니 버튼이 비활성화됨');
        }

        // 스크롤해서 버튼을 보이게 하기
        await cartButton.scrollIntoViewIfNeeded();
        await this.page.waitForTimeout(500);

        // 클릭 실행
        await cartButton.click();
        
        // 장바구니 담기 알림 감지 (최대 1초 대기)
        const notifierSelectors = [
          '.prod-order-notifier',
          'p:has-text("상품이 장바구니에 담겼습니다")'
        ];
        
        let notifierFound = false;
        const maxWaitTime = 1000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime && !notifierFound) {
          for (const selector of notifierSelectors) {
            try {
              const element = await this.page.$(selector);
              if (element && await element.isVisible().catch(() => false)) {
                notifierFound = true;
                console.log(`   ✓ 장바구니 알림 감지 (${Date.now() - startTime}ms)`);
                break;
              }
            } catch (e) {
              // 무시
            }
          }
          
          if (!notifierFound) {
            await this.page.waitForTimeout(100);
          }
        }
        
        // 알림을 못 찾은 경우 남은 시간 대기
        if (!notifierFound) {
          const remainingTime = maxWaitTime - (Date.now() - startTime);
          if (remainingTime > 0) {
            await this.page.waitForTimeout(remainingTime);
          }
        }
        
        console.log(`   ✅ 장바구니 클릭 성공`);
        
        if (this.logger) {
          await this.logger.completeStage4Success({
            attempts: attemptCount
          });
        }

        return {
          success: true,
          attempts: attemptCount
        };

      } catch (clickError) {
        console.warn(`   ⚠️  장바구니 클릭 시도 ${attemptCount} 실패:`, clickError.message);
        
        if (attemptCount < maxAttempts) {
          console.log(`   🔄 ${1500}ms 후 재시도...`);
          await this.page.waitForTimeout(1500);
        }
      }
    }

    // 모든 시도 실패
    const errorMessage = `${maxAttempts}회 시도 후 장바구니 클릭 실패`;
    
    if (this.logger) {
      await this.logger.completeStage4Failed({
        attempts: maxAttempts
      }, errorMessage);
    }

    return {
      success: false,
      attempts: maxAttempts,
      error: errorMessage
    };
  }

  /**
   * 전체 상품 수 추정 (모든 페이지 검색 결과 합계)
   */
  getTotalProductCount() {
    return this.navigationHistory.reduce((total, nav) => total + nav.productCount, 0);
  }

  /**
   * 네비게이션 이력 조회
   */
  getNavigationHistory() {
    return this.navigationHistory;
  }

  /**
   * 검색 요약 정보 조회
   */
  getSearchSummary() {
    const totalPages = this.navigationHistory.length;
    const totalProducts = this.getTotalProductCount();
    const successfulPages = this.navigationHistory.filter(nav => nav.loadSuccess).length;
    const averageLoadTime = this.navigationHistory.length > 0 ? 
      this.navigationHistory.reduce((sum, nav) => sum + nav.loadDuration, 0) / this.navigationHistory.length : 0;

    return {
      totalPages,
      successfulPages,
      totalProducts,
      averageLoadTime: Math.round(averageLoadTime),
      navigationHistory: this.navigationHistory
    };
  }
}

module.exports = SmartNavigationHandler;