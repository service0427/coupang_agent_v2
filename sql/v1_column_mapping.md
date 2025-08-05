# v1 테이블 컬럼명 매핑 문서

## 개요
v2 테이블에서 v1 테이블로 전환하면서 컬럼명을 간소화하고 가독성을 개선했습니다.

## 1. v1_keywords (기존: v2_test_keywords)

### 컬럼명 변경 매핑

| v2 컬럼명 | v1 컬럼명 | 설명 | 비고 |
|-----------|-----------|------|------|
| keyword | keyword | 검색 키워드 | 유지 |
| suffix | - | 키워드 접미사 | **제거** - keyword에 통합 |
| product_code | code | 상품 코드 | 단순화 |
| agent | agent | 에이전트명 | 유지 |
| proxy_server | proxy | 프록시 서버 | 단순화 |
| cart_click_enabled | cart | 장바구니 클릭 활성화 | 단순화 |
| use_persistent | userdata | 유저데이터 디렉토리 사용 | 의미 명확화 |
| clear_session | session | 세션 유지 여부 | **의미 반전**: true=유지, false=초기화 |
| clear_cache | cache | 캐시 유지 여부 | **의미 반전**: true=유지, false=삭제 |
| optimize | optimize | 트래픽 최적화 (1000KB 목표) | 유지 |
| gpu_disabled | gpu | GPU 사용 여부 | **의미 반전**: true=사용, false=비활성화 |
| max_executions | max_runs | 최대 실행 횟수 | 단순화 |
| current_executions | runs | 현재 실행 횟수 | 단순화 |
| success_count | succ | 성공 횟수 | 단순화 |
| fail_count | fail | 실패 횟수 | 단순화 |
| last_executed_at | last_run | 마지막 실행 시간 | 단순화 |
| created_at | created | 생성 시간 | 단순화 |

### Boolean 값 반전 이유
- **긍정적 표현 선호**: `clear_session` → `session` (세션 유지)
- **직관적 이해**: `gpu_disabled` → `gpu` (GPU 사용)
- **일관성**: 모든 boolean 컬럼이 "사용/유지" 관점으로 통일

## 2. v1_executions (기존: v2_execution_logs)

### 컬럼명 변경 및 순서 재정렬

| v2 컬럼명 | v1 컬럼명 | 설명 | 그룹 |
|-----------|-----------|------|------|
| executed_at | executed | 실행 시간 | 기본 정보 |
| error_message | error | 에러 메시지 | 실행 결과 |
| duration_ms | duration | 실행 시간(ms) | 실행 결과 |
| search_query | query | 검색어 | 검색 정보 |
| keyword_suffix | suffix | 키워드 접미사 | 검색 정보 |
| product_found | found | 상품 발견 여부 | 검색 정보 |
| product_rank | rank | 상품 순위 | 검색 정보 |
| pages_searched | pages | 검색한 페이지 수 | 검색 정보 |
| cart_clicked | cart | 장바구니 클릭 | 클릭 정보 |
| cart_click_count | cart_count | 장바구니 클릭 횟수 | 클릭 정보 |
| proxy_used | proxy | 사용한 프록시 | 네트워크 |
| actual_ip | ip | 실제 IP | 네트워크 |
| actual_traffic_mb | traffic | 트래픽 사용량(MB) | 네트워크 |
| final_url | url | 최종 URL | 네트워크 |
| optimize_enabled | optimize | 최적화 활성화 | 설정값 |
| clear_session | session | 세션 유지 | 설정값 (**반전**) |
| clear_cache | cache | 캐시 유지 | 설정값 (**반전**) |
| use_persistent | userdata | 유저데이터 사용 | 설정값 |
| gpu_disabled | gpu | GPU 사용 | 설정값 (**반전**) |

### 컬럼 순서 재정렬 원칙
1. **기본 정보**: id, keyword_id, agent, 실행시간
2. **실행 결과**: 성공여부, 에러, 소요시간
3. **검색 정보**: 검색어, 상품 발견, 순위, 페이지
4. **클릭 정보**: 참조URL, 장바구니
5. **네트워크**: 프록시, IP, 트래픽, URL
6. **설정값**: 실행 당시 설정 (분석용)

## 3. v1_errors (기존: v2_error_logs)

### 컬럼명 변경 매핑

| v2 컬럼명 | v1 컬럼명 | 설명 |
|-----------|-----------|------|
| error_code | code | 에러 코드 |
| error_message | message | 에러 메시지 |
| occurred_at | occurred | 발생 시간 |
| page_url | url | 페이지 URL |
| proxy_used | proxy | 사용한 프록시 |
| actual_ip | ip | 실제 IP |

## 4. 코드 수정 시 주의사항

### Boolean 값 처리
```javascript
// v2 → v1 변환 예시
const v1Data = {
  session: !v2Data.clear_session,  // 반전
  cache: !v2Data.clear_cache,      // 반전
  gpu: !v2Data.gpu_disabled        // 반전
};

// v1 → v2 변환 예시 (역변환)
const v2Data = {
  clear_session: !v1Data.session,
  clear_cache: !v1Data.cache,
  gpu_disabled: !v1Data.gpu
};
```

### SQL 쿼리 수정
```sql
-- v2 쿼리
SELECT * FROM v2_test_keywords WHERE clear_session = true;

-- v1 쿼리 (반전 주의)
SELECT * FROM v1_keywords WHERE session = false;
```

## 5. 장점

1. **간결성**: 컬럼명이 짧아져 쿼리 작성이 편리
2. **일관성**: Boolean 값이 모두 긍정적 의미로 통일
3. **가독성**: 관련 컬럼들이 논리적으로 그룹화
4. **유지보수**: 단순한 이름으로 이해가 쉬움

## 6. 마이그레이션 체크리스트

- [ ] 백업 완료
- [ ] v1 테이블 생성
- [ ] 데이터 마이그레이션 실행
- [ ] Boolean 값 반전 확인
- [ ] 데이터 건수 검증
- [ ] 코드 수정 (db-service.js 등)
- [ ] 테스트 실행
- [ ] 기존 테이블 삭제