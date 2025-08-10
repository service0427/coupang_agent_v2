const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

// 2025-08-07.md 파일에서 키워드 데이터 파싱
function parseMdFile() {
  const mdPath = path.join(__dirname, '..', '2025-08-07.md');
  
  if (!fs.existsSync(mdPath)) {
    console.log('📄 MD 파일을 찾을 수 없습니다:', mdPath);
    return {};
  }
  
  const content = fs.readFileSync(mdPath, 'utf8');
  const lines = content.split('\n');
  const mdData = {};
  
  lines.forEach((line, index) => {
    if (line.trim() && !line.startsWith('#')) {
      // 형식: 키워드\t숫자,숫자,숫자,숫자 (CR 포함)
      const match = line.match(/^(.+?)\t(\d+),(\d+),(\d+),(\d+)\r?$/);
      
      if (match) {
        const [, keyword, search, exposure, click, cart] = match;
        const cleanKeyword = keyword.trim();
        
        mdData[cleanKeyword] = {
          line_number: index + 1,
          search: parseInt(search),
          exposure: parseInt(exposure),
          click: parseInt(click),
          cart: parseInt(cart)
        };
        
        console.log(`MD 파싱: "${cleanKeyword}" → 검색:${search}, 노출:${exposure}, 클릭:${click}, 담기:${cart}`);
      }
    }
  });
  
  console.log(`📊 MD 파일에서 ${Object.keys(mdData).length}개 키워드 파싱 완료`);
  return mdData;
}

// 키워드 매칭 함수 (개선된 버전)
function findBestMatch(dbKeyword, mdData) {
  console.log(`\n🔍 매칭 시도: DB키워드 "${dbKeyword}"`);
  
  // 1. 정확히 일치하는 경우
  if (mdData[dbKeyword]) {
    console.log(`✅ 정확 매칭: "${dbKeyword}"`);
    return { keyword: dbKeyword, ...mdData[dbKeyword] };
  }
  
  // 2. * 제거하고 매칭
  const cleanDbKeyword = dbKeyword.replace(/^\*/, '');
  if (mdData[cleanDbKeyword]) {
    console.log(`✅ * 제거 매칭: "${cleanDbKeyword}"`);
    return { keyword: cleanDbKeyword, ...mdData[cleanDbKeyword] };
  }
  
  // 3. 부분 매칭 시도 (유사도가 높은 것 우선)
  const mdKeywords = Object.keys(mdData);
  console.log(`   MD 키워드 목록: ${mdKeywords.slice(0, 5).join(', ')}...`);
  
  for (const [mdKeyword, data] of Object.entries(mdData)) {
    // 정확히 같은 경우
    if (cleanDbKeyword === mdKeyword) {
      console.log(`✅ 클린 매칭: "${mdKeyword}"`);
      return { keyword: mdKeyword, ...data };
    }
    
    // 포함 관계 매칭 (80% 이상 유사한 경우만)
    const similarity = calculateSimilarity(cleanDbKeyword, mdKeyword);
    if (similarity > 0.8) {
      console.log(`✅ 유사도 매칭 (${(similarity*100).toFixed(1)}%): "${mdKeyword}"`);
      return { keyword: mdKeyword, ...data };
    }
  }
  
  console.log(`❌ 매칭 실패`);
  return null;
}

// 문자열 유사도 계산 (레벤슈타인 거리 기반)
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len2 + 1).fill().map(() => Array(len1 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i - 1] + 1
        );
      }
    }
  }
  
  const distance = matrix[len2][len1];
  return 1 - distance / Math.max(len1, len2);
}

async function getKeywords25to61() {
  try {
    // MD 파일 데이터 파싱
    const mdData = parseMdFile();
    
    // DB 데이터 조회 (실제 테이블 구조에 맞게)
    const result = await dbServiceV2.query(`
      SELECT 
        id, 
        keyword, 
        agent,
        current_mode,
        consecutive_blocks,
        total_blocks,
        success_count,
        fail_count,
        cart_click_enabled,
        last_executed_at,
        created_at
      FROM v2_test_keywords 
      WHERE id BETWEEN 25 AND 61
      ORDER BY id
    `);
    
    console.log(`📋 데이터베이스에서 ${result.rows.length}개 키워드 조회 완료`);
    
    // HTML 테이블 데이터 생성
    const tableData = [];
    let matchedCount = 0;
    
    result.rows.forEach(row => {
      // MD 파일과 매칭
      const matchedData = findBestMatch(row.keyword, mdData);
      const isMatched = !!matchedData;
      
      if (isMatched) matchedCount++;
      
      const tableRow = {
        id: row.id,
        keyword: row.keyword,
        agent: row.agent || 'unknown',
        current_mode: row.current_mode,
        consecutive_blocks: row.consecutive_blocks || 0,
        total_blocks: row.total_blocks || 0,
        success_count: row.success_count || 0,
        fail_count: row.fail_count || 0,
        cart_click_enabled: row.cart_click_enabled,
        last_executed_at: row.last_executed_at,
        
        // MD 매칭 데이터 (검색,노출,클릭,담기 순서)
        md_search: isMatched ? matchedData.search : null,
        md_exposure: isMatched ? matchedData.exposure : null,
        md_click: isMatched ? matchedData.click : null,
        md_cart: isMatched ? matchedData.cart : null,
        matched: isMatched,
        
        // 기본 최적화 설정 (실제 데이터에서는 별도 관리)
        main_allow: '["*"]',
        image_allow: '["*"]',
        img1a_allow: '["*"]',
        front_allow: '["*"]',
        static_allow: '["*"]',
        mercury_allow: '["*"]',
        ljc_allow: '["*"]'
      };
      
      tableData.push(tableRow);
    });
    
    console.log('\n📊 결과 요약:');
    console.log(`총 키워드: ${tableData.length}`);
    console.log(`MD 매칭: ${matchedCount}`);
    console.log(`매칭 안됨: ${tableData.length - matchedCount}`);
    console.log(`매칭률: ${(matchedCount / tableData.length * 100).toFixed(1)}%`);
    
    // JavaScript 배열 형태로 출력 (HTML에 복사하기 쉽게)
    console.log('\n📄 HTML용 JavaScript 데이터:');
    console.log('const keywordData = [');
    
    tableData.forEach((row, index) => {
      const isLast = index === tableData.length - 1;
      const cartStatus = row.cart_click_enabled === true ? 'o' : row.cart_click_enabled === false ? 'x' : '-';
      
      console.log(`  {
    id: ${row.id},
    keyword: "${row.keyword}",
    agent: "${row.agent}",
    cart: "${cartStatus}",
    succ: ${row.success_count},
    fail: ${row.fail_count},
    blocks: ${row.total_blocks},
    md_search: ${row.md_search},
    md_exposure: ${row.md_exposure},
    md_click: ${row.md_click},
    md_cart: ${row.md_cart},
    matched: ${row.matched},
    main_allow: '${row.main_allow}',
    image_allow: '${row.image_allow}',
    img1a_allow: '${row.img1a_allow}',
    front_allow: '${row.front_allow}',
    static_allow: '${row.static_allow}',
    mercury_allow: '${row.mercury_allow}',
    ljc_allow: '${row.ljc_allow}'
  }${isLast ? '' : ','}`);
    });
    
    console.log('];');
    
    // 매칭 상세 정보
    console.log('\n🔍 매칭 상세 정보:');
    tableData.forEach(row => {
      if (row.matched) {
        console.log(`✅ ID ${row.id}: "${row.keyword}" → 검색:${row.md_search}, 노출:${row.md_exposure}, 클릭:${row.md_click}, 담기:${row.md_cart}`);
      } else {
        console.log(`❌ ID ${row.id}: "${row.keyword}" → 매칭 안됨`);
      }
    });
    
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

getKeywords25to61();