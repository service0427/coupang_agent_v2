/**
 * 차단 감지 디버깅 도구
 * 최근 에러 로그를 분석하여 차단 감지가 제대로 작동하는지 확인
 */

const dbServiceV2 = require('../lib/services/db-service-v2');

async function debugBlockingDetection() {
  try {
    console.log('🔍 차단 감지 디버깅 분석\n');
    
    // 최근 에러 로그 확인 (local 에이전트)
    const errorResult = await dbServiceV2.query(`
      SELECT 
        created_at,
        error_code,
        error_message,
        agent,
        keyword,
        page_url
      FROM v2_error_logs 
      WHERE agent = 'local'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log('📋 최근 local 에이전트 에러 로그:');
    console.log('시간\t\t에러코드\t\t에러메시지');
    console.log('='.repeat(80));
    
    if (errorResult.rows.length === 0) {
      console.log('❌ local 에이전트 에러 로그가 없습니다.');
    } else {
      errorResult.rows.forEach(row => {
        const time = new Date(row.created_at).toLocaleString('ko-KR');
        const errorCode = row.error_code || 'N/A';
        const errorMsg = row.error_message ? row.error_message.substring(0, 50) + '...' : 'N/A';
        console.log(`${time}\t${errorCode}\t${errorMsg}`);
        
        // 차단 관련 에러 메시지 확인
        const isBlockingError = row.error_message && (
          row.error_message.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
          row.error_message.includes('쿠팡 접속 차단') ||
          row.error_message.includes('net::ERR_HTTP2_PROTOCOL_ERROR')
        );
        
        if (isBlockingError) {
          console.log(`   🚫 차단 감지됨: ${row.error_message}`);
        }
      });
    }
    
    // 최근 실행 로그 확인
    const execResult = await dbServiceV2.query(`
      SELECT 
        started_at,
        success,
        final_status,
        error_message,
        search_mode
      FROM v2_execution_logs 
      WHERE keyword_id = 16  -- 노트북 키워드 ID
      ORDER BY started_at DESC 
      LIMIT 5
    `);
    
    console.log('\n📊 노트북 키워드(ID:16) 최근 실행 기록:');
    console.log('시간\t\t성공\t상태\t\t모드\t에러메시지');
    console.log('='.repeat(80));
    
    if (execResult.rows.length === 0) {
      console.log('❌ 실행 기록이 없습니다.');
    } else {
      execResult.rows.forEach(row => {
        const time = new Date(row.started_at).toLocaleString('ko-KR');
        const success = row.success ? '✅' : '❌';
        const status = row.final_status || 'N/A';
        const mode = row.search_mode ? 'search' : 'goto';
        const errorMsg = row.error_message ? row.error_message.substring(0, 30) + '...' : '';
        
        console.log(`${time}\t${success}\t${status.padEnd(15)}\t${mode}\t${errorMsg}`);
      });
    }
    
    // 차단 패턴 분석
    console.log('\n🔬 차단 패턴 분석:');
    
    const blockPatterns = [
      'ERR_HTTP2_PROTOCOL_ERROR',
      '쿠팡 접속 차단',
      'net::ERR_HTTP2_PROTOCOL_ERROR',
      'timeout',
      'Navigation timeout',
      'Page crash'
    ];
    
    for (const pattern of blockPatterns) {
      const count = await dbServiceV2.query(`
        SELECT COUNT(*) as count
        FROM v2_error_logs 
        WHERE agent = 'local' AND error_message ILIKE $1
      `, [`%${pattern}%`]);
      
      console.log(`   ${pattern}: ${count.rows[0].count}회`);
    }
    
  } catch (error) {
    console.error('디버깅 실패:', error.message);
  } finally {
    process.exit(0);
  }
}

debugBlockingDetection();