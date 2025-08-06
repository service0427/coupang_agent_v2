/**
 * V2 로깅 시스템 테스트 스크립트
 * 명령어: node test-v2.js
 */

const { runV2Example } = require('./examples/v2-usage-example');

console.log('🔬 V2 로깅 시스템 테스트 시작');
console.log('═'.repeat(50));

runV2Example()
  .then(() => {
    console.log('🎉 테스트 완료!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌테스트 실패:', error.message);
    process.exit(1);
  });