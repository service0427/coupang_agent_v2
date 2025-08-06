/**
 * V2 테이블 직접 생성
 * - SQL 파일을 읽지 않고 직접 실행
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function createV2Tables() {
  console.log('V2 테이블 직접 생성 시작...\n');
  
  try {
    // 1. 기존 테이블 삭제
    console.log('1. 기존 테이블 삭제...');
    const dropQueries = [
      'DROP TABLE IF EXISTS v2_product_tracking CASCADE',
      'DROP TABLE IF EXISTS v2_action_logs CASCADE',
      'DROP TABLE IF EXISTS v2_network_logs CASCADE',
      'DROP TABLE IF EXISTS v2_error_logs CASCADE',
      'DROP TABLE IF EXISTS v2_execution_logs CASCADE',
      'DROP TABLE IF EXISTS v2_test_keywords CASCADE'
    ];
    
    for (const query of dropQueries) {
      try {
        await dbServiceV2.query(query);
        console.log(`   ✓ ${query.split(' ')[4]}`);
      } catch (e) {
        console.log(`   ⚠️  ${e.message}`);
      }
    }
    
    // 2. v2_test_keywords 테이블 생성
    console.log('\n2. v2_test_keywords 테이블 생성...');
    await dbServiceV2.query(`
      CREATE TABLE v2_test_keywords (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        keyword VARCHAR(100) NOT NULL,
        suffix VARCHAR(100),
        product_code VARCHAR(20) NOT NULL,
        agent VARCHAR(50),
        profile_name VARCHAR(50),
        proxy_server VARCHAR(255),
        ip_change_mode VARCHAR(20) DEFAULT 'none' CHECK (ip_change_mode IN ('none', 'always', 'on_block')),
        cart_click_enabled BOOLEAN DEFAULT false,
        gpu_disabled BOOLEAN DEFAULT false,
        
        coupang_main_allow TEXT,
        mercury_allow TEXT,
        ljc_allow TEXT,
        assets_cdn_allow TEXT,
        front_cdn_allow TEXT,
        image_cdn_allow TEXT,
        static_cdn_allow TEXT,
        img1a_cdn_allow TEXT,
        thumbnail_cdn_allow TEXT,
        coupang_main_block_patterns TEXT,
        
        max_executions INTEGER DEFAULT 100,
        current_executions INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        last_executed_at TIMESTAMP,
        
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ v2_test_keywords');
    
    // 3. v2_execution_logs 테이블 생성
    console.log('\n3. v2_execution_logs 테이블 생성...');
    await dbServiceV2.query(`
      CREATE TABLE v2_execution_logs (
        id SERIAL PRIMARY KEY,
        keyword_id INTEGER REFERENCES v2_test_keywords(id),
        agent VARCHAR(50),
        session_id UUID DEFAULT gen_random_uuid(),
        
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        duration_ms INTEGER,
        
        page_reached BOOLEAN DEFAULT false,
        page_reached_at TIMESTAMP,
        page_load_ms INTEGER,
        
        product_searched BOOLEAN DEFAULT false,
        product_list_count INTEGER DEFAULT 0,
        pages_searched INTEGER DEFAULT 0,
        
        product_found BOOLEAN DEFAULT false,
        product_found_at TIMESTAMP,
        product_found_page INTEGER,
        product_rank INTEGER,
        product_rank_in_page INTEGER,
        url_rank INTEGER,
        real_rank INTEGER,
        
        product_click_attempted BOOLEAN DEFAULT false,
        product_click_success BOOLEAN DEFAULT false,
        product_click_at TIMESTAMP,
        product_click_ms INTEGER,
        product_page_reached BOOLEAN DEFAULT false,
        
        product_page_url_changed BOOLEAN DEFAULT false,
        product_page_dom_loaded BOOLEAN DEFAULT false,
        product_page_fully_loaded BOOLEAN DEFAULT false,
        product_title_loaded BOOLEAN DEFAULT false,
        cart_button_visible BOOLEAN DEFAULT false,
        cart_button_enabled BOOLEAN DEFAULT false,
        page_load_timeout BOOLEAN DEFAULT false,
        
        cart_click_attempted BOOLEAN DEFAULT false,
        cart_click_success BOOLEAN DEFAULT false,
        cart_click_at TIMESTAMP,
        cart_click_count INTEGER DEFAULT 0,
        
        success BOOLEAN DEFAULT false,
        success_level VARCHAR(20),
        partial_success BOOLEAN DEFAULT false,
        
        item_id BIGINT,
        vendor_item_id BIGINT,
        
        search_mode VARCHAR(20),
        search_mode_reason VARCHAR(50),
        search_query VARCHAR(200),
        
        proxy_used VARCHAR(255),
        actual_ip VARCHAR(50),
        
        final_url TEXT,
        final_status VARCHAR(50),
        error_message TEXT,
        error_step VARCHAR(50),
        warning_messages TEXT[],
        
        optimize_config_applied TEXT,
        
        total_traffic_bytes BIGINT DEFAULT 0,
        total_traffic_mb NUMERIC(10,2),
        cached_traffic_bytes BIGINT DEFAULT 0,
        cached_traffic_mb NUMERIC(10,2),
        blocked_requests_count INTEGER DEFAULT 0,
        allowed_requests_count INTEGER DEFAULT 0,
        
        traffic_by_domain TEXT,
        traffic_by_type TEXT
      )
    `);
    console.log('   ✓ v2_execution_logs');
    
    // 4. v2_product_tracking 테이블 생성
    console.log('\n4. v2_product_tracking 테이블 생성...');
    await dbServiceV2.query(`
      CREATE TABLE v2_product_tracking (
        id SERIAL PRIMARY KEY,
        execution_id INTEGER REFERENCES v2_execution_logs(id),
        session_id UUID,
        
        page_number INTEGER,
        page_url TEXT,
        
        products_in_page INTEGER,
        products_with_rank INTEGER,
        
        target_product_code VARCHAR(20),
        target_found BOOLEAN DEFAULT false,
        target_position INTEGER,
        
        page_load_success BOOLEAN,
        product_list_found BOOLEAN,
        error_message TEXT,
        
        searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✓ v2_product_tracking');
    
    // 5. v2_action_logs 테이블 생성
    console.log('\n5. v2_action_logs 테이블 생성...');
    await dbServiceV2.query(`
      CREATE TABLE v2_action_logs (
        id SERIAL PRIMARY KEY,
        execution_id INTEGER REFERENCES v2_execution_logs(id),
        session_id UUID,
        
        action_seq INTEGER,
        action_type VARCHAR(50),
        action_target VARCHAR(200),
        action_detail TEXT,
        
        process_step VARCHAR(50),
        
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        duration_ms INTEGER,
        
        success BOOLEAN DEFAULT false,
        error_type VARCHAR(50),
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        
        current_url TEXT,
        page_title VARCHAR(500),
        
        dom_ready_ms INTEGER,
        load_complete_ms INTEGER,
        
        element_visible BOOLEAN,
        element_clickable BOOLEAN,
        element_selector VARCHAR(500),
        element_text TEXT,
        
        screenshot_path TEXT,
        dom_snapshot TEXT
      )
    `);
    console.log('   ✓ v2_action_logs');
    
    // 6. v2_network_logs 테이블 생성
    console.log('\n6. v2_network_logs 테이블 생성...');
    await dbServiceV2.query(`
      CREATE TABLE v2_network_logs (
        id SERIAL PRIMARY KEY,
        execution_id INTEGER REFERENCES v2_execution_logs(id),
        action_id INTEGER REFERENCES v2_action_logs(id),
        session_id UUID,
        
        request_id VARCHAR(100),
        request_url TEXT,
        request_method VARCHAR(10),
        request_type VARCHAR(50),
        request_headers TEXT,
        
        response_status INTEGER,
        response_headers TEXT,
        response_size_bytes INTEGER,
        response_body_size INTEGER,
        
        started_at TIMESTAMP,
        dns_lookup_ms NUMERIC(10,2),
        initial_connection_ms NUMERIC(10,2),
        ssl_ms NUMERIC(10,2),
        request_sent_ms NUMERIC(10,2),
        waiting_ms NUMERIC(10,2),
        content_download_ms NUMERIC(10,2),
        total_time_ms NUMERIC(10,2),
        
        was_blocked BOOLEAN DEFAULT false,
        block_reason VARCHAR(100),
        from_cache BOOLEAN DEFAULT false,
        
        domain VARCHAR(255),
        is_third_party BOOLEAN,
        
        content_type VARCHAR(100),
        content_encoding VARCHAR(50)
      )
    `);
    console.log('   ✓ v2_network_logs');
    
    // 7. v2_error_logs 테이블 생성
    console.log('\n7. v2_error_logs 테이블 생성...');
    await dbServiceV2.query(`
      CREATE TABLE v2_error_logs (
        id SERIAL PRIMARY KEY,
        execution_id INTEGER REFERENCES v2_execution_logs(id),
        action_id INTEGER REFERENCES v2_action_logs(id),
        session_id UUID,
        
        error_level VARCHAR(20),
        error_code VARCHAR(100),
        error_message TEXT,
        error_stack TEXT,
        
        occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        action_type VARCHAR(50),
        page_url TEXT,
        
        browser VARCHAR(20) DEFAULT 'chrome',
        agent VARCHAR(50),
        proxy_used VARCHAR(255),
        actual_ip VARCHAR(50),
        
        dom_state TEXT,
        console_logs TEXT,
        network_state TEXT
      )
    `);
    console.log('   ✓ v2_error_logs');
    
    // 8. 인덱스 생성
    console.log('\n8. 인덱스 생성...');
    const indexes = [
      'CREATE INDEX idx_v2_keywords_date ON v2_test_keywords(date)',
      'CREATE INDEX idx_v2_keywords_agent ON v2_test_keywords(agent)',
      'CREATE INDEX idx_v2_keywords_code ON v2_test_keywords(product_code)',
      'CREATE INDEX idx_v2_exec_keyword ON v2_execution_logs(keyword_id)',
      'CREATE INDEX idx_v2_exec_session ON v2_execution_logs(session_id)',
      'CREATE INDEX idx_v2_exec_started ON v2_execution_logs(started_at)',
      'CREATE INDEX idx_v2_action_execution ON v2_action_logs(execution_id)',
      'CREATE INDEX idx_v2_network_execution ON v2_network_logs(execution_id)',
      'CREATE INDEX idx_v2_error_execution ON v2_error_logs(execution_id)'
    ];
    
    let indexCount = 0;
    for (const idx of indexes) {
      try {
        await dbServiceV2.query(idx);
        indexCount++;
      } catch (e) {
        console.log(`   ⚠️  ${e.message}`);
      }
    }
    console.log(`   ✓ ${indexCount}/${indexes.length} 인덱스 생성됨`);
    
    // 9. 생성 확인
    console.log('\n9. 생성된 테이블 확인...');
    const tables = await dbServiceV2.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'v2_%'
      ORDER BY tablename
    `);
    
    console.log('   생성된 V2 테이블:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });
    
    console.log('\n✅ V2 테이블 생성 완료!');
    
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    console.error(error.stack);
  } finally {
    await dbServiceV2.close();
  }
}

if (require.main === module) {
  createV2Tables();
}