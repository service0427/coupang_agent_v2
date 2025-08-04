# 쿠팡 Chrome 자동화 프로젝트

쿠팡에서 특정 상품을 검색하고 클릭하는 Chrome 전용 자동화 도구입니다.

## 프로젝트 개요

- **목적**: 쿠팡에서 상품 검색 및 클릭 자동화
- **브라우저**: Chrome 전용
- **주요 기능**: 
  - 상품 코드로 검색 및 클릭
  - 검색 순위 측정
  - 프록시 지원
  - 검색 최적화 (메인페이지 리소스 차단)
  - 에러 로깅 및 분석

## 빠른 시작

```bash
# 의존성 설치
npm install

# Playwright Chrome 브라우저 설치
npx playwright install chromium

# 기본 실행
node index.js

# 동시 실행 (여러 Chrome 인스턴스)
node concurrent-runner.js
```

## 프로젝트 구조

```
dev_coupang_chrome/
├── index.js              # 메인 실행 파일
├── concurrent-runner.js  # 동시 실행 관리
├── config/
│   ├── config.js        # Chrome 설정
│   ├── db.config.js     # 데이터베이스 설정
│   └── proxies.json     # 프록시 목록
├── lib/
│   ├── core/
│   │   ├── chrome-launcher.js    # Chrome 브라우저 실행
│   │   ├── search-optimizer.js  # 검색 최적화 모듈
│   │   └── workflow-manager.js  # 워크플로우 관리
│   ├── handlers/
│   │   ├── coupang-handler.js   # 쿠팡 자동화 로직
│   │   └── cart-handler.js      # 장바구니 처리
│   ├── services/
│   │   ├── db-service.js        # DB 연결 관리
│   │   ├── keyword-service.js   # 키워드 관리
│   │   ├── error-logger.js      # 에러 로깅
│   │   ├── proxy-manager.js     # 프록시 관리
│   │   └── proxy-toggle-service.js # 프록시 IP 변경
│   └── workflows/
│       ├── search-click.js      # 기본 검색/클릭
│       ├── signup.js            # 회원가입 프로세스
│       └── product-search.js    # 상품 검색
├── sql/
│   ├── v2_create_tables.sql    # v2 테이블 생성
│   └── v2_indexes.sql          # v2 인덱스 생성
├── tests/
│   ├── chrome-test.js          # Chrome 테스트
│   └── optimization-test.js    # 최적화 테스트
├── tools/
│   ├── analyze-errors.js       # 에러 분석
│   └── check-keywords.js       # 키워드 확인
└── scripts/
    ├── run.bat                 # Windows 실행
    └── run-optimized.bat       # 최적화 실행
```

## 주요 기능

### 1. 검색 모드

#### URL 직접 이동 (기본)
```bash
node index.js
```

#### 검색창 입력 모드
```bash
node index.js --search
```

### 2. 프록시 설정

```bash
# 프록시 없이
node index.js --proxy none

# 순차 프록시
node index.js --proxy sequential

# 랜덤 프록시
node index.js --proxy random

# 특정 프록시
node index.js --proxy proxy1
```

### 3. 프로필 관리

```bash
# 영구 프로필 사용 (기본)
node index.js --profile-name work

# 일회성 세션 (시크릿 모드)
node index.js --no-persistent

# 세션 초기화
node index.js --clear-session
```

### 4. 검색 최적화

메인페이지의 불필요한 리소스를 차단하여 속도 향상:

```bash
# 검색 모드 + 최적화
node concurrent-runner.js --search --optimize
```

차단 대상:
- 이미지, 미디어, 폰트
- 광고/추적 스크립트
- 프로모션, 배너
- 불필요한 외부 리소스

**중요**: 최적화는 메인페이지에서만 적용되며, 검색 결과 페이지에서는 모든 리소스가 정상 로드됩니다.

## 데이터베이스 구조

### v2_test_keywords
키워드 및 실행 설정 관리

```sql
CREATE TABLE v2_test_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword VARCHAR(100) NOT NULL,
    suffix VARCHAR(100),
    product_code VARCHAR(20) NOT NULL,
    agent VARCHAR(50),
    profile_name VARCHAR(50),
    proxy_server VARCHAR(255),
    ip_change_enabled BOOLEAN DEFAULT false,
    cart_click_enabled BOOLEAN DEFAULT false,
    use_persistent BOOLEAN DEFAULT true,
    clear_session BOOLEAN DEFAULT false,
    gpu_disabled BOOLEAN DEFAULT false,
    max_executions INTEGER DEFAULT 100,
    current_executions INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### v2_execution_logs
실행 로그 저장

```sql
CREATE TABLE v2_execution_logs (
    id SERIAL PRIMARY KEY,
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    product_found BOOLEAN,
    product_rank INTEGER,
    url_rank INTEGER,
    pages_searched INTEGER,
    cart_clicked BOOLEAN DEFAULT false,
    error_message TEXT,
    duration_ms INTEGER,
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    final_url TEXT,
    search_query VARCHAR(200)
);
```

### v2_error_logs
에러 추적 및 분석

```sql
CREATE TABLE v2_error_logs (
    id SERIAL PRIMARY KEY,
    browser VARCHAR(20) DEFAULT 'chrome',
    error_code VARCHAR(100),
    error_message TEXT NOT NULL,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    page_url TEXT,
    proxy_used VARCHAR(255),
    actual_ip VARCHAR(50),
    keyword_id INTEGER REFERENCES v2_test_keywords(id),
    agent VARCHAR(50)
);
```

## Chrome 설정

### 기본 설정
```javascript
{
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1200,800'
  ]
}
```

### WebDriver 우회
```javascript
// navigator.webdriver 제거
delete Object.getPrototypeOf(navigator).webdriver;

// Chrome 자동화 흔적 제거
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
```

## 실행 옵션

### 기본 실행
```bash
node index.js [옵션]

옵션:
  --keyword <키워드>      검색 키워드
  --suffix <접미사>       키워드 접미사
  --code <상품코드>       찾을 상품 코드
  --proxy <모드>          프록시 설정
  --profile-name <이름>   프로필 이름
  --search               검색창 입력 모드
  --no-persistent        일회성 세션
  --clear-session        세션 초기화
  --cart                 장바구니 클릭
  --help                 도움말
```

### 동시 실행
```bash
node concurrent-runner.js [옵션]

옵션:
  --agent <이름>         에이전트 이름
  --once                 1회만 실행
  --search              검색창 입력 모드
  --optimize            검색 최적화
  --max-rounds <수>     최대 라운드 수
  --help                도움말
```

## 환경 변수

`.env` 파일 생성:
```env
# 데이터베이스
DB_HOST=mkt.techb.kr
DB_PORT=5432
DB_NAME=coupang_test
DB_USER=your_user
DB_PASSWORD=your_password

# 에이전트
AGENT_NAME=default

# 화면 크기
SCREEN_WIDTH=1200
SCREEN_HEIGHT=800
```

## 문제 해결

### 1. Chrome 실행 오류
```bash
# Chrome 브라우저 재설치
npx playwright install --force chromium
```

### 2. 프록시 연결 오류
- `proxies.json`에서 프록시 설정 확인
- 프록시 서버 상태 확인

### 3. WebDriver 감지
- Chrome 설정이 올바른지 확인
- `--disable-blink-features=AutomationControlled` 옵션 확인

## 성능 최적화

### 메인페이지 최적화
- 이미지, 미디어 차단으로 50-70% 로딩 시간 단축
- 네트워크 요청 80-90% 감소

### 동시 실행
- 여러 Chrome 인스턴스 동시 실행
- CPU 코어 수에 따라 조정 가능

## 개발 가이드

### 새 워크플로우 추가
1. `lib/workflows/` 디렉토리에 새 파일 생성
2. 워크플로우 모듈 작성:
```javascript
async function myWorkflow(page, options = {}) {
  // 워크플로우 로직
}

module.exports = {
  id: 'my-workflow',
  name: '워크플로우 이름',
  description: '설명',
  handler: myWorkflow
};
```

### 에러 로깅
```javascript
const errorLogger = require('./lib/services/error-logger');

await errorLogger.logError({
  browser: 'chrome',
  errorMessage: error.message,
  pageUrl: page.url(),
  proxyUsed: proxyConfig?.server,
  keywordId: keyword.id,
  agent: agentName
});
```

## 라이선스

Private - 내부 사용 전용# coupang_agent_v1
