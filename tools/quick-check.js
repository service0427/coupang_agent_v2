#!/usr/bin/env node
/**
 * 빠른 상태 확인 도구
 * 가장 자주 사용하는 확인 작업들을 한 번에 실행
 * 사용법: node tools/quick-check.js
 */

const DatabaseManager = require('./db-manager');

async function quickCheck() {
  console.log('⚡ 빠른 시스템 상태 확인 시작\n');
  
  const manager = new DatabaseManager();
  
  try {
    // 1. 기본 데이터 상태 확인
    console.log('1️⃣ 기본 데이터 상태:');
    console.log('==================');
    await manager.checkData();
    
    console.log('\n2️⃣ 최근 에러 분석 (3일):');
    console.log('========================');
    await manager.analyzeErrors(3);
    
    console.log('\n3️⃣ 정체된 실행 확인:');
    console.log('===================');
    await manager.cleanupStuck();
    
    console.log('\n✅ 빠른 확인 완료!');
    console.log('상세 분석이 필요하면: node tools/db-manager.js [category] [action]');
    
  } catch (error) {
    console.error('❌ 빠른 확인 중 오류:', error.message);
  } finally {
    await manager.pool.end();
  }
}

// 실행
if (require.main === module) {
  quickCheck().catch(console.error);
}

module.exports = quickCheck;