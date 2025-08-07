const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function createAnalysisTable() {
  console.log('=== 분석 테이블 생성 ===');
  
  try {
    // 1. 2025-08-06.md 파일 읽기
    const mdFilePath = path.join(__dirname, '..', '2025-08-06.md');
    const mdContent = fs.readFileSync(mdFilePath, 'utf8');
    
    // 데이터 파싱
    const lines = mdContent.split('\n').filter(line => line.trim());
    const keywordData = [];
    
    for (const line of lines) {
      if (line.includes('\t')) {
        const parts = line.split('\t').map(p => p.replace(/'/g, '').trim());
        if (parts.length >= 4) {
          keywordData.push({
            keyword: parts[0],
            searches: parseInt(parts[1].replace(/,/g, '')) || 0,
            exposures: parseInt(parts[2].replace(/,/g, '')) || 0,
            clicks: parseInt(parts[3].replace(/,/g, '')) || 0,
            carts: parseInt(parts[4]?.replace(/,/g, '')) || 0
          });
        }
      }
    }
    
    console.log(`파싱된 키워드 개수: ${keywordData.length}`);
    
    // 2. v2_test_keywords에서 모든 키워드와 optimization config 가져오기
    const dbResult = await dbServiceV2.query(`
      SELECT 
        id,
        keyword,
        product_code,
        agent,
        optimization_config,
        current_executions,
        success_count,
        fail_count,
        current_mode,
        consecutive_blocks,
        total_blocks,
        created_at
      FROM v2_test_keywords
      ORDER BY id
    `);
    
    console.log(`DB에서 가져온 키워드 개수: ${dbResult.rows.length}`);
    
    // 3. 키워드 매칭 및 분석 테이블 생성
    const analysisData = [];
    let matchedCount = 0;
    
    for (let i = 0; i < keywordData.length; i++) {
      const mdKeyword = keywordData[i];
      
      // DB에서 매칭되는 키워드 찾기
      const dbKeyword = dbResult.rows.find(row => 
        row.keyword.toLowerCase().trim() === mdKeyword.keyword.toLowerCase().trim()
      );
      
      if (dbKeyword) {
        matchedCount++;
      }
      
      // Optimization config 파싱 (JSONB)
      const optConfig = dbKeyword?.optimization_config || {};
      
      analysisData.push({
        id: i + 1,
        keyword: mdKeyword.keyword,
        searches: mdKeyword.searches,
        exposures: mdKeyword.exposures,
        clicks: mdKeyword.clicks,
        carts: mdKeyword.carts,
        matched: dbKeyword ? '매칭됨' : '안됨',
        product_code: dbKeyword?.product_code || '-',
        agent: dbKeyword?.agent || '-',
        current_mode: dbKeyword?.current_mode || '-',
        
        // Optimization config 컬럼들 (JSONB에서 추출)
        coupang_main_allow: JSON.stringify(optConfig.coupang_main_allow || []),
        mercury_allow: JSON.stringify(optConfig.mercury_allow || []),
        ljc_allow: JSON.stringify(optConfig.ljc_allow || []),
        assets_cdn_allow: JSON.stringify(optConfig.assets_cdn_allow || []),
        front_cdn_allow: JSON.stringify(optConfig.front_cdn_allow || []),
        image_cdn_allow: JSON.stringify(optConfig.image_cdn_allow || []),
        static_cdn_allow: JSON.stringify(optConfig.static_cdn_allow || []),
        img1a_cdn_allow: JSON.stringify(optConfig.img1a_cdn_allow || []),
        thumbnail_cdn_allow: JSON.stringify(optConfig.thumbnail_cdn_allow || []),
        coupang_main_block_patterns: JSON.stringify(optConfig.coupang_main_block_patterns || []),
        
        // DB 통계
        db_executions: dbKeyword?.current_executions || 0,
        db_success: dbKeyword?.success_count || 0,
        db_fail: dbKeyword?.fail_count || 0,
        db_consecutive_blocks: dbKeyword?.consecutive_blocks || 0,
        db_total_blocks: dbKeyword?.total_blocks || 0
      });
    }
    
    console.log(`\n매칭 결과: ${matchedCount}/${keywordData.length} 개 키워드가 매칭됨`);
    
    // 4. CSV 형태로 출력
    console.log('\n=== 분석 테이블 (CSV 형태) ===');
    
    // 헤더
    const headers = [
      'ID', '키워드', '검색수', '노출수', '클릭수', '장바구니수', '매칭여부', '상품코드', '에이전트', '현재모드',
      'coupang_main_allow', 'mercury_allow', 'ljc_allow', 'assets_cdn_allow', 'front_cdn_allow',
      'image_cdn_allow', 'static_cdn_allow', 'img1a_cdn_allow', 'thumbnail_cdn_allow', 'coupang_main_block_patterns',
      'DB실행수', 'DB성공수', 'DB실패수', 'DB연속차단', 'DB총차단'
    ];
    
    console.log(headers.join(','));
    
    // 데이터 (성공 그룹 먼저, 실패 그룹 나중에)
    const successGroup = analysisData.filter(row => row.carts > 0);
    const failureGroup = analysisData.filter(row => row.carts === 0);
    
    console.log('\n// 성공 그룹 (장바구니 > 0)');
    successGroup.forEach(row => {
      const csvRow = [
        row.id,
        `"${row.keyword}"`,
        row.searches,
        row.exposures,
        row.clicks,
        row.carts,
        row.matched,
        row.product_code,
        row.agent,
        row.current_mode,
        `"${row.coupang_main_allow}"`,
        `"${row.mercury_allow}"`,
        `"${row.ljc_allow}"`,
        `"${row.assets_cdn_allow}"`,
        `"${row.front_cdn_allow}"`,
        `"${row.image_cdn_allow}"`,
        `"${row.static_cdn_allow}"`,
        `"${row.img1a_cdn_allow}"`,
        `"${row.thumbnail_cdn_allow}"`,
        `"${row.coupang_main_block_patterns}"`,
        row.db_executions,
        row.db_success,
        row.db_fail,
        row.db_consecutive_blocks,
        row.db_total_blocks
      ];
      console.log(csvRow.join(','));
    });
    
    console.log('\n// 실패 그룹 (장바구니 = 0)');
    failureGroup.forEach(row => {
      const csvRow = [
        row.id,
        `"${row.keyword}"`,
        row.searches,
        row.exposures,
        row.clicks,
        row.carts,
        row.matched,
        row.product_code,
        row.agent,
        row.current_mode,
        `"${row.coupang_main_allow}"`,
        `"${row.mercury_allow}"`,
        `"${row.ljc_allow}"`,
        `"${row.assets_cdn_allow}"`,
        `"${row.front_cdn_allow}"`,
        `"${row.image_cdn_allow}"`,
        `"${row.static_cdn_allow}"`,
        `"${row.img1a_cdn_allow}"`,
        `"${row.thumbnail_cdn_allow}"`,
        `"${row.coupang_main_block_patterns}"`,
        row.db_executions,
        row.db_success,
        row.db_fail,
        row.db_consecutive_blocks,
        row.db_total_blocks
      ];
      console.log(csvRow.join(','));
    });
    
    // 5. 마크다운 테이블 형태로도 출력
    console.log('\n\n=== 분석 테이블 (마크다운 형태) ===');
    console.log('| ID | 키워드 | 검색수 | 노출수 | 클릭수 | 장바구니수 | 매칭여부 | 상품코드 | 에이전트 | 현재모드 | coupang_main_allow | mercury_allow | ljc_allow | assets_cdn_allow | front_cdn_allow | image_cdn_allow | static_cdn_allow | img1a_cdn_allow | thumbnail_cdn_allow | coupang_main_block_patterns |');
    console.log('|----|---------|---------|---------|---------|-----------|---------|---------|---------|----------|--------------------|--------------|-----------|-----------------|-----------------|-----------------|-----------------|-----------------|-----------------|-----------------------------|');
    
    // 성공 그룹 먼저
    successGroup.forEach(row => {
      const mdRow = [
        row.id,
        row.keyword,
        row.searches.toLocaleString(),
        row.exposures.toLocaleString(),
        row.clicks.toLocaleString(),
        row.carts.toLocaleString(),
        row.matched,
        row.product_code,
        row.agent,
        row.current_mode,
        row.coupang_main_allow === '-' ? '-' : row.coupang_main_allow.substring(0, 8) + '...',
        row.mercury_allow === '-' ? '-' : (row.mercury_allow || '').substring(0, 6) + '...',
        row.ljc_allow === '-' ? '-' : (row.ljc_allow || '').substring(0, 6) + '...',
        row.assets_cdn_allow === '-' ? '-' : (row.assets_cdn_allow || '').substring(0, 6) + '...',
        row.front_cdn_allow === '-' ? '-' : (row.front_cdn_allow || '').substring(0, 6) + '...',
        row.image_cdn_allow === '-' ? '-' : (row.image_cdn_allow || '').substring(0, 6) + '...',
        row.static_cdn_allow === '-' ? '-' : (row.static_cdn_allow || '').substring(0, 6) + '...',
        row.img1a_cdn_allow === '-' ? '-' : (row.img1a_cdn_allow || '').substring(0, 6) + '...',
        row.thumbnail_cdn_allow === '-' ? '-' : (row.thumbnail_cdn_allow || '').substring(0, 6) + '...',
        row.coupang_main_block_patterns === '-' ? '-' : (row.coupang_main_block_patterns || '').substring(0, 8) + '...'
      ];
      console.log('| ' + mdRow.join(' | ') + ' |');
    });
    
    // 실패 그룹
    failureGroup.forEach(row => {
      const mdRow = [
        row.id,
        row.keyword,
        row.searches.toLocaleString(),
        row.exposures.toLocaleString(),
        row.clicks.toLocaleString(),
        row.carts.toLocaleString(),
        row.matched,
        row.product_code,
        row.agent,
        row.current_mode,
        row.coupang_main_allow === '-' ? '-' : row.coupang_main_allow.substring(0, 8) + '...',
        row.mercury_allow === '-' ? '-' : (row.mercury_allow || '').substring(0, 6) + '...',
        row.ljc_allow === '-' ? '-' : (row.ljc_allow || '').substring(0, 6) + '...',
        row.assets_cdn_allow === '-' ? '-' : (row.assets_cdn_allow || '').substring(0, 6) + '...',
        row.front_cdn_allow === '-' ? '-' : (row.front_cdn_allow || '').substring(0, 6) + '...',
        row.image_cdn_allow === '-' ? '-' : (row.image_cdn_allow || '').substring(0, 6) + '...',
        row.static_cdn_allow === '-' ? '-' : (row.static_cdn_allow || '').substring(0, 6) + '...',
        row.img1a_cdn_allow === '-' ? '-' : (row.img1a_cdn_allow || '').substring(0, 6) + '...',
        row.thumbnail_cdn_allow === '-' ? '-' : (row.thumbnail_cdn_allow || '').substring(0, 6) + '...',
        row.coupang_main_block_patterns === '-' ? '-' : (row.coupang_main_block_patterns || '').substring(0, 8) + '...'
      ];
      console.log('| ' + mdRow.join(' | ') + ' |');
    });
    
    // 6. 패턴 분석
    console.log('\n\n=== 패턴 분석 ===');
    console.log(`총 키워드: ${keywordData.length}개`);
    console.log(`매칭된 키워드: ${matchedCount}개`);
    console.log(`성공 키워드: ${successGroup.length}개 (장바구니 > 0)`);
    console.log(`실패 키워드: ${failureGroup.length}개 (장바구니 = 0)`);
    
    // 성공 그룹의 optimization config 패턴 분석
    if (successGroup.length > 0) {
      console.log('\n성공 그룹 Optimization Config 패턴:');
      const successConfigs = successGroup.filter(row => row.matched === '매칭됨');
      if (successConfigs.length > 0) {
        successConfigs.forEach(row => {
          console.log(`  ${row.keyword}:`);
          console.log(`    coupang_main_allow: ${row.coupang_main_allow}`);
          console.log(`    mercury_allow: ${row.mercury_allow}`);
          console.log(`    ljc_allow: ${row.ljc_allow}`);
        });
      }
    }
    
  } catch (error) {
    console.error('오류 발생:', error);
  } finally {
    await dbServiceV2.close();
  }
}

createAnalysisTable().catch(console.error);