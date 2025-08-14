# Coupang Agent v1

쿠팡 상품 자동화 도구 - Node.js와 Playwright 기반의 브라우저 자동화 시스템 (API 모드 전용)

## 주요 기능

- **상품 검색 및 클릭**: 특정 상품 코드를 검색하여 자동 클릭
- **API 모드**: 허브 서버와 연동하여 작업 분산 처리
- **프록시 지원**: SOCKS5 프록시 자동 토글 및 IP 변경
- **차단 감지**: 쿠팡 접속 차단 자동 감지 및 우회
- **멀티쓰레드**: 여러 인스턴스 동시 실행 지원
- **장바구니 클릭**: 상품 페이지에서 장바구니 추가 자동화
- **SSL/TLS 차단 감지**: HTTPS 연결 문제 자동 감지

## 설치 방법

```bash
# 의존성 설치
npm install

# Playwright 브라우저 설치
npx playwright install chromium
```

## 실행 방법

### API 모드
허브 서버(mkt.techb.kr:3001)와 연동하여 작업 분산

```bash
# API 모드 실행 (4개 쓰레드)
node index.js --api --instance 1 --threads 4

# 단일 실행 후 종료
node index.js --api --instance 1 --threads 4 --once

# 모니터링과 함께
node index.js --api --instance 1 --threads 4 --monitor
```

## CLI 옵션

```
--api               API 모드 활성화 (필수)
--instance <번호>   인스턴스 번호 (기본값: 1)
--threads <개수>    쓰레드 개수 (기본값: 4)
--once              1회만 실행 후 종료
--monitor           실시간 트래픽 모니터링 로그 활성화
--check-cookies     쿠키 변화 추적
--no-ip-change      IP 변경 비활성화 (테스트용)
```

## 시스템 요구사항

- Node.js v16.0.0 이상
- Ubuntu 20.04+ (Linux 권장)
- 메모리: 최소 4GB RAM (멀티쓰레드 시 8GB 권장)
- 안정적인 인터넷 연결

## 설정

- 허브 서버: mkt.techb.kr:3001 (고정)
- 화면 해상도: 1200x800
- 타임아웃: 30초 (기본), 60초 (네비게이션)
- 설정은 `environment.js`에서 관리

## 브라우저 인스턴스

API 모드에서는 쓰레드별 독립된 브라우저 인스턴스를 사용:
- `/browser-data/instance1/` - 쓰레드 1
- `/browser-data/instance2/` - 쓰레드 2
- `/browser-data/instance3/` - 쓰레드 3
- `/browser-data/instance4/` - 쓰레드 4

## 캐시 공유 시스템

- `browser-data/shared-cache/` - 모든 인스턴스가 공유하는 캐시
- 트래픽 절약 및 성능 향상
- 자동 심볼릭 링크 관리

## 주의사항

- Ubuntu/Linux 환경에서 Chrome 의존성 자동 확인
- 헤드리스 모드 미지원 (항상 GUI 모드)
- 프록시 설정은 허브 서버에서 자동 관리
- SSL/TLS 초기화 문제 자동 처리