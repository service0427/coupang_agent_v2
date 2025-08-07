#!/usr/bin/env node
/**
 * optimization_config 컬럼 완전 제거 스크립트
 * 개별 boolean 컬럼으로 마이그레이션 완료 후 사용
 */

const { Pool } = require('pg');

// 환경 설정 로드
const config = require('../environment');

async function removeOptimizationConfigColumn() {
  const pool = new Pool(config.database);
  
  try {
    console.log('🗑️ optimization_config 컬럼 제거 시작...');
    
    // 1. 현재 상태 확인
    console.log('\n📋 1단계: 현재 테이블 구조 확인');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name LIKE '%block_%' OR column_name = 'optimization_config'
      ORDER BY column_name
    `);
    
    console.log('현재 최적화 관련 컬럼:');
    columnsResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (기본값: ${row.column_default || 'NULL'})`);
    });
    
    // 2. optimization_config 컬럼이 존재하는지 확인
    const hasOptimizationConfig = columnsResult.rows.some(row => row.column_name === 'optimization_config');
    
    if (!hasOptimizationConfig) {
      console.log('\n✅ optimization_config 컬럼이 이미 존재하지 않습니다.');
      return;
    }
    
    // 3. 개별 boolean 컬럼들이 존재하는지 확인
    const requiredColumns = ['block_mercury', 'block_image_cdn', 'block_img1a_cdn', 'block_thumbnail_cdn'];
    const existingBooleanColumns = columnsResult.rows
      .filter(row => requiredColumns.includes(row.column_name))
      .map(row => row.column_name);
    
    console.log(`\n📊 개별 boolean 컬럼: ${existingBooleanColumns.length}/${requiredColumns.length}개 존재`);
    
    if (existingBooleanColumns.length < requiredColumns.length) {
      console.log('❌ 개별 boolean 컬럼이 모두 존재하지 않습니다.');
      console.log('   먼저 migrate-optimization-to-columns.js를 실행하세요.');
      return;
    }
    
    // 4. 데이터 검증 (JSON과 boolean 컬럼 일치도 확인)
    console.log('\n📋 2단계: 데이터 검증');
    const dataCheck = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(optimization_config) as has_json,
        COUNT(CASE WHEN block_mercury IS NOT NULL THEN 1 END) as has_boolean
      FROM v2_test_keywords
    `);
    
    const { total, has_json, has_boolean } = dataCheck.rows[0];
    console.log(`총 키워드 수: ${total}`);
    console.log(`JSON 설정 보유: ${has_json}개`);  
    console.log(`Boolean 설정 보유: ${has_boolean}개`);
    
    // 5. optimization_config 컬럼 제거
    console.log('\n📋 3단계: optimization_config 컬럼 제거');
    await pool.query('ALTER TABLE v2_test_keywords DROP COLUMN optimization_config');
    
    console.log('✅ optimization_config 컬럼 제거 완료');
    
    // 6. 제거 후 테이블 구조 확인
    console.log('\n📋 4단계: 제거 후 구조 확인');
    const finalResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords' 
        AND table_schema = 'public'
        AND column_name LIKE '%block_%'
      ORDER BY column_name
    `);
    
    console.log('최종 최적화 컬럼:');
    finalResult.rows.forEach(row => {
      console.log(`   ${row.column_name}: ${row.data_type} (기본값: ${row.column_default || 'false'})`);
    });
    
    console.log('\n✅ optimization_config 컬럼 제거 완료!');
    console.log('📝 이제 코드에서도 JSON 참조 코드를 제거해야 합니다.');
    
  } catch (error) {
    console.error('❌ 컬럼 제거 실패:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// 실행
if (require.main === module) {
  removeOptimizationConfigColumn().catch(console.error);
}

module.exports = removeOptimizationConfigColumn;