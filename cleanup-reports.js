const fs = require('fs').promises;
const path = require('path');

async function cleanupReports(silent = false) {
  const reportsDir = path.join(__dirname, 'reports');
  
  try {
    // reports 디렉토리 확인
    await fs.access(reportsDir);
    
    // 모든 파일 수집 (날짜/시간 하위 디렉토리 포함)
    const allFiles = [];
    
    async function collectFiles(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // 하위 디렉토리 재귀 탐색
          await collectFiles(fullPath);
        } else if (entry.isFile() && entry.name.includes('.')) {
          // 파일인 경우 통계 정보와 함께 수집
          const stats = await fs.stat(fullPath);
          allFiles.push({
            name: entry.name,
            path: fullPath,
            relativePath: path.relative(reportsDir, fullPath),
            birthtime: stats.birthtime,
            mtime: stats.mtime,
            size: stats.size
          });
        }
      }
    }
    
    // 파일 수집 시작
    await collectFiles(reportsDir);
    
    // 생성 시간(birthtime)으로 정렬 (최신 순)
    allFiles.sort((a, b) => b.birthtime - a.birthtime);
    
    if (!silent) {
      console.log(`📁 총 ${allFiles.length}개 파일 발견`);
    }
    
    // 유지할 파일과 삭제할 파일 분리
    const keepFiles = allFiles.slice(0, 20);
    const deleteFiles = allFiles.slice(20);
    
    if (deleteFiles.length === 0) {
      if (!silent) {
        console.log('✅ 파일이 20개 이하이므로 삭제할 파일이 없습니다.');
      }
      return;
    }
    
    if (!silent) {
      console.log(`\n📊 파일 정리 계획:`);
      console.log(`   유지: ${keepFiles.length}개 (최신 20개)`);
      console.log(`   삭제: ${deleteFiles.length}개`);
      
      // 삭제할 파일 목록 표시
      console.log('\n🗑️ 삭제될 파일:');
      deleteFiles.forEach(file => {
        const age = Math.floor((Date.now() - file.birthtime) / (1000 * 60 * 60 * 24));
        console.log(`   - ${file.relativePath} (${age}일 전, ${(file.size / 1024).toFixed(2)} KB)`);
      });
      
      console.log('\n🧹 파일 삭제 중...');
    }
    
    // 파일 삭제 실행
    const deletedDirs = new Set();
    
    for (const file of deleteFiles) {
      await fs.unlink(file.path);
      if (!silent) {
        console.log(`   ✅ ${file.relativePath} 삭제됨`);
      }
      
      // 빈 디렉토리 추적
      const dirPath = path.dirname(file.path);
      if (dirPath !== reportsDir) {
        deletedDirs.add(dirPath);
      }
    }
    
    // 빈 디렉토리 정리
    for (const dir of deletedDirs) {
      try {
        const entries = await fs.readdir(dir);
        if (entries.length === 0) {
          await fs.rmdir(dir);
          
          // 상위 디렉토리도 비었는지 확인
          const parentDir = path.dirname(dir);
          if (parentDir !== reportsDir) {
            try {
              const parentEntries = await fs.readdir(parentDir);
              if (parentEntries.length === 0) {
                await fs.rmdir(parentDir);
              }
            } catch (e) {
              // 상위 디렉토리 삭제 실패는 무시
            }
          }
        }
      } catch (e) {
        // 디렉토리 삭제 실패는 무시
      }
    }
    
    // 삭제 완료 통계
    const deletedSize = deleteFiles.reduce((sum, f) => sum + f.size, 0);
    
    if (!silent) {
      console.log(`\n✨ 정리 완료!`);
      console.log(`   삭제된 파일: ${deleteFiles.length}개`);
      console.log(`   확보된 공간: ${(deletedSize / 1024 / 1024).toFixed(2)} MB`);
      
      // 남은 파일 요약
      console.log('\n📋 남은 파일 (최신 20개):');
      keepFiles.forEach((file, index) => {
        const age = Math.floor((Date.now() - file.birthtime) / (1000 * 60 * 60));
        const ageStr = age < 24 ? `${age}시간 전` : `${Math.floor(age / 24)}일 전`;
        console.log(`   ${index + 1}. ${file.relativePath} (${ageStr})`);
      });
    } else {
      // silent 모드에서는 간단한 메시지만
      if (deleteFiles.length > 0) {
        console.log(`🧹 리포트 정리: ${deleteFiles.length}개 파일 삭제, ${(deletedSize / 1024 / 1024).toFixed(2)} MB 확보`);
      }
    }
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (!silent) {
        console.log('❌ reports 디렉토리가 존재하지 않습니다.');
      }
    } else {
      console.error('❌ 오류 발생:', error.message);
    }
  }
}

// 직접 실행될 때만 실행 (import되면 실행하지 않음)
if (require.main === module) {
  cleanupReports();
}

module.exports = cleanupReports;