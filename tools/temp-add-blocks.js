const dbServiceV2 = require('../lib/services/db-service-v2');

async function addMoreBlocks() {
  const agents = ['u24-1', 'u22-1', 'vm-win11-1', 'local1'];
  
  for (const agent of agents) {
    await dbServiceV2.query(`
      UPDATE v2_test_keywords 
      SET consecutive_blocks = 7,
          mode_switch_reason = 'test_simulation'
      WHERE agent = $1
    `, [agent]);
    
    console.log(`✅ ${agent} 차단 시뮬레이션 추가`);
  }
  
  console.log('📊 추가 시뮬레이션 완료');
  process.exit(0);
}

addMoreBlocks().catch(error => {
  console.error('❌ 실패:', error.message);
  process.exit(1);
});