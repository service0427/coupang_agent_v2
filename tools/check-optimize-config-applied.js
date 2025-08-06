/**
 * optimize_config_applied 컬럼 데이터 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function checkOptimizeConfigApplied() {
  console.log('🔍 optimize_config_applied 컬럼 데이터 확인\n');
  
  try {
    // 최근 실행 로그 5개 조회
    const result = await dbServiceV2.query(`
      SELECT id, started_at, keyword, optimize_config_applied 
      FROM v2_execution_logs 
      WHERE id >= 100 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log(`최근 ${result.rows.length}개 실행 로그:`);
    console.log('');
    
    result.rows.forEach(row => {
      console.log(`📋 실행 ID ${row.id}: ${row.keyword}`);
      console.log(`   실행 시간: ${row.started_at}`);
      
      if (row.optimize_config_applied) {
        try {
          const config = JSON.parse(row.optimize_config_applied);
          console.log('   ✅ optimize_config_applied 저장됨:');
          console.log(`      coupang_main_allow: ${JSON.stringify(config.coupang_main_allow)}`);
          console.log(`      front_cdn_allow: ${JSON.stringify(config.front_cdn_allow)}`);
          console.log(`      mercury_allow: ${JSON.stringify(config.mercury_allow)}`);
          console.log(`      총 ${Object.keys(config).length}개 설정 항목`);
        } catch (e) {
          console.log('   ⚠️  JSON 파싱 오류:', row.optimize_config_applied);
        }
      } else {
        console.log('   ❌ optimize_config_applied: NULL');
      }
      console.log('');
    });
    
    // 통계
    const totalWithConfig = result.rows.filter(row => row.optimize_config_applied).length;
    console.log(`📊 통계: ${totalWithConfig}/${result.rows.length}개 로그에 설정 데이터 저장됨`);
    
  } catch (error) {
    console.error('❌ 조회 실패:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

checkOptimizeConfigApplied();