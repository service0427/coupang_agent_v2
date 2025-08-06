/**
 * V2 테스트 키워드 추가 도구
 * - v1_agent_config 스타일의 도메인 설정 포함
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function addTestKeywords() {
  console.log('=====================================================');
  console.log('V2 테스트 키워드 추가');
  console.log('=====================================================\n');
  
  const testKeywords = [
    {
      keyword: '노트북',
      suffix: null,
      product_code: '6531091938',
      agent: 'default',
      proxy_server: null,
      cart_click_enabled: false,
      gpu_disabled: false,
      coupang_main_allow: null, // 모든 타입 허용
      notes: '기본 설정 테스트'
    },
    {
      keyword: '게이밍 노트북',
      suffix: 'RTX4060',
      product_code: '7885961078',
      agent: 'win11',
      proxy_server: 'proxy1:1234:user:pass',
      cart_click_enabled: true,
      gpu_disabled: true,
      coupang_main_allow: JSON.stringify(['document', 'xhr', 'fetch']),
      mercury_allow: JSON.stringify(['document']),
      notes: 'Document + API만 허용'
    },
    {
      keyword: '맥북',
      suffix: 'M2 프로',
      product_code: '7643319406',
      agent: 'mac',
      proxy_server: null,
      cart_click_enabled: true,
      gpu_disabled: false,
      coupang_main_allow: JSON.stringify(['document', 'xhr', 'fetch', 'script', 'stylesheet']),
      mercury_allow: JSON.stringify(['document', 'script']),
      assets_cdn_allow: JSON.stringify(['stylesheet']),
      front_cdn_allow: JSON.stringify(['script']),
      notes: '스크립트/스타일 포함'
    },
    {
      keyword: '에어팟',
      suffix: '프로 2세대',
      product_code: '7618515037',
      agent: 'mobile',
      proxy_server: 'proxy2:5678',
      cart_click_enabled: false,
      gpu_disabled: true,
      coupang_main_allow: JSON.stringify(['document']),
      coupang_main_block_patterns: JSON.stringify(['/gtm.js', '/log/', '/tracking']),
      notes: 'Document만 허용 + 추적 스크립트 차단'
    },
    {
      keyword: '아이패드',
      suffix: '프로 11인치',
      product_code: '7590837265',
      agent: 'tablet',
      proxy_server: null,
      cart_click_enabled: true,
      gpu_disabled: false,
      // 이미지 CDN 허용
      image_cdn_allow: JSON.stringify(['image']),
      thumbnail_cdn_allow: JSON.stringify(['image']),
      img1a_cdn_allow: JSON.stringify(['image']),
      notes: '이미지 CDN 허용 테스트'
    }
  ];
  
  try {
    console.log(`📝 ${testKeywords.length}개 키워드 추가 중...\n`);
    
    for (const keyword of testKeywords) {
      const query = `
        INSERT INTO v2_test_keywords (
          keyword, suffix, product_code, agent, proxy_server,
          cart_click_enabled, gpu_disabled,
          coupang_main_allow, mercury_allow, ljc_allow,
          assets_cdn_allow, front_cdn_allow, image_cdn_allow,
          static_cdn_allow, img1a_cdn_allow, thumbnail_cdn_allow,
          coupang_main_block_patterns, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING id
      `;
      
      const values = [
        keyword.keyword,
        keyword.suffix,
        keyword.product_code,
        keyword.agent,
        keyword.proxy_server,
        keyword.cart_click_enabled,
        keyword.gpu_disabled,
        keyword.coupang_main_allow || null,
        keyword.mercury_allow || null,
        keyword.ljc_allow || null,
        keyword.assets_cdn_allow || null,
        keyword.front_cdn_allow || null,
        keyword.image_cdn_allow || null,
        keyword.static_cdn_allow || null,
        keyword.img1a_cdn_allow || null,
        keyword.thumbnail_cdn_allow || null,
        keyword.coupang_main_block_patterns || null,
        keyword.notes
      ];
      
      const result = await dbServiceV2.query(query, values);
      const insertedId = result.rows[0].id;
      
      console.log(`✅ ID ${insertedId}: ${keyword.keyword} ${keyword.suffix || ''} (${keyword.product_code})`);
      console.log(`   - Agent: ${keyword.agent}`);
      console.log(`   - 최적화: ${keyword.coupang_main_allow ? '활성화' : '비활성화'}`);
      if (keyword.notes) {
        console.log(`   - 메모: ${keyword.notes}`);
      }
      console.log();
    }
    
    // 추가된 키워드 확인
    console.log('📊 추가된 키워드 확인...\n');
    const checkResult = await dbServiceV2.query(`
      SELECT 
        id,
        keyword,
        suffix,
        product_code,
        agent,
        CASE 
          WHEN coupang_main_allow IS NOT NULL THEN '설정됨'
          ELSE '기본값'
        END as optimize_status,
        current_executions,
        max_executions
      FROM v2_test_keywords
      ORDER BY id DESC
      LIMIT ${testKeywords.length}
    `);
    
    console.log('ID  | 키워드         | 상품코드    | Agent   | 최적화  | 실행');
    console.log('----|----------------|-------------|---------|---------|------');
    
    checkResult.rows.forEach(row => {
      const keywordText = `${row.keyword} ${row.suffix || ''}`.padEnd(14);
      console.log(
        `${row.id.toString().padEnd(3)} | ${keywordText} | ${row.product_code} | ` +
        `${row.agent.padEnd(7)} | ${row.optimize_status.padEnd(7)} | ${row.current_executions}/${row.max_executions}`
      );
    });
    
    console.log('\n✅ V2 테스트 키워드 추가 완료!');
    
  } catch (error) {
    console.error('\n❌ 키워드 추가 실패:', error);
    console.error(error.stack);
  } finally {
    await dbServiceV2.close();
  }
}

// 스크립트 실행
if (require.main === module) {
  addTestKeywords().catch(error => {
    console.error('치명적 오류:', error);
    process.exit(1);
  });
}