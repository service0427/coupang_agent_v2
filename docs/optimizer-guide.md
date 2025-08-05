# Aggressive Optimizer 가이드

## 개요
`aggressive-optimizer.js`는 쿠팡 사이트 자동화 시 네트워크 트래픽을 500KB 이하로 줄이기 위한 도메인 기반 리소스 필터링 시스템입니다.

## 작동 원리

### 1. 기본 정책
- 허용된 도메인(techb.kr, *.coupang.com, *.coupangcdn.com)의 요청도 기본적으로 차단
- 도메인별 규칙에 명시적으로 허용된 리소스 타입만 로드

### 2. 도메인 규칙 구조

```javascript
const DOMAIN_RULES = {
  '도메인명': {
    allow: ['허용할 리소스 타입'],      // 필수
    blockPatterns: ['차단할 URL 패턴']  // 선택
  }
}
```

## 리소스 타입

- `'*'` - 모든 타입 허용
- `document` - HTML 페이지
- `script` - JavaScript 파일
- `stylesheet` - CSS 파일
- `image` - 이미지 파일 (png, jpg, gif 등)
- `font` - 폰트 파일
- `xhr` / `fetch` - AJAX 요청
- `media` - 비디오/오디오
- `websocket` - 웹소켓 연결
- `other` - 기타

## 현재 설정

### techb.kr
- **허용**: 모든 리소스 (`*`)
- **용도**: IP 확인 페이지

### www.coupang.com
- **허용**: `document`, `xhr`, `fetch`
- **용도**: HTML 페이지와 API 요청만

### front.coupangcdn.com
- **허용**: `script`, `stylesheet`
- **용도**: Next.js 프레임워크 파일들

### *.coupang.com / *.coupangcdn.com
- **허용**: 모든 리소스 (`*`)
- **용도**: 아직 세부 설정 전인 서브도메인들

## 사용 예시

### 1. 특정 도메인의 이미지만 차단
```javascript
'assets.coupangcdn.com': {
  allow: ['*'],
  blockPatterns: ['/product-image/', '/thumbnail/']
}
```

### 2. 특정 도메인 완전 차단
```javascript
'thumbnail.coupangcdn.com': {
  allow: []  // 빈 배열 = 모든 타입 차단
}
```

### 3. 특정 스크립트만 허용
```javascript
'tracking.coupang.com': {
  allow: ['script'],
  blockPatterns: ['/analytics/', '/advertisement/']
}
```

## 디버깅

- 허용된 요청은 콘솔에 `✅ 허용:` 로 표시
- 패턴으로 차단된 요청은 `🚫 패턴 차단:` 로 표시
- 최종 통계는 실행 종료 시 표시

## 주의사항

1. 새로운 리소스 타입이 추가되어도 자동으로 차단됨
2. 와일드카드 도메인(`*.domain.com`)보다 정확한 도메인이 우선순위 높음
3. `blockPatterns`는 `allow`로 허용된 리소스에만 적용됨