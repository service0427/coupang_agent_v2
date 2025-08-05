# Coupang Chrome 자동화 리팩토링 가이드

## 개요
이 문서는 Coupang Chrome 자동화 프로젝트의 리팩토링 계획과 진행 상황을 추적합니다.

## 리팩토링 목표
1. **코드 중복 제거**: 반복되는 패턴과 로직을 통합
2. **유지보수성 향상**: 모듈화와 책임 분리
3. **성능 최적화**: 리소스 관리 개선
4. **에러 처리 표준화**: 일관된 에러 처리 체계
5. **테스트 가능성**: 단위 테스트가 가능한 구조

## 주요 문제점

### 1. 코드 중복
- 타임아웃 값이 여러 파일에 하드코딩 (3000ms, 10000ms 등)
- ID 접두사 로직 `[ID:${keywordId}]`이 8개 이상 파일에 중복
- 유사한 try/catch 패턴이 여러 핸들러에 반복
- 브라우저 상태 체크 로직 중복

### 2. 거대 함수
| 함수명 | 파일 | 줄 수 | 문제점 |
|--------|------|-------|---------|
| `executeKeywordSearch()` | search-executor.js | 255 | 네트워크/검색/로깅/최적화 혼재 |
| `searchAndClickProduct()` | coupang-handler.js | 239 | 검색/클릭/장바구니/에러 처리 혼재 |
| `clickProduct()` | product-finder.js | 147 | 클릭/네비게이션/에러 처리 혼재 |
| `humanClick()` | human-click.js | 183 | 과도한 시각 효과 |
| `applyAggressiveOptimization()` | optimizer.js | 175 | 복잡한 라우팅 로직 |

### 3. 불일치한 패턴
- 에러 처리: throw vs return 혼재
- 로깅: 330개 console.log 호출 (형식 제각각)
- 함수 시그니처: 개별 파라미터 vs options 객체 혼재

### 4. 강한 결합도
- 비즈니스 로직에서 직접 DB 서비스 호출
- search-executor가 너무 많은 책임 보유
- 순환 의존성 위험

### 5. 성능 이슈
- DB 커넥션 풀링 없음
- 에러 시 브라우저 인스턴스 정리 미흡
- 과도한 DOM 조작

## 리팩토링 진행 상황

### ✅ 완료된 작업

#### 1. 상수 파일 생성 (`lib/constants/index.js`)
- 모든 타임아웃 값 중앙화
- CSS 셀렉터 정의
- URL 패턴 정의
- 에러 메시지 상수화
- 로그 접두사 포맷
- 브라우저/네트워크/프록시/DB 설정

#### 2. 로깅 유틸리티 생성 (`lib/utils/logger.js`)
- 일관된 로그 포맷
- 컨텍스트 기반 접두사 자동 처리
- 로그 레벨 지원 (info, success, warn, error, debug)
- 도메인별 로그 메서드 (search, cart, cookie, network 등)
- 싱글톤 패턴 지원

#### 3. 에러 핸들러 유틸리티 생성 (`lib/utils/error-handler.js`)
- 표준 에러 응답 형식 (StandardError)
- 에러 타입 자동 분류
- 심각도 레벨 관리 (low, medium, high, critical)
- 재시도 가능 여부 판단
- 에러 래핑 및 안전한 실행 함수

### 🔄 진행 예정 작업

#### 단기 (1-2주)
1. **기존 코드에 새 유틸리티 적용**
   - constants 적용하여 하드코딩 제거
   - logger로 console.log 대체
   - error-handler로 에러 처리 통일

2. **CSS 셀렉터 분리**
   - `lib/config/selectors.js` 생성
   - 기능별 그룹화

3. **거대 함수 분해**
   - 단일 책임 원칙 적용
   - 50줄 이하로 분할

#### 중기 (2-4주)
1. **서비스 레이어 생성**
   - browser-manager.js
   - search-service.js
   - click-service.js

2. **중복 코드 제거**
   - 공통 유틸리티 함수 생성
   - 패턴 통일

3. **의존성 분리**
   - 인터페이스 정의
   - 의존성 주입 패턴 적용

#### 장기 (1-2개월)
1. **성능 최적화**
   - DB 커넥션 풀링
   - 메모리 누수 방지
   - 리소스 정리 개선

2. **테스트 추가**
   - 단위 테스트
   - 통합 테스트

3. **문서화**
   - API 문서
   - 아키텍처 다이어그램

## 사용 예시

### 새로운 상수 사용
```javascript
const { TIMEOUTS, SELECTORS, ERROR_MESSAGES } = require('../constants');

// Before
await page.waitForTimeout(3000);

// After
await page.waitForTimeout(TIMEOUTS.PAGE_WAIT);
```

### 새로운 로거 사용
```javascript
const { createLogger } = require('../utils/logger');

const logger = createLogger({ keywordId: 123 });

// Before
console.log(`[ID:123] 🔍 검색어: "노트북"`);

// After
logger.search('검색어: "노트북"');
```

### 새로운 에러 핸들러 사용
```javascript
const { createErrorHandler } = require('../utils/error-handler');

const errorHandler = createErrorHandler(logger);

// Before
try {
  await someFunction();
} catch (error) {
  console.error('❌ 오류:', error.message);
  throw error;
}

// After
try {
  await someFunction();
} catch (error) {
  const standardError = errorHandler.handle(error, { 
    context: 'someFunction' 
  });
  throw standardError;
}
```

## 주의사항

### 점진적 마이그레이션
- 한 번에 모든 것을 바꾸지 않음
- 기능별로 점진적으로 적용
- 각 단계마다 충분한 테스트

### 하위 호환성
- 기존 API 유지
- 점진적 deprecation
- 마이그레이션 가이드 제공

### 성능 모니터링
- 리팩토링 전후 성능 비교
- 메모리 사용량 추적
- 응답 시간 측정

## 기여 가이드

### 코딩 스타일
- ESLint 규칙 준수
- 일관된 네이밍 컨벤션
- 적절한 주석 작성

### 커밋 메시지
```
refactor: [모듈명] 간단한 설명

- 상세 변경 사항
- 영향받는 부분
- 관련 이슈 번호
```

### 리뷰 체크리스트
- [ ] 기존 기능 정상 작동
- [ ] 새 유틸리티 활용
- [ ] 테스트 추가/수정
- [ ] 문서 업데이트

## 참고 자료
- [Clean Code 원칙](https://github.com/ryanmcdermott/clean-code-javascript)
- [Node.js 베스트 프랙티스](https://github.com/goldbergyoni/nodebestpractices)
- [리팩토링 카탈로그](https://refactoring.com/catalog/)