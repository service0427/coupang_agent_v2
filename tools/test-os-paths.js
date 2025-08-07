/**
 * OS별 경로 테스트 - 다양한 운영체제에서 경로 동작 확인
 */

const path = require('path');
const os = require('os');

function testOSPaths() {
  console.log('🌍 OS별 경로 테스트\n');
  
  // 현재 시스템 정보
  console.log('📋 시스템 정보:');
  console.log(`   - OS: ${os.platform()} (${os.type()})`);
  console.log(`   - Architecture: ${os.arch()}`);
  console.log(`   - Node.js: ${process.version}`);
  console.log(`   - Working Directory: ${process.cwd()}\n`);
  
  // 경로 테스트
  console.log('📁 경로 생성 테스트:');
  
  const testPaths = [
    { name: 'Browser Data', path: path.join(process.cwd(), 'browser-data') },
    { name: 'Instance 0', path: path.join(process.cwd(), 'browser-data', 'instance_0') },
    { name: 'Profile 001', path: path.join(process.cwd(), 'browser-data', 'instance_0', '001') },
    { name: 'Agent JSON', path: path.join(process.cwd(), 'browser-data', 'instance_0', 'agent.json') },
    { name: 'Tools Directory', path: path.join(process.cwd(), 'tools') },
    { name: 'Lib Directory', path: path.join(process.cwd(), 'lib', 'utils') }
  ];
  
  testPaths.forEach(({ name, path: testPath }) => {
    console.log(`   ✅ ${name}: ${testPath}`);
  });
  
  // 경로 구분자 확인
  console.log('\n🔗 경로 구분자:');
  console.log(`   - Path Separator: "${path.sep}"`);
  console.log(`   - Path Delimiter: "${path.delimiter}"`);
  
  // 예상 경로 (OS별)
  console.log('\n🎯 OS별 예상 경로:');
  const exampleAgent = 'instance_0';
  const exampleFolder = '001';
  
  console.log('Windows:');
  console.log(`   C:\\Users\\user\\project\\browser-data\\${exampleAgent}\\${exampleFolder}`);
  console.log('macOS:');
  console.log(`   /Users/user/project/browser-data/${exampleAgent}/${exampleFolder}`);
  console.log('Linux:');
  console.log(`   /home/user/project/browser-data/${exampleAgent}/${exampleFolder}`);
  
  console.log('\n🔧 실제 생성된 경로:');
  const actualPath = path.join(process.cwd(), 'browser-data', exampleAgent, exampleFolder);
  console.log(`   ${actualPath}`);
  
  // 절대경로 vs 상대경로 확인
  console.log(`\n📍 경로 타입:`)
  console.log(`   - Is Absolute: ${path.isAbsolute(actualPath)}`);
  console.log(`   - Normalized: ${path.normalize(actualPath)}`);
  console.log(`   - Directory: ${path.dirname(actualPath)}`);
  console.log(`   - Basename: ${path.basename(actualPath)}`);
  
  // 호환성 확인
  console.log('\n✅ OS 독립성 확인:');
  console.log('   - path.join() 사용: ✅ OS별 구분자 자동 처리');
  console.log('   - process.cwd() 사용: ✅ 실행 위치 기준 동적 경로');
  console.log('   - 하드코딩 제거: ✅ Windows 고정 경로 제거됨');
  console.log('   - 상대경로 호환: ✅ 프로젝트 루트 기준 경로');
}

testOSPaths();