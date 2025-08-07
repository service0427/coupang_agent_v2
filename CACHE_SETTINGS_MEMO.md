# 브라우저 캐시 설정 현황 (중장기 메모)

## 현재 브라우저 캐시 설정 (변동 없을 예정)

### 1. Multi-mode 실행 설정 (lib/runners/multi-mode.js:74-77)
```javascript
usePersistent: false,    // 임시 프로필 사용하지만 실제로는 persistent context 사용됨
clearSession: true,      // 세션 데이터 초기화 (쿠키, 스토리지)
clearCache: false,       // 캐시 유지 설정
```

### 2. Chrome 브라우저 런처 설정 (lib/core/chrome-launcher.js:78-87)
```javascript
// 유저데이터 폴더 처리
if (clearCache) {
  await removeDirectory(userDataDir);  // ❌ 실행되지 않음
  console.log('🗑️ 캐시 삭제 설정으로 유저데이터 완전 삭제');
} else if (clearSession) {
  console.log('🧹 세션만 제거 예정 (캐시 보존을 위해 유저데이터 유지)');  // ✅ 현재 설정
} else {
  console.log('💾 캐시와 세션 모두 유지 (유저데이터 보존)');
}
```

### 3. CDP를 통한 세션 초기화 (lib/utils/session-cleaner.js:74-80)
```javascript
// clear_cache=true인 경우: 캐시만 별도로 삭제
if (clearCache) {
  await client.send('Network.clearBrowserCache');  // ❌ 실행되지 않음
  console.log('   ✅ 캐시 삭제 완료');
} else if (!clearSession) {
  console.log('   💾 캐시 유지 (성능 최적화)');  // ✅ 현재 설정
}
```

### 4. Chrome 인자 설정 (lib/utils/browser-utils.js:62-73)
```javascript
// clearCache가 true일 때만 캐시 비활성화
if (clearCache) {
  chromeArgs.push(
    '--disable-application-cache',      // ❌ 추가되지 않음
    '--disable-offline-load-stale-cache',
    '--disable-gpu-shader-disk-cache',
    '--media-cache-size=0',
    '--disk-cache-size=0'
  );
  console.log('   📵 캐시 비활성화 인자 추가');
} else {
  console.log('   💾 캐시 활성화 (트래픽 절감)');  // ✅ 현재 설정
}
```

## 현재 동작 방식 요약

### ✅ 유지되는 것들:
- **유저데이터 폴더**: `D:\dev\git\dev_coupang_chrome\profiles\instance_N\` 폴더 유지
- **브라우저 캐시**: HTTP 캐시, 이미지 캐시, 리소스 캐시 등 모든 캐시 보존
- **Chrome 인자**: 캐시 활성화 상태로 브라우저 실행

### 🧹 초기화되는 것들:
- **쿠키**: `Network.clearBrowserCookies` 실행
- **스토리지**: LocalStorage, SessionStorage, IndexedDB 삭제
- **Service Workers**: 등록된 Service Worker 제거
- **권한**: 브라우저 권한 초기화

### 📁 프로필 구조:
- **인스턴스별 분리**: `instance_0`, `instance_1`, `instance_2` 등
- **에이전트 공통**: 같은 에이전트의 모든 키워드는 동일한 인스턴스 번호 사용 가능
- **세션 격리**: 매 실행마다 쿠키/스토리지 초기화로 완전한 세션 격리

## 캐시 효과 제한 요인

### 1. 쿠팡의 동적 콘텐츠 특성
- 상품 검색 API는 실시간 데이터 (재고, 가격, 순위 변동)
- 서버에서 캐시 방지 헤더 설정 추정: `Cache-Control: no-cache`
- API 응답에 타임스탬프, 세션 정보 포함으로 매번 다른 응답

### 2. 트래픽 구성 비율 (추정)
- **동적 데이터 (70-80%)**: 검색 결과 JSON, 상품 정보 API - 캐시 불가
- **정적 리소스 (20-30%)**: 이미지, CSS, JS, 폰트 - 캐시 가능

### 3. 캐시 감지 메커니즘
- **모니터링**: `lib/network/monitor.js`에서 캐시 히트 감지 및 로그 출력
- **감지 가능**: Memory Cache, Disk Cache, Service Worker Cache
- **로그 형식**: `💾 Memory Cache 히트: https://...`

## 중장기 변동 없을 예상 설정들

1. **보안 우선**: 세션 격리를 통한 사용자 추적 방지
2. **캐시 최적화**: 성능 향상을 위한 캐시 유지
3. **프로필 격리**: 인스턴스별 독립 실행 환경
4. **CDP 활용**: 정밀한 세션 제어

---
*생성일: 2025-08-07*
*목적: 브라우저 캐시 동작 방식 중장기 참조용*