# Coupang Agent v1

쿠팡에서 특정 상품을 검색하고 클릭하는 Chrome 자동화 에이전트입니다.

## 주요 기능

- **상품 검색 및 클릭**: 키워드로 검색하여 특정 상품 코드 찾기
- **멀티 에이전트**: 여러 키워드를 병렬로 처리
- **프록시 지원**: SOCKS5 프록시 및 IP 토글 기능
- **차단 감지**: 쿠팡 접속 차단 자동 감지
- **쿠키 추적**: 세션별 쿠키 변화 모니터링
- **장바구니 클릭**: 상품 페이지에서 장바구니 추가

## 설치

```bash
# 의존성 설치
npm install

# Playwright Chrome 브라우저 설치
npx playwright install chromium
```

## 사용법

### 기본 실행 (에이전트 모드)

```bash
# 기본 에이전트 실행
node index.js

# 특정 에이전트 실행
node index.js --agent test1

# 1회만 실행
node index.js --once
```

### ID 모드 (특정 키워드 실행)

```bash
# 특정 ID의 키워드만 실행
node index.js --id 123

# 옵션 조합
node index.js --id 123 --search --optimize --check-cookies
```

### 실행 옵션

```
--agent <이름>      실행할 에이전트 (기본값: default)
--id <번호>         특정 키워드 ID만 실행
--once              1회만 실행 후 종료
--search            검색창 입력 모드 (기본: URL 직접 이동)
--optimize          리소스 최적화 활성화
--check-cookies     쿠키 변화 추적
--no-ip-change      IP 변경 비활성화 (테스트용)
--max-rounds <수>   최대 실행 라운드 (기본값: 10)
```

## 프로젝트 구조

```
coupang_agent_v1/
├── index.js                    # 메인 실행 파일
├── config/
│   └── environment.js          # 환경 설정
├── lib/
│   ├── core/
│   │   ├── chrome-launcher.js  # Chrome 브라우저 실행
│   │   └── tracker-setup.js    # 트래커 설정
│   ├── handlers/
│   │   ├── coupang-handler.js  # 쿠팡 자동화 메인 로직
│   │   ├── product-finder.js   # 상품 검색 및 클릭
│   │   ├── cart-handler.js     # 장바구니 처리
│   │   ├── pagination-handler.js # 페이지네이션
│   │   └── search-mode-handler.js # 검색 모드 처리
│   ├── runners/
│   │   ├── multi-mode.js       # 멀티 에이전트 실행
│   │   └── id-mode.js          # ID 기반 실행
│   ├── services/
│   │   ├── db-service.js       # 데이터베이스 서비스
│   │   ├── error-logger.js     # 에러 로깅
│   │   └── proxy-toggle-service.js # 프록시 IP 토글
│   ├── trackers/
│   │   └── cookie-tracker.js   # 쿠키 추적
│   └── utils/
│       ├── browser-utils.js    # 브라우저 유틸리티
│       ├── session-cleaner.js  # 세션 초기화 (CDP)
│       ├── automation-detector.js # 자동화 탐지 방지
│       ├── block-detector.js   # 차단 감지
│       └── cli-parser.js       # CLI 파서
└── sql/
    └── add_cart_click_count.sql # DB 업데이트 스크립트
```

## 데이터베이스 설정

### 필요한 테이블

#### v2_test_keywords
```sql
-- 키워드 및 실행 설정
id, keyword, suffix, product_code, agent, 
proxy_server, cart_click_enabled, use_persistent, 
clear_session, profile_name, gpu_disabled,
max_executions, current_executions, date
```

#### v2_execution_logs
```sql
-- 실행 로그
id, keyword_id, agent, success, product_found,
product_rank, pages_searched, cart_clicked, 
cart_click_count, error_message, duration_ms
```

### cart_click_count 컬럼 추가

```bash
psql -U techb_pp -h mkt.techb.kr -d coupang_test -f sql/add_cart_click_count.sql
```

## 주요 기능 상세

### 1. 검색 모드

- **URL 직접 이동 (기본)**: 검색 결과 URL로 바로 이동
- **검색창 입력 모드**: 메인 페이지에서 검색창에 입력

### 2. 프록시 및 IP 변경

- 키워드별 프록시 설정 (DB에서 관리)
- proxy_server가 설정된 경우 자동 IP 토글
- 15초 재실행 방지 로직

### 3. 세션 관리

- **use_persistent**: 영구/임시 프로필 사용
- **clear_session**: CDP를 통한 완전 초기화
- **profile_name**: 프로필별 데이터 분리

### 4. 차단 감지

- 상품 클릭 후 즉시 차단 확인
- 차단 페이지 감지 시 3초 대기 후 종료
- ERR_HTTP2_PROTOCOL_ERROR 자동 감지

### 5. 쿠키 추적

`--check-cookies` 옵션 사용 시:
- 세션 시작/종료 시 쿠키 저장
- 쿠키 변화 상세 분석
- 쿠팡/광고 쿠키 구분

## 환경 설정

`config/environment.js`에서 설정:
```javascript
{
  database: {
    host: 'mkt.techb.kr',
    port: 5432,
    database: 'coupang_test',
    user: 'techb_pp',
    password: 'Tech1324!'
  },
  screenWidth: 1200,
  screenHeight: 800,
  agentName: 'default'
}
```

## 실행 예시

```bash
# 기본 실행 (모든 키워드 반복)
node index.js

# 특정 에이전트로 1회만 실행
node index.js --agent test1 --once

# ID 123 키워드를 검색창 모드로 실행
node index.js --id 123 --search

# 최적화 + 쿠키 추적 + 1회 실행
node index.js --optimize --check-cookies --once
```

## 주의사항

- Chrome 브라우저 필수
- 데이터베이스 연결 필요
- 프록시 사용 시 SOCKS5 형식
- 차단 발생 시 자동 중단

## 라이선스

Private - 내부 사용 전용