const dbService = require('../lib/services/db-service');

(async () => {
  try {
    const result = await dbService.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'v1_executions' 
      ORDER BY ordinal_position
    `);
    console.log('v1_executions 테이블 컬럼:');
    result.rows.forEach(row => console.log('- ' + row.column_name));
  } catch(err) {
    console.error(err);
  } finally {
    await dbService.close();
  }
})();