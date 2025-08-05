const dbService = require('./lib/services/db-service');

(async () => {
  try {
    await dbService.query(`UPDATE v2_test_keywords SET date = CURRENT_DATE WHERE id = 7`);
    console.log('✅ ID 7번 날짜 업데이트 완료');
    
    const result = await dbService.query(`
      SELECT id, keyword, date, clear_cookies, clear_storage, clear_cache 
      FROM v2_test_keywords 
      WHERE id = 7
    `);
    
    const row = result.rows[0];
    console.log(`📅 날짜: ${row.date.toISOString().split('T')[0]}`);
    console.log(`🔧 설정: cookies=${row.clear_cookies}, storage=${row.clear_storage}, cache=${row.clear_cache}`);
    
    await dbService.close();
  } catch(e) {
    console.error('Error:', e.message);
    await dbService.close();
  }
})();