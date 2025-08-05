/**
 * optimize 컬럼 추가 스크립트
 */

const dbService = require('../lib/services/db-service');

async function addOptimizeColumn() {
  try {
    console.log('🔧 optimize 컬럼 추가 중...\n');

    // optimize 컬럼 추가
    const alterQuery = `
      ALTER TABLE v2_test_keywords 
      ADD COLUMN IF NOT EXISTS optimize BOOLEAN DEFAULT false
    `;
    
    await dbService.query(alterQuery);
    console.log('✅ optimize 컬럼이 추가되었습니다.\n');

    // 컬럼 추가 확인
    const checkQuery = `
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
      AND column_name = 'optimize'
    `;
    
    const result = await dbService.query(checkQuery);
    
    if (result.rows.length > 0) {
      console.log('📋 컬럼 정보:');
      console.log(`   이름: ${result.rows[0].column_name}`);
      console.log(`   타입: ${result.rows[0].data_type}`);
      console.log(`   기본값: ${result.rows[0].column_default}\n`);
    }

    // ID 7번 키워드에 대해 최적화 활성화
    const updateQuery = `
      UPDATE v2_test_keywords 
      SET optimize = true 
      WHERE id = 7
    `;
    
    const updateResult = await dbService.query(updateQuery);
    console.log(`✅ ID 7번 키워드의 optimize를 true로 설정했습니다. (${updateResult.rowCount}개 행 업데이트)\n`);

    // 확인
    const selectQuery = `
      SELECT id, keyword, suffix, product_code, optimize, agent
      FROM v2_test_keywords
      WHERE id = 7
    `;
    
    const selectResult = await dbService.query(selectQuery);
    
    if (selectResult.rows.length > 0) {
      const row = selectResult.rows[0];
      console.log('📋 업데이트된 키워드 정보:');
      console.log(`   ID: ${row.id}`);
      console.log(`   키워드: ${row.keyword} ${row.suffix || ''}`);
      console.log(`   상품코드: ${row.product_code}`);
      console.log(`   최적화: ${row.optimize ? '활성' : '비활성'}`);
      console.log(`   에이전트: ${row.agent}`);
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await dbService.close();
  }
}

// 실행
addOptimizeColumn();