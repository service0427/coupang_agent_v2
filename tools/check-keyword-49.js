const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function checkKeyword49() {
  try {
    console.log('=== ID 49번 키워드 상세 확인 ===\n');
    
    // 1. 키워드 49번 상세 정보
    const keywordResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, cart_click_enabled, success_count, fail_count,
             optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id = 49
    `);
    
    if (keywordResult.rows.length === 0) {
      console.log('❌ ID 49번 키워드를 찾을 수 없습니다.');
      return;
    }
    
    const keyword = keywordResult.rows[0];
    console.log('🔍 키워드 기본 정보:');
    console.log(`ID: ${keyword.id}`);
    console.log(`키워드: ${keyword.keyword}`);
    console.log(`에이전트: ${keyword.agent}`);
    console.log(`Cart 활성화: ${keyword.cart_click_enabled}`);
    console.log(`성공: ${keyword.success_count}, 실패: ${keyword.fail_count}`);
    console.log(`생성일: ${keyword.created_at}`);
    // console.log(`수정일: ${keyword.updated_at || 'N/A'}`);
    console.log('');
    
    // 2. 실행 로그 확인 (최근 실행 기록)
    const logResult = await dbServiceV2.query(`
      SELECT keyword_id, stage1_search_status, stage3_click_status, stage4_cart_status,
             overall_success, started_at, completed_at,
             search_results_count, click_results_count
      FROM v2_execution_logs 
      WHERE keyword_id = 49
      ORDER BY completed_at DESC
      LIMIT 10
    `);
    
    console.log(`📊 최근 실행 로그 (${logResult.rows.length}개):`);
    logResult.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. 실행시간: ${row.completed_at}`);
      console.log(`   검색: ${row.stage1_search_status}, 클릭: ${row.stage3_click_status}, 카트: ${row.stage4_cart_status}`);
      console.log(`   전체 성공: ${row.overall_success}`);
      console.log(`   검색결과: ${row.search_results_count}개, 클릭결과: ${row.click_results_count}개`);
      console.log('');
    });
    
    // 3. 비슷한 키워드들 검색 (중복 여부 확인)
    const similarResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, created_at
      FROM v2_test_keywords 
      WHERE keyword ILIKE '%먼지필터통%' OR keyword ILIKE '%먼지통%'
      ORDER BY id
    `);
    
    console.log(`🔍 '먼지필터통' 또는 '먼지통' 포함 키워드들:`);
    similarResult.rows.forEach(row => {
      const highlight = row.id === 49 ? ' ⭐ (현재 키워드)' : '';
      console.log(`  ID ${row.id}: ${row.keyword} (${row.agent})${highlight}`);
      console.log(`    생성일: ${row.created_at}`);
    });
    
    // 4. MD 파일에서 해당 키워드 확인
    const mdPath = path.join(__dirname, '..', '2025-08-06.md');
    if (fs.existsSync(mdPath)) {
      const mdData = fs.readFileSync(mdPath, 'utf8');
      const mdLines = mdData.trim().split('\n');
      
      console.log(`\n📄 2025-08-06.md 파일에서 관련 키워드 확인:`);
      let found = false;
      mdLines.forEach((line, idx) => {
        if (line.includes('먼지필터통') || line.includes('먼지통')) {
          found = true;
          const parts = line.split('\t');
          const keyword = parts[0] ? parts[0].replace(/'/g, '').trim() : '';
          console.log(`  라인 ${idx + 1}: ${keyword}`);
          if (parts.length >= 5) {
            console.log(`    검색:${parts[1]}, 노출:${parts[2]}, 클릭:${parts[3]}, 담기:${parts[4]}`);
          }
        }
      });
      
      if (!found) {
        console.log('  관련 키워드가 MD 파일에서 발견되지 않았습니다.');
      }
    } else {
      console.log('  2025-08-06.md 파일을 찾을 수 없습니다.');
    }
    
    // 5. 키워드명에서 "- 중복" 제거한 버전이 있는지 확인
    const cleanKeyword = keyword.keyword.replace(' - 중복', '').trim();
    const duplicateCheckResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, created_at
      FROM v2_test_keywords 
      WHERE keyword = $1 OR keyword ILIKE $2
      ORDER BY id
    `, [cleanKeyword, `%${cleanKeyword}%`]);
    
    console.log(`\n🔍 중복 확인 - "${cleanKeyword}" 관련 키워드들:`);
    duplicateCheckResult.rows.forEach(row => {
      const highlight = row.id === 49 ? ' ⭐ (현재 키워드)' : '';
      const isDuplicate = row.keyword.includes('- 중복') ? ' 🔄 (중복표시)' : '';
      console.log(`  ID ${row.id}: ${row.keyword} (${row.agent})${highlight}${isDuplicate}`);
      console.log(`    생성일: ${row.created_at}`);
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

checkKeyword49();