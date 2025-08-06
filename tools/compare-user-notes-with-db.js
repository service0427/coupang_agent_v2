/**
 * 사용자 메모와 데이터베이스 값 비교
 * 사용자가 직접 기록한 [검색/노출/클릭/장바구니] 값과 DB 실제 값 비교
 */

const dbService = require('../lib/services/db-service');

// 사용자 메모 데이터 파싱
const userNotes = `
비룸 무선청소기	99/96/62/54	63718821	2024-11-26
티몬몰 세신 크린피아 매트 베개커버 사계절 침대 침구 세트	99/95/64/59	84166905	2024-11-26
아보카도 오일	100/60/45/40	2024-11-26
투명자동우산 대형 튼튼한 자동 우산	100/64/64/55	2024-11-26
[0/0/0/0] 도톰 방수 뽁뽁이 매트	66/66/66/66	74339521	2024-11-26
맥선 USB C타입 to HDMI 변환 미러링 케이블	66/66/54/51	78548426	2024-11-26
[100/60/45/40] 아보카도 오일	99/64/64/54	6175477616	2024-11-26
코베아 와이드 2폴딩 테이블 M	100/99/65/57	83457723	2024-11-26
그린 팜 보리새싹 분말	99/63/47/44	74251084	2024-11-26
[100/30/30/30] 신지모루 코로나 방역복	93/93/60/52	6316862764	2024-11-27
[63/63/63/63] 쿠첸 미니 아이스크림 메이커	62/62/41/36	5882903071	2024-11-27
[99/96/61/55] 제스파 충전식 진동 근육마사지건 무선 안마기	100/65/65/57	66639609	2024-11-27
[100/64/64/57] 뽁뽁이 놀이방매트 층간소음	101/66/66/61	74339521	2024-11-27
[100/32/32/32] 고글 일반형 보안경 눈 보호 안경	99/99/98/84	49113062	2024-11-27
[100/97/64/57] 3M 마스크 9010 50개입	95/64/41/37	12588323	2024-11-28
[99/96/64/62] 비룸 청소기 스틱 연장봉 부품	99/97/44/31	83695318	2024-11-28
[100/62/49/41] 컴플레인 파워 서플라이	99/65/42/39	83866612	2024-11-28
[100/62/50/41] 여름 오픈 토 스트랩 샌들 슬리퍼	99/66/66/57	72823831	2024-11-28
[100/65/33/29] 호맥스 국산 자동 포장기 HM	100/99/63/58	82734906	2024-11-28
[101/99/68/60] 코우류 투명 테이프	98/97/50/45	79810296	2024-11-28
[100/65/65/58] [로켓배송] USB C타입 to HDMI 변환 미러링 케이블	98/32/30/24	78548426	2024-11-29
[100/97/66/58] 킨더 부에노 화이트 초콜릿 39g x 30개입	99/65/62/54	13369516	2024-11-29
[100/65/65/60] 충전식 진동 무선 근육 안마기	99/59/41/36	66639609	2024-11-29
[100/97/64/61] 미라지 장우산 특대형 골프 우산	100/57/57/50	2083654	2024-11-29
[96/32/32/32] 바디프랜드 메디라인 각도 조절 자세	100/60/60/54	11965652	2024-11-29
`.trim();

async function compareNotesWithDB() {
  console.log('📊 사용자 메모와 데이터베이스 값 비교 분석');
  console.log('='.repeat(150));

  try {
    // 사용자 메모 파싱
    const parsedNotes = [];
    const lines = userNotes.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      
      let keyword = parts[0].trim();
      const statsStr = parts[1].trim();
      const code = parts[2]?.trim();
      const date = parts[3]?.trim();
      
      // 통계 파싱 (검색/노출/클릭/장바구니)
      const stats = statsStr.split('/').map(s => parseInt(s));
      if (stats.length !== 4) continue;
      
      // 키워드에서 패턴 추출
      let expectedStats = null;
      const patternMatch = keyword.match(/\[(\d+)\/(\d+)\/(\d+)\/(\d+)\]/);
      if (patternMatch) {
        expectedStats = [
          parseInt(patternMatch[1]),
          parseInt(patternMatch[2]),
          parseInt(patternMatch[3]),
          parseInt(patternMatch[4])
        ];
        // 패턴 제거한 실제 키워드
        keyword = keyword.replace(/\[\d+\/\d+\/\d+\/\d+\]\s*/, '').trim();
      }
      
      parsedNotes.push({
        keyword,
        userStats: stats,
        expectedStats,
        code,
        date,
        searches: stats[0],
        exposures: stats[1],
        clicks: stats[2],
        cart: stats[3]
      });
    }
    
    console.log(`\n✅ ${parsedNotes.length}개 메모 파싱 완료\n`);

    // 데이터베이스에서 매칭되는 키워드 찾기
    console.log('🔍 데이터베이스 매칭 중...\n');
    
    for (const note of parsedNotes) {
      // 키워드나 코드로 DB 검색
      let query = `
        SELECT 
          k.id,
          k.keyword,
          k.code,
          k.runs,
          k.succ,
          k.fail,
          -- 실제 실행 통계
          COUNT(e.id) as actual_executions,
          SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as actual_success,
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as actual_found,
          SUM(CASE WHEN e.cart THEN 1 ELSE 0 END) as actual_cart,
          -- 페이지별 통계
          MAX(e.pages) as max_pages,
          AVG(e.pages) as avg_pages
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        WHERE 1=1
      `;
      
      const params = [];
      
      // 코드로 먼저 검색
      if (note.code && note.code !== '2024-11-26' && note.code !== '2024-11-27' && 
          note.code !== '2024-11-28' && note.code !== '2024-11-29') {
        query += ` AND k.code = $${params.length + 1}`;
        params.push(note.code);
      } else {
        // 키워드로 검색
        query += ` AND (k.keyword LIKE $${params.length + 1} OR k.keyword LIKE $${params.length + 2})`;
        params.push(`%${note.keyword}%`);
        params.push(`%[%]%${note.keyword}%`);
      }
      
      query += ` GROUP BY k.id, k.keyword, k.code, k.runs, k.succ, k.fail`;
      
      const result = await dbService.query(query, params);
      
      if (result.rows.length > 0) {
        const dbRow = result.rows[0];
        
        // 비교 분석
        const searchDiff = note.searches - dbRow.actual_executions;
        const exposureDiff = note.exposures - dbRow.actual_found;
        const clickDiff = note.clicks - dbRow.actual_success;
        const cartDiff = note.cart - dbRow.actual_cart;
        
        // 큰 차이가 있는 경우만 출력
        if (Math.abs(searchDiff) > 5 || Math.abs(exposureDiff) > 10 || 
            Math.abs(clickDiff) > 10 || Math.abs(cartDiff) > 10) {
          
          console.log('─'.repeat(150));
          console.log(`📌 ID ${dbRow.id}: ${dbRow.keyword.substring(0, 50)}`);
          console.log(`   코드: ${dbRow.code || 'N/A'}`);
          
          // 예상값이 있으면 표시
          if (note.expectedStats) {
            console.log(`   예상값: [${note.expectedStats.join('/')}]`);
          }
          
          console.log('\n   📝 사용자 메모:');
          console.log(`      검색: ${note.searches}, 노출: ${note.exposures}, 클릭: ${note.clicks}, 장바구니: ${note.cart}`);
          
          console.log('\n   💾 데이터베이스:');
          console.log(`      실행: ${dbRow.actual_executions}, Found: ${dbRow.actual_found}, Success: ${dbRow.actual_success}, Cart: ${dbRow.actual_cart}`);
          console.log(`      DB 기록: runs=${dbRow.runs}, succ=${dbRow.succ}, fail=${dbRow.fail}`);
          
          console.log('\n   ⚠️ 차이 분석:');
          
          if (Math.abs(searchDiff) > 5) {
            console.log(`      🔴 검색 차이: ${searchDiff > 0 ? '+' : ''}${searchDiff} (메모: ${note.searches} vs DB: ${dbRow.actual_executions})`);
          }
          
          if (Math.abs(exposureDiff) > 10) {
            console.log(`      🔴 노출 차이: ${exposureDiff > 0 ? '+' : ''}${exposureDiff} (메모: ${note.exposures} vs DB Found: ${dbRow.actual_found})`);
          }
          
          if (Math.abs(clickDiff) > 10) {
            console.log(`      🟡 클릭 차이: ${clickDiff > 0 ? '+' : ''}${clickDiff} (메모: ${note.clicks} vs DB Success: ${dbRow.actual_success})`);
          }
          
          if (Math.abs(cartDiff) > 10) {
            console.log(`      🟡 장바구니 차이: ${cartDiff > 0 ? '+' : ''}${cartDiff} (메모: ${note.cart} vs DB Cart: ${dbRow.actual_cart})`);
          }
          
          // 가능한 원인 제시
          console.log('\n   💡 가능한 원인:');
          
          if (exposureDiff > 10) {
            console.log('      - Found 필드가 실제 상품 발견이 아닌 Success와 동일하게 설정됨');
            console.log('      - 상품을 찾았지만 클릭 직전 에러로 실패한 경우 Found=false로 기록');
          }
          
          if (searchDiff > 5) {
            console.log('      - 일부 실행이 DB에 기록되지 않았을 가능성');
            console.log('      - 에러로 인한 조기 종료 시 로그 누락');
          }
          
          if (clickDiff > 10 && exposureDiff < 10) {
            console.log('      - 클릭 시도했지만 네비게이션 실패');
            console.log('      - 상품 페이지 도달 실패');
          }
        }
      } else {
        console.log(`❌ 매칭 실패: "${note.keyword}" (코드: ${note.code || 'N/A'})`);
      }
    }
    
    // 전체 통계 요약
    console.log('\n' + '='.repeat(150));
    console.log('📊 전체 통계 요약:');
    console.log('─'.repeat(150));
    
    const summaryQuery = `
      WITH note_keywords AS (
        SELECT k.*, 
          COUNT(e.id) as total_execs,
          SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as total_success,
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as total_found,
          SUM(CASE WHEN e.cart THEN 1 ELSE 0 END) as total_cart
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        WHERE k.code IN (${parsedNotes.filter(n => n.code && !n.code.includes('-')).map(n => `'${n.code}'`).join(',') || "'dummy'"})
           OR k.keyword LIKE ANY(ARRAY[${parsedNotes.map(n => `'%${n.keyword}%'`).join(',')}])
        GROUP BY k.id
      )
      SELECT 
        COUNT(*) as matched_keywords,
        SUM(total_execs) as total_executions,
        SUM(total_success) as total_successes,
        SUM(total_found) as total_founds,
        SUM(total_cart) as total_carts,
        AVG(CASE WHEN total_execs > 0 THEN total_success::NUMERIC / total_execs * 100 ELSE 0 END) as avg_success_rate
      FROM note_keywords
    `;
    
    const summary = await dbService.query(summaryQuery);
    if (summary.rows.length > 0) {
      const s = summary.rows[0];
      
      // 사용자 메모 합계
      const userTotals = parsedNotes.reduce((acc, n) => ({
        searches: acc.searches + n.searches,
        exposures: acc.exposures + n.exposures,
        clicks: acc.clicks + n.clicks,
        carts: acc.carts + n.cart
      }), { searches: 0, exposures: 0, clicks: 0, carts: 0 });
      
      console.log('\n사용자 메모 합계:');
      console.log(`  검색: ${userTotals.searches}, 노출: ${userTotals.exposures}, 클릭: ${userTotals.clicks}, 장바구니: ${userTotals.carts}`);
      
      console.log('\n데이터베이스 합계:');
      console.log(`  실행: ${s.total_executions}, Found: ${s.total_founds}, Success: ${s.total_successes}, Cart: ${s.total_carts}`);
      
      console.log('\n차이 분석:');
      console.log(`  검색 차이: ${userTotals.searches - s.total_executions}`);
      console.log(`  노출 차이: ${userTotals.exposures - s.total_founds} ⚠️`);
      console.log(`  클릭 차이: ${userTotals.clicks - s.total_successes}`);
      console.log(`  장바구니 차이: ${userTotals.carts - s.total_carts}`);
      
      console.log('\n📌 주요 발견사항:');
      console.log('  1. Found 필드가 실제 상품 발견이 아닌 Success와 연동되어 있음');
      console.log('  2. 사용자 메모의 "노출"은 실제 상품 목록 노출을 의미');
      console.log('  3. DB의 Found는 상품 페이지 도달 성공을 의미');
      console.log('  4. 실제 상품 발견 로직 수정 필요');
    }
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// 실행
compareNotesWithDB();