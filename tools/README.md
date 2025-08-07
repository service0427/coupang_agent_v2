# 데이터베이스 관리 도구

**한국어 정책**: 모든 도구는 한국어로 출력합니다.

## 🎯 핵심 도구

### 1. 통합 관리 도구
```bash
# 메인 관리 도구 (80+ 개별 스크립트 통합)
node tools/db-manager.js [카테고리] [작업]

# 빠른 상태 확인
node tools/quick-check.js
```

### 2. 주요 명령어

**상태 확인:**
```bash
node tools/db-manager.js check data      # V2 데이터 상태 확인
node tools/db-manager.js check realtime  # 실시간 로그 모니터링
```

**분석:**
```bash
node tools/db-manager.js analyze errors  # 에러 패턴 분석
node tools/db-manager.js analyze errors 3  # 최근 3일 에러 분석
```

**정리:**
```bash
node tools/db-manager.js cleanup stuck   # 정체된 실행 정리
```

**마이그레이션:**
```bash
node tools/db-manager.js migrate modes   # 키워드별 모드 시스템
node tools/db-manager.js migrate enum    # ENUM 타입 마이그레이션
```

## 📁 폴더 구조

```
tools/
├── db-manager.js           # 🎯 메인 통합 관리 도구
├── quick-check.js          # ⚡ 빠른 상태 확인
├── check-v2-data.js       # 📊 V2 데이터 확인  
├── create-v2-tables.js    # 🏗️ V2 테이블 생성
├── migrate-to-keyword-mode-enum.js  # 🔄 키워드 모드 마이그레이션
└── archive/
    └── legacy-scripts/     # 📦 레거시 스크립트 보관소
        ├── analyze-*.js    # 분석 도구들
        ├── check-*.js      # 개별 확인 도구들
        ├── test-*.js       # 테스트 스크립트들
        └── ...
```

## 🚀 사용법

### 빠른 시작
```bash
# 시스템 전체 상태 빠르게 확인
node tools/quick-check.js

# 도움말 보기
node tools/db-manager.js
```

### 자주 사용하는 명령어들
```bash
# 1. 매일 아침 체크
node tools/quick-check.js

# 2. 에러 발생시 분석
node tools/db-manager.js analyze errors

# 3. 시스템이 느려질 때
node tools/db-manager.js cleanup stuck

# 4. 실시간 모니터링 (60초)
node tools/db-manager.js check realtime 60
```

## 🎉 장점

### ✅ **시간 단축**
- 기존: 80+ 개별 파일에서 필요한 도구 찾기
- 현재: 1개 통합 도구로 모든 작업 수행

### ✅ **사용 편의성**
- 한국어 출력 및 명령어 구조
- 직관적인 카테고리 분류
- 자동 완성 및 도움말

### ✅ **유지 보수성**
- 중복 코드 제거
- 통합된 에러 처리
- 레거시 코드 보관

## 📋 마이그레이션 가이드

기존 스크립트 사용자들을 위한 매핑:

| 기존 파일 | 새로운 명령어 |
|-----------|---------------|
| `check-v2-data.js` | `db-manager.js check data` |
| `analyze-errors.js` | `db-manager.js analyze errors` |
| `cleanup-stuck-executions.js` | `db-manager.js cleanup stuck` |
| `check-realtime-logs.js` | `db-manager.js check realtime` |

## 🔧 확장

새로운 기능을 추가하려면 `db-manager.js`의 `initializeCommands()` 메서드에 명령어를 추가하고 해당 기능을 구현하세요.

## 📞 문제 해결

1. **빠른 확인**: `node tools/quick-check.js`
2. **상세 분석**: `node tools/db-manager.js analyze errors`
3. **레거시 도구**: `tools/archive/legacy-scripts/` 폴더 참조