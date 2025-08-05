const dbService = require('./lib/services/db-service');

(async () => {
  try {
    // 테스트 가능한 키워드 확인
    const result = await dbService.query(`
      SELECT id, keyword, clear_session, clear_cookies, clear_storage, clear_cache 
      FROM v2_test_keywords 
      WHERE agent = 'default' 
      LIMIT 5
    `);
    
    console.log('📋 테스트 가능한 키워드:');
    console.log('─'.repeat(80));
    result.rows.forEach(r => {
      console.log(`  ID ${r.id}: ${r.keyword}`);
      console.log(`    clear_session: ${r.clear_session}`);
      console.log(`    clear_cookies: ${r.clear_cookies}, clear_storage: ${r.clear_storage}, clear_cache: ${r.clear_cache}`);
    });
    
    // 테스트용으로 ID 7번 키워드의 옵션 수정
    console.log('\n🔧 ID 7번 키워드 옵션 수정 (캐시만 유지):');
    await dbService.query(`
      UPDATE v2_test_keywords 
      SET 
        clear_session = false,
        clear_cookies = true,
        clear_storage = true,
        clear_cache = false,
        clear_service_workers = true,
        clear_permissions = true
      WHERE id = 7
    `);
    
    const updated = await dbService.query(`
      SELECT id, keyword, clear_session, clear_cookies, clear_storage, clear_cache 
      FROM v2_test_keywords 
      WHERE id = 7
    `);
    
    const row = updated.rows[0];
    console.log(`  ID ${row.id}: ${row.keyword}`);
    console.log(`    clear_session: ${row.clear_session}`);
    console.log(`    clear_cookies: ${row.clear_cookies}, clear_storage: ${row.clear_storage}, clear_cache: ${row.clear_cache}`);
    console.log('  ✅ 설정 완료: 캐시는 유지하고 쿠키/스토리지는 삭제합니다.');
    
    await dbService.close();
  } catch(e) {
    console.error('Error:', e.message);
    await dbService.close();
  }
})();