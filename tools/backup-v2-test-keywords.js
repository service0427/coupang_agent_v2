const dbServiceV2 = require('../lib/services/db-service-v2');
const fs = require('fs');
const path = require('path');

async function backupV2TestKeywords() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupDir = path.join(__dirname, '..', 'backups');
    
    // 백업 디렉터리 생성
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    console.log('=== v2_test_keywords 테이블 백업 시작 ===\n');
    
    // 1. 전체 데이터 조회
    const result = await dbServiceV2.query(`
      SELECT * FROM v2_test_keywords 
      ORDER BY id
    `);
    
    console.log(`📊 총 ${result.rows.length}개 레코드 백업 중...\n`);
    
    // 2. JSON 형태로 백업
    const jsonBackupFile = path.join(backupDir, `v2_test_keywords_backup_${timestamp}.json`);
    fs.writeFileSync(jsonBackupFile, JSON.stringify(result.rows, null, 2), 'utf8');
    
    // 3. SQL INSERT문 형태로도 백업
    const sqlBackupFile = path.join(backupDir, `v2_test_keywords_backup_${timestamp}.sql`);
    let sqlContent = `-- v2_test_keywords 백업 (${new Date().toISOString()})\n`;
    sqlContent += `-- 총 ${result.rows.length}개 레코드\n\n`;
    sqlContent += `-- 복구 시 사용:\n-- DELETE FROM v2_test_keywords; -- 주의: 기존 데이터 삭제\n-- 아래 INSERT문들 실행\n\n`;
    
    result.rows.forEach(row => {
      const values = [
        row.id,
        row.keyword ? `'${row.keyword.replace(/'/g, "''")}'` : 'NULL',
        row.product_code ? `'${row.product_code}'` : 'NULL',
        row.agent ? `'${row.agent}'` : 'NULL',
        row.cart_click_enabled || false,
        row.success_count || 0,
        row.fail_count || 0,
        row.total_blocks || 0,
        row.optimization_config ? `'${JSON.stringify(row.optimization_config).replace(/'/g, "''")}'::jsonb` : 'NULL',
        row.created_at ? `'${row.created_at.toISOString()}'` : 'NULL',
        row.updated_at ? `'${row.updated_at.toISOString()}'` : 'NULL'
      ];
      
      sqlContent += `INSERT INTO v2_test_keywords (id, keyword, product_code, agent, cart_click_enabled, success_count, fail_count, total_blocks, optimization_config, created_at, updated_at) VALUES (${values.join(', ')});\n`;
    });
    
    fs.writeFileSync(sqlBackupFile, sqlContent, 'utf8');
    
    // 4. 현재 테이블 구조도 백업
    const structureResult = await dbServiceV2.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'v2_test_keywords'
      ORDER BY ordinal_position
    `);
    
    const structureFile = path.join(backupDir, `v2_test_keywords_structure_${timestamp}.json`);
    fs.writeFileSync(structureFile, JSON.stringify(structureResult.rows, null, 2), 'utf8');
    
    // 5. 백업 완료 보고
    console.log('✅ 백업 완료!');
    console.log(`📁 백업 파일들:`);
    console.log(`   JSON: ${jsonBackupFile}`);
    console.log(`   SQL:  ${sqlBackupFile}`);
    console.log(`   구조: ${structureFile}`);
    
    // 6. 백업 검증
    const jsonSize = fs.statSync(jsonBackupFile).size;
    const sqlSize = fs.statSync(sqlBackupFile).size;
    
    console.log(`\n📊 백업 검증:`);
    console.log(`   레코드 수: ${result.rows.length}개`);
    console.log(`   JSON 크기: ${(jsonSize/1024).toFixed(1)}KB`);
    console.log(`   SQL 크기: ${(sqlSize/1024).toFixed(1)}KB`);
    
    // 7. 주요 데이터 요약
    console.log(`\n📈 백업된 데이터 요약:`);
    const keywordIds = result.rows.map(r => r.id).sort((a,b) => a-b);
    console.log(`   ID 범위: ${keywordIds[0]} ~ ${keywordIds[keywordIds.length-1]}`);
    
    const agentStats = {};
    result.rows.forEach(row => {
      agentStats[row.agent] = (agentStats[row.agent] || 0) + 1;
    });
    
    console.log(`   에이전트별:`);
    Object.entries(agentStats).forEach(([agent, count]) => {
      console.log(`     ${agent}: ${count}개`);
    });
    
    const totalSuccess = result.rows.reduce((sum, row) => sum + (row.success_count || 0), 0);
    const totalFail = result.rows.reduce((sum, row) => sum + (row.fail_count || 0), 0);
    
    console.log(`   전체 성공: ${totalSuccess}회`);
    console.log(`   전체 실패: ${totalFail}회`);
    console.log(`   성공률: ${((totalSuccess/(totalSuccess+totalFail))*100).toFixed(1)}%`);
    
    console.log(`\n🔄 이제 새로운 테스트 준비가 가능합니다.`);
    
  } catch (error) {
    console.error('❌ 백업 오류:', error);
  } finally {
    await dbServiceV2.close();
  }
}

backupV2TestKeywords();