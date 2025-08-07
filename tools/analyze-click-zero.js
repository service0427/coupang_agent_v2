const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function analyzeClick0Issue() {
  try {
    console.log('=== ID 49번 클릭 0 문제 분석 ===\n');
    
    // ID 49번의 상세 실행 로그 확인
    const logResult = await dbServiceV2.query(`
      SELECT keyword_id, stage1_search_status, stage3_click_status, 
             stage4_cart_status, overall_success,
             completed_at, error_message
      FROM v2_execution_logs 
      WHERE keyword_id = 49
        AND completed_at >= '2025-08-06 00:00:00' 
        AND completed_at < '2025-08-07 00:00:00'
      ORDER BY completed_at
      LIMIT 10
    `);
    
    console.log('🔍 ID 49번 실행 로그 상세 분석:');
    logResult.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. 시간: ${row.completed_at}`);
      console.log(`   검색: ${row.stage1_search_status}`);
      console.log(`   클릭: ${row.stage3_click_status}`);
      console.log(`   카트: ${row.stage4_cart_status}`);
      console.log(`   전체성공: ${row.overall_success}`);
      if (row.error_message) {
        console.log(`   오류: ${row.error_message}`);
      }
      console.log('');
    });
    
    // 키워드명 분석
    console.log('\n🔍 키워드명 분석:');
    const keyword = '비룸 퓨어라이트 먼지필터통 - 중복';
    console.log(`원본 키워드: ${keyword}`);
    console.log(`길이: ${keyword.length}자`);
    console.log(`"- 중복" 포함: ${keyword.includes('- 중복')}`);
    console.log(`"중복" 위치: ${keyword.indexOf('중복')}`);
    
    // MD 파일에서 해당 키워드의 정확한 데이터 확인
    const mdPath = path.join(__dirname, '..', '2025-08-06.md');
    if (fs.existsSync(mdPath)) {
      const mdData = fs.readFileSync(mdPath, 'utf8');
      const lines = mdData.split('\n');
      console.log('\n📄 MD 파일에서 정확한 데이터:');
      lines.forEach((line, idx) => {
        if (line.includes('먼지필터통 - 중복')) {
          const parts = line.split('\t');
          console.log(`라인 ${idx + 1}: ${line}`);
          console.log(`파싱 결과:`);
          parts.forEach((part, i) => {
            console.log(`  [${i}]: ${part}`);
          });
        }
      });
    }
    
    // 다른 키워드들과 비교 (클릭 상태)
    const compareResult = await dbServiceV2.query(`
      SELECT keyword_id, 
             SUM(CASE WHEN stage3_click_status = 'success' THEN 1 ELSE 0 END) as click_success,
             SUM(CASE WHEN stage3_click_status = 'failure' THEN 1 ELSE 0 END) as click_failure,
             SUM(CASE WHEN stage3_click_status = 'not_required' THEN 1 ELSE 0 END) as click_not_required,
             array_agg(DISTINCT stage3_click_status) as click_statuses
      FROM v2_execution_logs 
      WHERE keyword_id IN (48, 49, 50) -- 비교군
        AND completed_at >= '2025-08-06 00:00:00' 
        AND completed_at < '2025-08-07 00:00:00'
      GROUP BY keyword_id
      ORDER BY keyword_id
    `);
    
    console.log('\n📊 ID 48,49,50 클릭 상태 비교:');
    compareResult.rows.forEach(row => {
      console.log(`ID ${row.keyword_id}:`);
      console.log(`  클릭 성공: ${row.click_success}`);
      console.log(`  클릭 실패: ${row.click_failure}`);
      console.log(`  클릭 불필요: ${row.click_not_required}`);
      console.log(`  클릭 상태들: ${row.click_statuses}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

analyzeClick0Issue();