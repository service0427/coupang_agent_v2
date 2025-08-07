const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkSchema() {
  try {
    const result = await dbServiceV2.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'v2_error_logs' 
        AND column_name = 'action_id'
    `);
    
    console.log('v2_error_logs.action_id 컬럼 타입:', result.rows[0]?.data_type);
    
    // v2_action_logs의 id 컬럼 확인
    const actionResult = await dbServiceV2.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'v2_action_logs' 
        AND column_name = 'id'
    `);
    
    console.log('v2_action_logs.id 컬럼 타입:', actionResult.rows[0]?.data_type);
    
  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkSchema();