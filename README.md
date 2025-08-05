# Coupang Agent v1

쿠팡에서 특정 상품을 검색하고 클릭하는 Chrome 자동화 에이전트입니다.

## 주요 기능

- **상품 검색 및 클릭**: 키워드로 검색하여 특정 상품 코드 찾기
- **멀티 에이전트**: 여러 키워드를 병렬로 처리
- **프록시 지원**: SOCKS5 프록시 및 IP 토글 기능
- **차단 감지**: 쿠팡 접속 차단 자동 감지
- **쿠키 추적**: 세션별 쿠키 변화 모니터링
- **장바구니 클릭**: 상품 페이지에서 장바구니 추가

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
--traffic-monitor   네트워크 트래픽 모니터링 및 요약 분석
--traffic-detail    네트워크 트래픽 상세 분석 (전체 URL 포함)
```


## 실행 예시

```bash
# 특정 에이전트로 1회만 실행
node index.js --agent test1 --once

# ID 123 키워드를 검색창 모드로 실행
node index.js --id 123 --search

# 최적화 + 쿠키 추적 + 1회 실행
node index.js --optimize --check-cookies --once
```
