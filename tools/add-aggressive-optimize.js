/**
 * aggressive_optimize 컬럼 추가 스크립트
 */

const dbService = require('../lib/services/db-service');

async function addAggressiveOptimize() {
  try {
    console.log('🔧 aggressive_optimize 컬럼 추가 중...\n');

    // aggressive_optimize 컬럼 추가
    const alterQuery = `
      ALTER TABLE v2_test_keywords 
      ADD COLUMN IF NOT EXISTS aggressive_optimize BOOLEAN DEFAULT false
    `;
    
    await dbService.query(alterQuery);
    console.log('✅ aggressive_optimize 컬럼이 추가되었습니다.\n');

    // ID 7번에 공격적 최적화 활성화
    const updateQuery = `
      UPDATE v2_test_keywords 
      SET aggressive_optimize = true 
      WHERE id = 7
    `;
    
    const updateResult = await dbService.query(updateQuery);
    console.log(`✅ ID 7번 키워드의 aggressive_optimize를 true로 설정했습니다. (${updateResult.rowCount}개 행 업데이트)\n`);

    // 확인
    const selectQuery = `
      SELECT id, keyword, suffix, optimize, aggressive_optimize, clear_cache, agent
      FROM v2_test_keywords
      WHERE id = 7
    `;
    
    const selectResult = await dbService.query(selectQuery);
    
    if (selectResult.rows.length > 0) {
      const row = selectResult.rows[0];
      console.log('📋 업데이트된 키워드 정보:');
      console.log(`   ID: ${row.id}`);
      console.log(`   키워드: ${row.keyword} ${row.suffix || ''}`);
      console.log(`   일반 최적화: ${row.optimize ? '✅' : '⬜'}`);
      console.log(`   공격적 최적화: ${row.aggressive_optimize ? '✅' : '⬜'}`);
      console.log(`   캐시 유지: ${!row.clear_cache ? '✅' : '⬜'}`);
      console.log(`   에이전트: ${row.agent}`);
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await dbService.close();
  }
}

// 실행
addAggressiveOptimize();