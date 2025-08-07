/**
 * 키워드별 optimization_config 분석 테이블 생성 도구
 * 2025-08-06.md 데이터와 v2_test_keywords 테이블을 매칭하여 분석
 */

const fs = require('fs');
const path = require('path');
const dbServiceV2 = require('../lib/services/db-service-v2');

/**
 * 2025-08-06.md 파일에서 실제 데이터 읽기
 */
function readDataFromFile() {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const mdFilePath = path.join(__dirname, '..', '2025-08-06.md');
    const fileContent = fs.readFileSync(mdFilePath, 'utf8');
    return fileContent.trim();
  } catch (error) {
    console.error('2025-08-06.md 파일 읽기 실패:', error);
    // 폴백 데이터 (실제 파일과 동일)
    return `'퓨어라이트 비룸 연장봉 b1'	'89'	'89'	'88'	'77'
'퓨어라이트 비룸 연장봉 v9'	'89'	'89'	'87'	'78'
'비룸 퓨어라이트 연장봉'	'13'	'88'	'87'	'76'
'연장봉 비룸 퓨어라이트 무선청소기 23000 V9-B1'	'13'	'13'	'13'	'0'
'비룸 무선청소기 퓨어라이트 헤파필터'	'78'	'78'	'78'	'0'
'비룸 23000 V9-B1 청소기 필터 헤파'	'77'	'76'	'76'	'0'
'비룸 청소기 정품 헤파필터'	'74'	'73'	'72'	'0'
'비룸 퓨어라이트 먼지필터통 - 중복'	'64'	'49'	'0'	'0'
'비룸 23000 V9-B1 배터리 연결잭'	'65'	'46'	'44'	'36'
'비룸 청소기 전용 전원 충전기'	'65'	'38'	'36'	'26'
'비룸 청소기 전용 전원 아답터'	'82'	'24'	'23'	'21'
'비룸 무선청소기 투명 먼지통 리필'	'100'	'100'	'100'	'0'
'비룸 23000 V9-B1 청소기 먼지통 교체'	'82'	'82'	'82'	'73'
'비룸 무선청소기 퓨어라이트 먼지통'	'82'	'82'	'82'	'73'
'비룸 청소기 분리형 먼지통 부품'	'81'	'81'	'81'	'0'
'비룸 퓨어라이트 청소기 수거통'	'82'	'81'	'81'	'0'
'비룸 청소기 먼지 수거통 정품'	'64'	'64'	'63'	'0'
'비룸 무선청소기 리필형 먼지통'	'13'	'13'	'13'	'0'`;
  }
}

/**
 * 원시 데이터 파싱
 */
function parseRawData() {
  const rawData = readDataFromFile();
  const lines = rawData.trim().split('\n');
  const results = [];
  
  lines.forEach((line, index) => {
    // 탭으로 구분된 데이터 파싱
    const parts = line.split('\t');
    if (parts.length >= 5) {
      const keyword = parts[0].replace(/'/g, '').trim();
      const search = parseInt(parts[1].replace(/[',]/g, '')) || 0;
      const exposure = parseInt(parts[2].replace(/[',]/g, '')) || 0;
      const click = parseInt(parts[3].replace(/[',]/g, '')) || 0;
      const cart = parseInt(parts[4].replace(/[',]/g, '')) || 0;
      
      if (keyword) {
        results.push({
          id: index + 1,
          keyword: keyword,
          search: search,
          exposure: exposure,
          click: click,
          cart: cart
        });
      }
    }
  });
  
  return results;
}

/**
 * optimization_config를 개별 컬럼으로 분해
 */
function parseOptimizationConfig(config) {
  if (!config) {
    return {
      coupang_main_allow: null,
      image_cdn_allow: null,
      img1a_cdn_allow: null,
      front_cdn_allow: null,
      static_cdn_allow: null,
      assets_cdn_allow: null,
      mercury_allow: null,
      ljc_allow: null,
      thumbnail_cdn_allow: null,
      coupang_main_block_patterns: null
    };
  }
  
  let parsed;
  try {
    parsed = typeof config === 'string' ? JSON.parse(config) : config;
  } catch (e) {
    console.error('Config parsing error:', e);
    return {
      coupang_main_allow: 'PARSE_ERROR',
      image_cdn_allow: 'PARSE_ERROR',
      img1a_cdn_allow: 'PARSE_ERROR',
      front_cdn_allow: 'PARSE_ERROR',
      static_cdn_allow: 'PARSE_ERROR',
      assets_cdn_allow: 'PARSE_ERROR',
      mercury_allow: 'PARSE_ERROR',
      ljc_allow: 'PARSE_ERROR',
      thumbnail_cdn_allow: 'PARSE_ERROR',
      coupang_main_block_patterns: 'PARSE_ERROR'
    };
  }
  
  return {
    coupang_main_allow: JSON.stringify(parsed.coupang_main_allow || []),
    image_cdn_allow: JSON.stringify(parsed.image_cdn_allow || []),
    img1a_cdn_allow: JSON.stringify(parsed.img1a_cdn_allow || []),
    front_cdn_allow: JSON.stringify(parsed.front_cdn_allow || []),
    static_cdn_allow: JSON.stringify(parsed.static_cdn_allow || []),
    assets_cdn_allow: JSON.stringify(parsed.assets_cdn_allow || []),
    mercury_allow: JSON.stringify(parsed.mercury_allow || []),
    ljc_allow: JSON.stringify(parsed.ljc_allow || []),
    thumbnail_cdn_allow: JSON.stringify(parsed.thumbnail_cdn_allow || []),
    coupang_main_block_patterns: JSON.stringify(parsed.coupang_main_block_patterns || [])
  };
}

/**
 * 키워드 매칭 및 DB 조회
 */
async function matchKeywordsWithDB(parsedData) {
  try {
    // 모든 키워드 조회 (직접 쿼리 사용)
    const result = await dbServiceV2.query(`
      SELECT id, keyword, agent, current_mode, optimization_config, 
             current_executions, success_count, fail_count, 
             consecutive_blocks, total_blocks, created_at
      FROM v2_test_keywords 
      ORDER BY id
    `);
    const allKeywords = result.rows;
    console.log(`📋 DB에서 ${allKeywords.length}개 키워드 조회됨`);
    
    const results = [];
    
    for (const item of parsedData) {
      // 키워드 매칭 (정확 일치 및 유사 매칭)
      const exactMatch = allKeywords.find(k => k.keyword === item.keyword);
      let similarMatch = null;
      
      if (!exactMatch) {
        // 유사 매칭 (부분 문자열 포함)
        similarMatch = allKeywords.find(k => 
          k.keyword.includes(item.keyword) || item.keyword.includes(k.keyword)
        );
      }
      
      const match = exactMatch || similarMatch;
      const optimizationConfig = parseOptimizationConfig(match?.optimization_config);
      
      results.push({
        ...item,
        matched: !!match,
        db_id: match?.id || null,
        db_keyword: match?.keyword || null,
        match_type: exactMatch ? 'EXACT' : similarMatch ? 'SIMILAR' : 'NO_MATCH',
        ...optimizationConfig
      });
    }
    
    return results;
  } catch (error) {
    console.error('DB 매칭 오류:', error);
    throw error;
  }
}

/**
 * 마크다운 테이블 생성
 */
function generateMarkdownTable(results) {
  let markdown = `# 키워드별 Optimization Config 분석 테이블\n\n`;
  markdown += `생성일시: ${new Date().toISOString()}\n`;
  markdown += `총 키워드: ${results.length}개\n`;
  markdown += `매칭 성공: ${results.filter(r => r.matched).length}개\n\n`;
  
  // 성공/실패 그룹 구분
  const successGroup = results.filter(r => r.cart > 0);
  const failGroup = results.filter(r => r.cart === 0);
  
  markdown += `## 📊 요약\n`;
  markdown += `- ✅ 장바구니 성공: ${successGroup.length}개\n`;
  markdown += `- ❌ 장바구니 실패: ${failGroup.length}개\n\n`;
  
  // 전체 테이블
  markdown += `## 📋 전체 분석 테이블\n\n`;
  markdown += `| ID | 키워드 | 검색 | 노출 | 클릭 | 장바구니 | 매칭 | DB_ID | 매칭타입 | Main_Allow | Image_Allow | Img1a_Allow | Front_Allow | Static_Allow | Assets_Allow | Mercury_Allow | LJC_Allow | Thumbnail_Allow | Block_Patterns |\n`;
  markdown += `|----|--------|------|------|------|-----------|------|-------|----------|------------|-------------|-------------|-------------|--------------|--------------|---------------|-----------|-----------------|----------------|\n`;
  
  results.forEach(r => {
    markdown += `| ${r.id} | ${r.keyword} | ${r.search} | ${r.exposure} | ${r.click} | ${r.cart} | ${r.matched ? '✅' : '❌'} | ${r.db_id || 'N/A'} | ${r.match_type} | ${r.coupang_main_allow || 'N/A'} | ${r.image_cdn_allow || 'N/A'} | ${r.img1a_cdn_allow || 'N/A'} | ${r.front_cdn_allow || 'N/A'} | ${r.static_cdn_allow || 'N/A'} | ${r.assets_cdn_allow || 'N/A'} | ${r.mercury_allow || 'N/A'} | ${r.ljc_allow || 'N/A'} | ${r.thumbnail_cdn_allow || 'N/A'} | ${r.coupang_main_block_patterns || 'N/A'} |\n`;
  });
  
  // 성공 그룹 분석
  if (successGroup.length > 0) {
    markdown += `\n## ✅ 성공 그룹 분석 (장바구니 > 0)\n\n`;
    markdown += `| ID | 키워드 | 장바구니 | Image_Allow | Img1a_Allow | Front_Allow |\n`;
    markdown += `|----|--------|-----------|-------------|-------------|-------------|\n`;
    successGroup.forEach(r => {
      markdown += `| ${r.id} | ${r.keyword} | ${r.cart} | ${r.image_cdn_allow || 'N/A'} | ${r.img1a_cdn_allow || 'N/A'} | ${r.front_cdn_allow || 'N/A'} |\n`;
    });
  }
  
  // 실패 그룹 분석
  if (failGroup.length > 0) {
    markdown += `\n## ❌ 실패 그룹 분석 (장바구니 = 0)\n\n`;
    markdown += `| ID | 키워드 | 클릭 | Image_Allow | Img1a_Allow | Front_Allow | 매칭 |\n`;
    markdown += `|----|--------|------|-------------|-------------|-------------|------|\n`;
    failGroup.forEach(r => {
      markdown += `| ${r.id} | ${r.keyword} | ${r.click} | ${r.image_cdn_allow || 'N/A'} | ${r.img1a_cdn_allow || 'N/A'} | ${r.front_cdn_allow || 'N/A'} | ${r.matched ? '✅' : '❌'} |\n`;
    });
  }
  
  return markdown;
}

/**
 * CSV 테이블 생성
 */
function generateCSVTable(results) {
  const headers = [
    'ID', '키워드', '검색', '노출', '클릭', '장바구니', '매칭여부', 'DB_ID', '매칭타입',
    'Main_Allow', 'Image_Allow', 'Img1a_Allow', 'Front_Allow', 'Static_Allow',
    'Assets_Allow', 'Mercury_Allow', 'LJC_Allow', 'Thumbnail_Allow', 'Block_Patterns'
  ];
  
  let csv = headers.join(',') + '\n';
  
  results.forEach(r => {
    const row = [
      r.id,
      `"${r.keyword}"`,
      r.search,
      r.exposure,
      r.click,
      r.cart,
      r.matched ? '매칭됨' : '매칭안됨',
      r.db_id || 'N/A',
      r.match_type,
      `"${r.coupang_main_allow || 'N/A'}"`,
      `"${r.image_cdn_allow || 'N/A'}"`,
      `"${r.img1a_cdn_allow || 'N/A'}"`,
      `"${r.front_cdn_allow || 'N/A'}"`,
      `"${r.static_cdn_allow || 'N/A'}"`,
      `"${r.assets_cdn_allow || 'N/A'}"`,
      `"${r.mercury_allow || 'N/A'}"`,
      `"${r.ljc_allow || 'N/A'}"`,
      `"${r.thumbnail_cdn_allow || 'N/A'}"`,
      `"${r.coupang_main_block_patterns || 'N/A'}"`
    ];
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    console.log('🔍 2025-08-06 키워드 optimization_config 분석 시작');
    
    // 1. 원시 데이터 파싱
    console.log('📋 원시 데이터 파싱 중...');
    const parsedData = parseRawData();
    console.log(`   ✅ ${parsedData.length}개 키워드 파싱 완료`);
    
    // 2. DB와 매칭
    console.log('🔗 DB 키워드 매칭 중...');
    const matchedResults = await matchKeywordsWithDB(parsedData);
    const matchedCount = matchedResults.filter(r => r.matched).length;
    console.log(`   ✅ ${matchedCount}개 키워드 매칭 완료 (${((matchedCount/parsedData.length)*100).toFixed(1)}%)`);
    
    // 3. 마크다운 테이블 생성
    console.log('📝 마크다운 테이블 생성 중...');
    const markdownTable = generateMarkdownTable(matchedResults);
    const markdownPath = path.join(__dirname, '..', 'analysis-optimization-config-2025-08-06.md');
    fs.writeFileSync(markdownPath, markdownTable, 'utf8');
    console.log(`   ✅ 마크다운 파일 생성: ${markdownPath}`);
    
    // 4. CSV 테이블 생성
    console.log('📊 CSV 테이블 생성 중...');
    const csvTable = generateCSVTable(matchedResults);
    const csvPath = path.join(__dirname, '..', 'analysis-optimization-config-2025-08-06.csv');
    fs.writeFileSync(csvPath, csvTable, 'utf8');
    console.log(`   ✅ CSV 파일 생성: ${csvPath}`);
    
    // 5. 콘솔 출력
    console.log('\n' + '='.repeat(100));
    console.log('📋 키워드별 Optimization Config 분석 결과');
    console.log('='.repeat(100));
    console.log(`총 키워드: ${matchedResults.length}개`);
    console.log(`DB 매칭: ${matchedCount}개 (${((matchedCount/parsedData.length)*100).toFixed(1)}%)`);
    
    const successGroup = matchedResults.filter(r => r.cart > 0);
    const failGroup = matchedResults.filter(r => r.cart === 0);
    console.log(`성공 그룹: ${successGroup.length}개 (장바구니 > 0)`);
    console.log(`실패 그룹: ${failGroup.length}개 (장바구니 = 0)`);
    
    console.log('\n🎯 핵심 패턴:');
    if (successGroup.length > 0) {
      console.log('✅ 성공 그룹 optimization_config 특징:');
      successGroup.forEach(r => {
        if (r.matched) {
          console.log(`   [${r.id}] ${r.keyword} (장바구니: ${r.cart})`);
          console.log(`       Image: ${r.image_cdn_allow}, Img1a: ${r.img1a_cdn_allow}, Front: ${r.front_cdn_allow}`);
        }
      });
    }
    
    console.log('\n❌ 실패 그룹 optimization_config 특징:');
    const failedMatched = failGroup.filter(r => r.matched).slice(0, 5);
    failedMatched.forEach(r => {
      console.log(`   [${r.id}] ${r.keyword} (클릭: ${r.click})`);
      console.log(`       Image: ${r.image_cdn_allow}, Img1a: ${r.img1a_cdn_allow}, Front: ${r.front_cdn_allow}`);
    });
    
    console.log('\n' + '='.repeat(100));
    
  } catch (error) {
    console.error('❌ 분석 실패:', error);
  }
}

// 스크립트 직접 실행시
if (require.main === module) {
  main();
}

module.exports = {
  parseRawData,
  parseOptimizationConfig,
  matchKeywordsWithDB,
  generateMarkdownTable,
  generateCSVTable,
  main
};