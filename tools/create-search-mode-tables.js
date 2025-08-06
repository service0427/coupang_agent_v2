const dbService = require('../lib/services/db-service');

async function createSearchModeTables() {
  console.log('🏗️  SearchMode 테이블 생성 시작...');
  
  try {
    // 1. 에이전트별 검색 모드 상태 테이블
    console.log('1. v2_search_mode_status 테이블 생성...');
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS v2_search_mode_status (
        agent VARCHAR(50) PRIMARY KEY,
        current_mode VARCHAR(10) NOT NULL DEFAULT 'goto' CHECK (current_mode IN ('goto', 'search')),
        goto_consecutive_blocks INTEGER NOT NULL DEFAULT 0,
        search_execution_count INTEGER NOT NULL DEFAULT 0,
        total_goto_executions INTEGER NOT NULL DEFAULT 0,
        total_search_executions INTEGER NOT NULL DEFAULT 0,
        total_goto_blocks INTEGER NOT NULL DEFAULT 0,
        last_mode_change TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 2. 검색 모드 전환 이력 테이블
    console.log('2. v2_search_mode_history 테이블 생성...');
    await dbService.query(`
      CREATE TABLE IF NOT EXISTS v2_search_mode_history (
        id SERIAL PRIMARY KEY,
        agent VARCHAR(50) NOT NULL,
        from_mode VARCHAR(10) NOT NULL,
        to_mode VARCHAR(10) NOT NULL,
        switch_reason VARCHAR(50) NOT NULL,
        goto_blocks_before_switch INTEGER,
        search_executions_before_switch INTEGER,
        switched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (agent) REFERENCES v2_search_mode_status(agent) ON DELETE CASCADE
      )
    `);
    
    // 인덱스 생성
    console.log('3. 인덱스 생성...');
    await dbService.query(`
      CREATE INDEX IF NOT EXISTS idx_search_mode_history_agent 
      ON v2_search_mode_history(agent)
    `);
    await dbService.query(`
      CREATE INDEX IF NOT EXISTS idx_search_mode_history_switched_at 
      ON v2_search_mode_history(switched_at DESC)
    `);
    
    console.log('✅ SearchMode 테이블 생성 완료!');
    console.log('   - v2_search_mode_status: 에이전트별 상태');
    console.log('   - v2_search_mode_history: 전환 이력');
    
  } catch (error) {
    console.error('❌ 테이블 생성 실패:', error.message);
  } finally {
    await dbService.close();
  }
}

createSearchModeTables();