const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function compareMdVsDb() {
  try {
    console.log('=== 2025-08-06.md vs DB 데이터 정밀 비교 ===\n');
    
    // 1. 2025-08-06.md 데이터 읽기
    const mdPath = path.join(__dirname, '..', '2025-08-06.md');
    const mdData = fs.readFileSync(mdPath, 'utf8');
    const mdLines = mdData.trim().split('\n');
    const mdKeywords = [];
    
    mdLines.forEach(line => {
      const parts = line.split('\t');
      if (parts.length >= 5) {
        mdKeywords.push({
          keyword: parts[0].replace(/'/g, '').trim(),
          search: parseInt(parts[1].replace(/[',]/g, '')) || 0,
          exposure: parseInt(parts[2].replace(/[',]/g, '')) || 0,
          click: parseInt(parts[3].replace(/[',]/g, '')) || 0,
          cart: parseInt(parts[4].replace(/[',]/g, '')) || 0
        });
      }
    });
    
    // 2. DB에서 키워드 정보 가져오기 (ID 25~61 포함하여 모두)
    const keywordsResult = await dbServiceV2.query(`
      SELECT id, keyword, agent, current_executions, success_count, fail_count,
             optimization_config, created_at
      FROM v2_test_keywords 
      WHERE id >= 25 AND id <= 61
      ORDER BY id
    `);
    
    // 3. DB에서 2025-08-06 실행 로그 가져오기
    const logsResult = await dbServiceV2.query(`
      SELECT 
        keyword_id,
        COUNT(*) as total_executions,
        SUM(CASE WHEN stage4_cart_status = 'success' THEN 1 ELSE 0 END) as cart_success_count,
        SUM(CASE WHEN stage3_click_status = 'success' THEN 1 ELSE 0 END) as click_success_count,
        SUM(CASE WHEN overall_success = true THEN 1 ELSE 0 END) as overall_success_count,
        MAX(completed_at) as last_execution
      FROM v2_execution_logs 
      WHERE completed_at >= '2025-08-06 00:00:00' 
        AND completed_at < '2025-08-07 00:00:00'
      GROUP BY keyword_id
    `);
    
    console.log(`MD 데이터: ${mdKeywords.length}개 키워드`);
    console.log(`DB 키워드: ${keywordsResult.rows.length}개 키워드`);
    console.log(`DB 2025-08-06 실행 로그: ${logsResult.rows.length}개 키워드\n`);
    
    // 4. 비교 분석
    console.log('='.repeat(120));
    console.log('ID  | 키워드                     | MD_장바구니 | DB_성공수 | MD_클릭 | DB_총실행 | 차이점                | 일치');
    console.log('='.repeat(120));
    
    let matchCount = 0;
    let mismatchCount = 0;
    const detailedMismatches = [];
    
    for (const mdItem of mdKeywords) {
      // 키워드 매칭
      const dbKeyword = keywordsResult.rows.find(row => 
        row.keyword.trim().toLowerCase() === mdItem.keyword.trim().toLowerCase()
      );
      
      if (dbKeyword) {
        // 실행 로그 매칭
        const dbLog = logsResult.rows.find(log => log.keyword_id === dbKeyword.id);
        
        const dbCartSuccess = dbLog ? dbLog.cart_success_count : 0;
        const dbClickSuccess = dbLog ? dbLog.click_success_count : 0;
        const dbTotal = dbLog ? dbLog.total_executions : 0;
        
        const cartMatch = mdItem.cart === dbCartSuccess;
        const clickMatch = mdItem.click === dbTotal;
        const isMatch = cartMatch && clickMatch;
        
        let differences = [];
        if (!cartMatch) differences.push(`장바구니(${mdItem.cart}≠${dbCartSuccess})`);
        if (!clickMatch) differences.push(`클릭(${mdItem.click}≠${dbTotal})`);
        
        const diffText = differences.length > 0 ? differences.join(', ') : '없음';
        
        console.log(
          `${dbKeyword.id.toString().padStart(3)} | ${mdItem.keyword.substring(0,25).padEnd(25)} | ${mdItem.cart.toString().padStart(11)} | ${dbCartSuccess.toString().padStart(9)} | ${mdItem.click.toString().padStart(7)} | ${dbTotal.toString().padStart(9)} | ${diffText.padEnd(20)} | ${isMatch ? '✅' : '❌'}`
        );
        
        if (isMatch) {
          matchCount++;
        } else {
          mismatchCount++;
          detailedMismatches.push({
            id: dbKeyword.id,
            keyword: mdItem.keyword,
            agent: dbKeyword.agent,
            md: mdItem,
            db: { cart_success: dbCartSuccess, click_success: dbClickSuccess, total: dbTotal }
          });
        }
      } else {
        console.log(`??? | ${mdItem.keyword.substring(0,25).padEnd(25)} | ${mdItem.cart.toString().padStart(11)} | N/A       | ${mdItem.click.toString().padStart(7)} | N/A       | 키워드 미매칭        | ❌`);
        mismatchCount++;
      }
    }
    
    console.log('='.repeat(120));
    console.log(`\n=== 비교 결과 요약 ===`);
    console.log(`✅ 데이터 일치: ${matchCount}개`);
    console.log(`❌ 데이터 불일치: ${mismatchCount}개`);
    console.log(`📊 데이터 일치율: ${((matchCount/(matchCount+mismatchCount))*100).toFixed(1)}%`);
    
    // 5. 불일치 항목 상세 분석
    if (detailedMismatches.length > 0) {
      console.log(`\n=== 데이터 불일치 상세 분석 ===`);
      detailedMismatches.forEach(item => {
        console.log(`\n🔍 [ID:${item.id}] ${item.keyword}`);
        console.log(`   에이전트: ${item.agent}`);
        console.log(`   📋 MD 데이터    : 클릭 ${item.md.click}, 장바구니 ${item.md.cart}`);
        console.log(`   💾 DB 실행 로그 : 총 ${item.db.total}, 장바구니성공 ${item.db.cart_success}, 클릭성공 ${item.db.click_success}`);
        
        if (item.md.cart !== item.db.cart_success) {
          console.log(`   ⚠️  장바구니 불일치: MD(${item.md.cart}) vs DB 장바구니성공(${item.db.cart_success})`);
        }
        if (item.md.click !== item.db.total) {
          console.log(`   ⚠️  클릭 불일치: MD(${item.md.click}) vs DB 총실행(${item.db.total})`);
        }
      });
    }
    
    // 6. 성공 키워드 패턴 분석
    const successKeywords = mdKeywords.filter(item => item.cart > 0);
    console.log(`\n=== 성공 키워드 패턴 (장바구니 > 0) ===`);
    successKeywords.forEach(item => {
      const dbKeyword = keywordsResult.rows.find(row => 
        row.keyword.trim().toLowerCase() === item.keyword.trim().toLowerCase()
      );
      if (dbKeyword) {
        console.log(`✅ [${dbKeyword.id}] ${item.keyword}`);
        console.log(`   장바구니: ${item.cart}, 클릭: ${item.click}, 에이전트: ${dbKeyword.agent}`);
      }
    });
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await dbServiceV2.close();
  }
}

// 스크립트 직접 실행
if (require.main === module) {
  compareMdVsDb();
}

module.exports = { compareMdVsDb };