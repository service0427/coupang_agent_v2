/**
 * V2 테이블 미사용 컬럼 분석 도구
 * 테이블 정의 vs 실제 사용 컬럼 비교
 */

const fs = require('fs').promises;
const path = require('path');

class V2ColumnAnalyzer {
  constructor() {
    this.tableDefinitions = {};
    this.columnUsage = {};
    this.codebaseFiles = [];
  }

  /**
   * SQL 파일에서 테이블 정의 추출
   */
  async parseTableDefinitions() {
    console.log('🔍 테이블 정의 분석 중...');
    
    const sqlFile = path.join(__dirname, '../sql/v2_create_tables.sql');
    const sqlContent = await fs.readFile(sqlFile, 'utf-8');
    
    // 각 테이블별로 컬럼 추출
    const tables = ['v2_test_keywords', 'v2_execution_logs', 'v2_action_logs', 'v2_error_logs', 'v2_network_logs', 'v2_product_tracking'];
    
    for (const tableName of tables) {
      this.tableDefinitions[tableName] = this.extractColumnsFromTable(sqlContent, tableName);
    }
    
    console.log('✅ 테이블 정의 분석 완료\n');
  }

  /**
   * 특정 테이블의 컬럼 추출
   */
  extractColumnsFromTable(sqlContent, tableName) {
    const tableRegex = new RegExp(`CREATE TABLE ${tableName}\\s*\\([^;]+\\);`, 'is');
    const match = sqlContent.match(tableRegex);
    
    if (!match) {
      console.log(`⚠️ 테이블 ${tableName} 정의를 찾을 수 없음`);
      return [];
    }
    
    const tableContent = match[0];
    const columnMatches = tableContent.match(/^\s*(\w+)\s+[^,\n\r]+/gm);
    
    const columns = [];
    if (columnMatches) {
      for (const columnMatch of columnMatches) {
        const columnName = columnMatch.trim().split(/\s+/)[0];
        // 예약어나 제약조건 제외
        if (columnName && !['CREATE', 'TABLE', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT'].includes(columnName.toUpperCase())) {
          columns.push(columnName);
        }
      }
    }
    
    return columns;
  }

  /**
   * 코드베이스에서 컬럼 사용 분석
   */
  async analyzeColumnUsage() {
    console.log('🔍 코드베이스 컬럼 사용 분석 중...');
    
    // 분석할 디렉토리들
    const directories = [
      '../lib/services',
      '../lib/handlers', 
      '../lib/network',
      '../tools'
    ];
    
    // 모든 JS 파일 수집
    for (const dir of directories) {
      await this.collectFiles(path.join(__dirname, dir), '.js');
    }
    
    console.log(`📁 분석 대상 파일: ${this.codebaseFiles.length}개`);
    
    // 각 파일에서 SQL 쿼리 추출 및 컬럼 사용 분석
    for (const filePath of this.codebaseFiles) {
      await this.analyzeFileForColumnUsage(filePath);
    }
    
    console.log('✅ 컬럼 사용 분석 완료\n');
  }

  /**
   * 디렉토리에서 파일 수집
   */
  async collectFiles(dirPath, extension) {
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        
        if (stat.isDirectory()) {
          await this.collectFiles(itemPath, extension);
        } else if (item.endsWith(extension)) {
          this.codebaseFiles.push(itemPath);
        }
      }
    } catch (error) {
      // 디렉토리가 없어도 무시
    }
  }

  /**
   * 파일에서 컬럼 사용 분석
   */
  async analyzeFileForColumnUsage(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // SQL 쿼리 패턴들
      const sqlPatterns = [
        // INSERT 패턴
        /INSERT\s+INTO\s+(v2_\w+)\s*\([^)]+\)/gi,
        // UPDATE SET 패턴
        /UPDATE\s+(v2_\w+)\s+SET\s+([^W]+WHERE|[^;]+)/gi,
        // SELECT 패턴
        /SELECT\s+([^F]+)FROM\s+(v2_\w+)/gi,
        // 컬럼 직접 참조 패턴
        /\.(\w+)\s*[,\s]/g,
        // 백틱 쿼리 패턴
        /`[^`]*v2_\w+[^`]*`/gi
      ];
      
      for (const pattern of sqlPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          this.extractColumnsFromQuery(match[0], path.basename(filePath));
        }
      }
    } catch (error) {
      console.log(`⚠️ 파일 읽기 실패: ${filePath}`);
    }
  }

  /**
   * SQL 쿼리에서 사용된 컬럼 추출
   */
  extractColumnsFromQuery(query, fileName) {
    // 각 테이블별로 컬럼 사용 체크
    for (const tableName of Object.keys(this.tableDefinitions)) {
      if (query.toLowerCase().includes(tableName)) {
        if (!this.columnUsage[tableName]) {
          this.columnUsage[tableName] = new Set();
        }
        
        // 정의된 컬럼들 중에서 쿼리에 포함된 것들 찾기
        for (const column of this.tableDefinitions[tableName]) {
          if (query.toLowerCase().includes(column.toLowerCase())) {
            this.columnUsage[tableName].add(column);
          }
        }
      }
    }
  }

  /**
   * 분석 결과 생성
   */
  generateReport() {
    console.log('📊 V2 테이블 미사용 컬럼 분석 결과');
    console.log('='.repeat(80));
    
    for (const tableName of Object.keys(this.tableDefinitions)) {
      console.log(`\n🗂️  테이블: ${tableName.toUpperCase()}`);
      console.log('-'.repeat(50));
      
      const definedColumns = this.tableDefinitions[tableName];
      const usedColumns = this.columnUsage[tableName] ? Array.from(this.columnUsage[tableName]) : [];
      const unusedColumns = definedColumns.filter(col => !usedColumns.includes(col));
      
      console.log(`📋 정의된 컬럼: ${definedColumns.length}개`);
      console.log(`✅ 사용 중인 컬럼: ${usedColumns.length}개`);
      console.log(`❌ 미사용 컬럼: ${unusedColumns.length}개`);
      
      if (unusedColumns.length > 0) {
        console.log(`\n🚨 미사용 컬럼 목록:`);
        unusedColumns.forEach(col => {
          console.log(`   • ${col}`);
        });
      }
      
      if (usedColumns.length > 0) {
        console.log(`\n✅ 사용 중인 컬럼 목록:`);
        usedColumns.sort().forEach(col => {
          console.log(`   • ${col}`);
        });
      }
      
      // 사용률 계산
      const usageRate = definedColumns.length > 0 ? ((usedColumns.length / definedColumns.length) * 100).toFixed(1) : 0;
      console.log(`\n📊 컬럼 사용률: ${usageRate}%`);
    }
    
    // 전체 요약
    console.log('\n' + '='.repeat(80));
    console.log('📈 전체 요약');
    console.log('='.repeat(80));
    
    let totalDefined = 0;
    let totalUsed = 0;
    let totalUnused = 0;
    
    for (const tableName of Object.keys(this.tableDefinitions)) {
      const defined = this.tableDefinitions[tableName].length;
      const used = this.columnUsage[tableName] ? this.columnUsage[tableName].size : 0;
      const unused = defined - used;
      
      totalDefined += defined;
      totalUsed += used;
      totalUnused += unused;
      
      console.log(`${tableName.padEnd(20)} | 정의: ${defined.toString().padStart(3)} | 사용: ${used.toString().padStart(3)} | 미사용: ${unused.toString().padStart(3)} | 사용률: ${((used/defined)*100).toFixed(1)}%`);
    }
    
    console.log('-'.repeat(80));
    console.log(`${'전체'.padEnd(20)} | 정의: ${totalDefined.toString().padStart(3)} | 사용: ${totalUsed.toString().padStart(3)} | 미사용: ${totalUnused.toString().padStart(3)} | 사용률: ${((totalUsed/totalDefined)*100).toFixed(1)}%`);
    
    // 권장사항
    console.log('\n💡 권장사항:');
    console.log('1. 미사용 컬럼이 많은 테이블의 스키마 검토 필요');
    console.log('2. 향후 사용 예정이 없는 컬럼은 제거 고려');  
    console.log('3. 쿼리 성능 향상을 위해 불필요한 컬럼 최소화');
    console.log('4. 인덱스가 걸린 미사용 컬럼은 우선 제거 고려');
  }

  /**
   * 메인 실행 함수
   */
  async analyze() {
    console.log('🚀 V2 테이블 미사용 컬럼 분석 시작\n');
    
    try {
      await this.parseTableDefinitions();
      await this.analyzeColumnUsage();
      this.generateReport();
      
      console.log('\n✅ 분석 완료!');
      
    } catch (error) {
      console.error('❌ 분석 중 오류 발생:', error.message);
    }
  }
}

// 실행
const analyzer = new V2ColumnAnalyzer();
analyzer.analyze();