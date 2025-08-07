/**
 * current_mode를 ENUM으로 변경하고 v2_search_mode_status 테이블 정리
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function migrateToKeywordModeEnum() {
  try {
    console.log('🔧 키워드 모드를 ENUM 타입으로 마이그레이션');
    console.log('─'.repeat(50));
    
    // 1. search_mode ENUM 타입 생성 (이미 존재하면 무시)
    console.log('1️⃣ search_mode ENUM 타입 생성...');
    try {
      await dbServiceV2.query(`
        CREATE TYPE search_mode AS ENUM ('goto', 'search')
      `);
      console.log('✅ search_mode ENUM 타입 생성 완료');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ search_mode ENUM 타입 이미 존재');
      } else {
        console.log('⚠️ ENUM 타입 생성 실패:', error.message);
      }
    }
    
    // 2. current_mode 컬럼을 VARCHAR에서 ENUM으로 변경
    console.log('\n2️⃣ current_mode 컬럼을 ENUM으로 변경...');
    try {
      await dbServiceV2.query(`
        ALTER TABLE v2_test_keywords 
        ALTER COLUMN current_mode TYPE search_mode USING current_mode::search_mode
      `);
      console.log('✅ current_mode 컬럼 ENUM 변경 완료');
    } catch (error) {
      console.log('⚠️ ENUM 변경 실패:', error.message);
      
      // 기존 데이터 확인
      const dataCheck = await dbServiceV2.query(`
        SELECT DISTINCT current_mode FROM v2_test_keywords WHERE current_mode IS NOT NULL
      `);
      console.log('현재 current_mode 값들:', dataCheck.rows.map(r => r.current_mode));
    }
    
    // 3. v2_search_mode_status 테이블 백업 후 제거
    console.log('\n3️⃣ v2_search_mode_status 테이블 정리...');
    
    // 백업 테이블 생성
    try {
      await dbServiceV2.query(`
        CREATE TABLE IF NOT EXISTS v2_search_mode_status_backup AS 
        SELECT *, CURRENT_TIMESTAMP as backup_date 
        FROM v2_search_mode_status
      `);
      console.log('✅ v2_search_mode_status 백업 완료');
    } catch (error) {
      console.log('⚠️ 백업 실패:', error.message);
    }
    
    // 기존 테이블 제거
    try {
      await dbServiceV2.query(`DROP TABLE IF EXISTS v2_search_mode_status`);
      console.log('✅ v2_search_mode_status 테이블 제거 완료');
    } catch (error) {
      console.log('⚠️ 테이블 제거 실패:', error.message);
    }
    
    // 4. v2_search_mode_history 테이블에 keyword_id 컬럼 추가
    console.log('\n4️⃣ v2_search_mode_history 테이블에 keyword_id 추가...');
    try {
      await dbServiceV2.query(`
        ALTER TABLE v2_search_mode_history 
        ADD COLUMN IF NOT EXISTS keyword_id INTEGER REFERENCES v2_test_keywords(id)
      `);
      console.log('✅ keyword_id 컬럼 추가 완료');
    } catch (error) {
      console.log('⚠️ 컬럼 추가 실패:', error.message);
    }
    
    // 5. 현재 키워드별 모드 상태 확인
    console.log('\n5️⃣ 최종 키워드별 모드 상태 확인...');
    const result = await dbServiceV2.query(`
      SELECT id, keyword, current_mode, consecutive_blocks, mode_execution_count
      FROM v2_test_keywords 
      WHERE agent = 'test1' 
      ORDER BY id
    `);
    
    console.log('📋 키워드별 모드 (ENUM 적용):');
    result.rows.forEach(row => {
      const mode = (row.current_mode || 'goto').toUpperCase();
      console.log(`  ID:${row.id} | ${row.keyword.padEnd(20)} | ${mode}`);
    });
    
    console.log('\n✅ 키워드별 ENUM 모드 마이그레이션 완료!');
    console.log('\n🛠️ 이제 다음과 같이 사용할 수 있습니다:');
    console.log("UPDATE v2_test_keywords SET current_mode = 'search' WHERE id = 20;");
    console.log("UPDATE v2_test_keywords SET current_mode = 'goto' WHERE agent = 'test1';");
    
  } catch (error) {
    console.error('❌ 마이그레이션 중 오류:', error.message);
  } finally {
    await dbServiceV2.close();
  }
}

migrateToKeywordModeEnum();