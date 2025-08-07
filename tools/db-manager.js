#!/usr/bin/env node
/**
 * 통합 데이터베이스 관리 도구
 * 기존 80+ 개의 개별 스크립트를 하나로 통합
 * 사용법: node tools/db-manager.js [카테고리] [작업] [옵션]
 * 
 * 한국어 답변 정책: 이 도구는 한국어로 모든 출력을 제공합니다.
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;

// 환경 설정 로드
const config = require('../environment');

class DatabaseManager {
  constructor() {
    this.pool = new Pool(config.database);
    this.commands = this.initializeCommands();
  }

  /**
   * 사용 가능한 명령어 초기화
   */
  initializeCommands() {
    return {
      // 조회 (Check) 명령어들
      check: {
        data: '현재 V2 데이터 상태 확인',
        logs: 'V2 실행 로그 확인',
        errors: 'V2 에러 로그 확인',
        keywords: 'V2 키워드 상태 확인',
        tables: 'V2 테이블 구조 확인',
        realtime: '실시간 로그 모니터링',
        activity: '현재 실행 중인 작업 확인',
        mode: '검색 모드 상태 확인'
      },

      // 분석 (Analyze) 명령어들
      analyze: {
        errors: '에러 패턴 분석',
        success: '성공률 분석', 
        performance: '성능 분석',
        traffic: '트래픽 분석',
        daily: '일별 통계 분석',
        modes: '검색 모드 효율성 분석',
        keywords: '키워드 변경 분석'
      },

      // 정리 (Cleanup) 명령어들
      cleanup: {
        stuck: '정체된 실행 정리',
        logs: '오래된 로그 정리',
        tables: '불필요한 테이블 정리',
        temp: '임시 데이터 정리',
        v2data: 'V2 데이터 초기화 (키워드 제외)'
      },

      // 수정 (Fix) 명령어들  
      fix: {
        enum: 'ENUM 타입 마이그레이션',
        stuck: '정체된 실행 해결',
        defaults: '기본값 수정',
        schema: '스키마 일관성 수정'
      },

      // 생성 (Create) 명령어들
      create: {
        tables: 'V2 테이블 생성',
        indexes: '인덱스 생성', 
        views: '뷰 생성'
      },

      // 마이그레이션 (Migrate) 명령어들
      migrate: {
        v2: 'V2 스키마로 마이그레이션',
        enum: 'ENUM 타입으로 마이그레이션',
        modes: '키워드별 모드 시스템 마이그레이션'
      }
    };
  }

  /**
   * 도움말 출력
   */
  showHelp() {
    console.log('\n🎯 통합 데이터베이스 관리 도구');
    console.log('=====================================\n');
    console.log('사용법: node tools/db-manager.js [카테고리] [작업] [옵션]\n');
    
    Object.entries(this.commands).forEach(([category, commands]) => {
      console.log(`📁 ${category.toUpperCase()}:`);
      Object.entries(commands).forEach(([cmd, desc]) => {
        console.log(`   ${category} ${cmd.padEnd(12)} - ${desc}`);
      });
      console.log('');
    });

    console.log('예시:');
    console.log('  node tools/db-manager.js check data      # V2 데이터 상태 확인');
    console.log('  node tools/db-manager.js analyze errors  # 에러 패턴 분석');
    console.log('  node tools/db-manager.js cleanup stuck   # 정체된 실행 정리');
    console.log('  node tools/db-manager.js migrate enum    # ENUM 마이그레이션');
  }

  /**
   * 쿼리 실행
   */
  async query(text, params = []) {
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('❌ 쿼리 실행 오류:', error.message);
      throw error;
    }
  }

  /**
   * V2 데이터 상태 확인
   */
  async checkData() {
    console.log('📊 V2 시스템 데이터 상태 확인\n');

    try {
      // 키워드 현황
      const keywords = await this.query(`
        SELECT 
          COUNT(*) as total_keywords,
          COUNT(CASE WHEN current_mode = 'goto' THEN 1 END) as goto_mode,
          COUNT(CASE WHEN current_mode = 'search' THEN 1 END) as search_mode,
          SUM(current_executions) as total_executions,
          SUM(success_count) as total_success,
          SUM(fail_count) as total_fails,
          SUM(block_count) as total_blocks
        FROM v2_test_keywords
      `);

      const keywordData = keywords.rows[0];
      console.log('🔑 키워드 현황:');
      console.log(`   전체 키워드: ${keywordData.total_keywords}개`);
      console.log(`   GOTO 모드: ${keywordData.goto_mode}개`);
      console.log(`   SEARCH 모드: ${keywordData.search_mode}개`);
      console.log(`   총 실행 횟수: ${keywordData.total_executions}회`);
      console.log(`   성공: ${keywordData.total_success}회`);
      console.log(`   실패: ${keywordData.total_fails}회`);
      console.log(`   차단: ${keywordData.total_blocks}회\n`);

      // 최근 실행 로그
      const recentLogs = await this.query(`
        SELECT 
          COUNT(*) as total_logs,
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'RUNNING' THEN 1 END) as running
        FROM v2_execution_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      const logData = recentLogs.rows[0];
      console.log('📋 최근 24시간 실행 로그:');
      console.log(`   총 로그: ${logData.total_logs}개`);
      console.log(`   완료: ${logData.completed}개`);
      console.log(`   실패: ${logData.failed}개`);
      console.log(`   실행 중: ${logData.running}개\n`);

      // 에러 통계
      const errors = await this.query(`
        SELECT 
          error_level,
          COUNT(*) as count
        FROM v2_error_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY error_level
        ORDER BY count DESC
      `);

      console.log('🚨 최근 24시간 에러 현황:');
      if (errors.rows.length > 0) {
        errors.rows.forEach(row => {
          console.log(`   ${row.error_level}: ${row.count}개`);
        });
      } else {
        console.log('   에러 없음 ✅');
      }

    } catch (error) {
      console.error('❌ 데이터 확인 중 오류:', error.message);
    }
  }

  /**
   * 에러 분석
   */
  async analyzeErrors(days = 7) {
    console.log(`📈 최근 ${days}일간 에러 패턴 분석\n`);

    try {
      // 에러 코드별 통계
      const errorCodes = await this.query(`
        SELECT 
          error_code,
          COUNT(*) as count,
          COUNT(DISTINCT keyword_id) as affected_keywords,
          MAX(created_at) as last_occurrence
        FROM v2_error_logs 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND error_code IS NOT NULL
        GROUP BY error_code
        ORDER BY count DESC
        LIMIT 10
      `);

      console.log('🎯 주요 에러 코드:');
      errorCodes.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.error_code}`);
        console.log(`   발생 횟수: ${row.count}회`);
        console.log(`   영향 키워드: ${row.affected_keywords}개`);
        console.log(`   마지막 발생: ${row.last_occurrence}`);
        console.log('');
      });

      // 네트워크 상태별 에러
      const networkErrors = await this.query(`
        SELECT 
          (network_state->>'connection_state')::text as connection_state,
          COUNT(*) as count
        FROM v2_error_logs 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND network_state IS NOT NULL
        GROUP BY (network_state->>'connection_state')::text
        ORDER BY count DESC
      `);

      if (networkErrors.rows.length > 0) {
        console.log('🌐 네트워크 상태별 에러:');
        networkErrors.rows.forEach(row => {
          console.log(`   ${row.connection_state || '알 수 없음'}: ${row.count}회`);
        });
        console.log('');
      }

    } catch (error) {
      console.error('❌ 에러 분석 중 오류:', error.message);
    }
  }

  /**
   * V2 데이터 초기화 (키워드 테이블 제외)
   */
  async cleanupV2Data() {
    console.log('🧹 V2 데이터 초기화 시작 (v2_test_keywords 제외)\n');

    try {
      // 초기화할 테이블 목록 (외래 키 제약 조건을 고려한 순서)
      const tablesToClean = [
        'v2_error_logs',      // action_id 참조하므로 먼저 삭제
        'v2_product_tracking',
        'v2_action_logs',     // v2_error_logs 삭제 후 삭제
        'v2_execution_logs',  // 모든 참조 삭제 후 마지막에 삭제
        'v2_network_logs'
      ];

      let totalDeleted = 0;

      for (const table of tablesToClean) {
        try {
          // 테이블 존재 확인
          const tableExists = await this.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            );
          `, [table]);

          if (!tableExists.rows[0].exists) {
            console.log(`⚠️ 테이블 ${table}이 존재하지 않습니다. 건너뜀.`);
            continue;
          }

          // 데이터 개수 확인
          const countResult = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
          const recordCount = parseInt(countResult.rows[0].count);

          if (recordCount === 0) {
            console.log(`✅ ${table}: 이미 비어있음 (0개)`);
            continue;
          }

          // 데이터 삭제
          const deleteResult = await this.query(`DELETE FROM ${table}`);
          totalDeleted += deleteResult.rowCount;

          console.log(`🗑️ ${table}: ${recordCount}개 레코드 삭제 완료`);

        } catch (error) {
          console.error(`❌ ${table} 정리 중 오류:`, error.message);
        }
      }

      // v2_test_keywords의 통계만 초기화 (데이터는 유지)
      try {
        console.log('\n📊 v2_test_keywords 통계 필드 초기화...');
        
        const resetResult = await this.query(`
          UPDATE v2_test_keywords 
          SET 
            current_executions = 0,
            success_count = 0,
            fail_count = 0,
            block_count = 0,
            last_executed_at = NULL,
            last_blocked_at = NULL,
            consecutive_blocks = 0,
            mode_execution_count = 0
        `);

        console.log(`✅ v2_test_keywords 통계 초기화: ${resetResult.rowCount}개 키워드 처리`);

      } catch (error) {
        console.error('❌ v2_test_keywords 통계 초기화 중 오류:', error.message);
      }

      // 시퀀스 초기화
      try {
        console.log('\n🔢 시퀀스 초기화...');
        
        const sequences = [
          'v2_execution_logs_id_seq',
          'v2_action_logs_id_seq',
          'v2_error_logs_id_seq',
          'v2_product_tracking_id_seq'
        ];

        for (const seq of sequences) {
          try {
            await this.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
            console.log(`✅ ${seq} 초기화 완료`);
          } catch (error) {
            if (!error.message.includes('does not exist')) {
              console.log(`⚠️ ${seq} 초기화 실패: ${error.message}`);
            }
          }
        }

      } catch (error) {
        console.error('❌ 시퀀스 초기화 중 오류:', error.message);
      }

      console.log(`\n✅ V2 데이터 초기화 완료!`);
      console.log(`   - 총 ${totalDeleted}개 레코드 삭제`);
      console.log(`   - v2_test_keywords 키워드 데이터는 보존됨`);
      console.log(`   - v2_test_keywords 통계만 초기화됨`);

    } catch (error) {
      console.error('❌ V2 데이터 초기화 중 오류:', error.message);
    }
  }

  /**
   * 정체된 실행 정리
   */
  async cleanupStuck() {
    console.log('🧹 정체된 실행 정리 시작\n');

    try {
      // 1시간 이상 RUNNING 상태인 실행들 찾기
      const stuckExecutions = await this.query(`
        SELECT id, session_id, keyword_id, agent, created_at
        FROM v2_execution_logs 
        WHERE status = 'RUNNING' 
          AND created_at < NOW() - INTERVAL '1 hour'
      `);

      if (stuckExecutions.rows.length === 0) {
        console.log('✅ 정체된 실행이 없습니다.');
        return;
      }

      console.log(`⚠️ ${stuckExecutions.rows.length}개의 정체된 실행을 발견했습니다:`);
      stuckExecutions.rows.forEach(row => {
        console.log(`   ID: ${row.id}, 에이전트: ${row.agent}, 시작: ${row.created_at}`);
      });

      // FAILED로 상태 변경
      const updateResult = await this.query(`
        UPDATE v2_execution_logs 
        SET status = 'FAILED',
            end_time = NOW(),
            error_message = '정체된 실행 자동 정리'
        WHERE status = 'RUNNING' 
          AND created_at < NOW() - INTERVAL '1 hour'
      `);

      console.log(`\n✅ ${updateResult.rowCount}개의 정체된 실행을 정리했습니다.`);

    } catch (error) {
      console.error('❌ 정체된 실행 정리 중 오류:', error.message);
    }
  }

  /**
   * 키워드별 모드 시스템 마이그레이션
   */
  async migrateModes() {
    console.log('🔄 키워드별 모드 시스템 마이그레이션 시작\n');

    try {
      // ENUM 타입 생성 (이미 존재하면 무시)
      await this.query(`
        DO $$ BEGIN
          CREATE TYPE search_mode AS ENUM ('goto', 'search');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // current_mode 컬럼이 없으면 추가
      await this.query(`
        DO $$ BEGIN
          ALTER TABLE v2_test_keywords ADD COLUMN current_mode search_mode DEFAULT 'goto';
        EXCEPTION
          WHEN duplicate_column THEN null;
        END $$;
      `);

      // 기타 필요한 컬럼들 추가
      const columnsToAdd = [
        'consecutive_blocks INTEGER DEFAULT 0',
        'mode_execution_count INTEGER DEFAULT 0',
        'total_blocks INTEGER DEFAULT 0',
        'last_mode_change TIMESTAMP',
        'mode_switch_reason VARCHAR(50)'
      ];

      for (const column of columnsToAdd) {
        try {
          await this.query(`ALTER TABLE v2_test_keywords ADD COLUMN ${column}`);
        } catch (error) {
          if (!error.message.includes('already exists')) {
            console.log(`⚠️ 컬럼 추가 중 오류: ${error.message}`);
          }
        }
      }

      console.log('✅ 키워드별 모드 시스템 마이그레이션 완료');

    } catch (error) {
      console.error('❌ 모드 마이그레이션 중 오류:', error.message);
    }
  }

  /**
   * 실시간 로그 모니터링
   */
  async monitorRealtime(duration = 60) {
    console.log(`📡 ${duration}초간 실시간 로그 모니터링 시작...\n`);

    const startTime = Date.now();
    let lastLogId = 0;

    // 현재 최신 로그 ID 조회
    try {
      const latest = await this.query('SELECT MAX(id) as max_id FROM v2_execution_logs');
      lastLogId = latest.rows[0].max_id || 0;
    } catch (error) {
      console.error('❌ 초기 로그 ID 조회 오류:', error.message);
      return;
    }

    console.log('🔄 모니터링 중... (Ctrl+C로 중단)\n');

    const interval = setInterval(async () => {
      try {
        const newLogs = await this.query(`
          SELECT id, keyword_id, agent, status, created_at, error_message
          FROM v2_execution_logs 
          WHERE id > $1
          ORDER BY id ASC
        `, [lastLogId]);

        newLogs.rows.forEach(log => {
          const time = new Date(log.created_at).toLocaleTimeString('ko-KR');
          console.log(`[${time}] ${log.agent} | 키워드 ID: ${log.keyword_id} | ${log.status}`);
          if (log.error_message) {
            console.log(`         오류: ${log.error_message}`);
          }
          lastLogId = log.id;
        });

        // 시간 초과 확인
        if (Date.now() - startTime > duration * 1000) {
          clearInterval(interval);
          console.log('\n✅ 모니터링 완료');
          process.exit(0);
        }

      } catch (error) {
        console.error('❌ 모니터링 중 오류:', error.message);
        clearInterval(interval);
        process.exit(1);
      }
    }, 2000); // 2초마다 확인

    // Ctrl+C 핸들러
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n\n⏹️ 사용자가 모니터링을 중단했습니다.');
      process.exit(0);
    });
  }

  /**
   * 메인 실행 함수
   */
  async run(args) {
    const [category, action, ...options] = args.slice(2);

    if (!category || !action) {
      this.showHelp();
      return;
    }

    if (!this.commands[category] || !this.commands[category][action]) {
      console.error(`❌ 알 수 없는 명령어: ${category} ${action}`);
      this.showHelp();
      return;
    }

    try {
      switch (`${category}.${action}`) {
        case 'check.data':
          await this.checkData();
          break;
        case 'analyze.errors':
          const days = options[0] ? parseInt(options[0]) : 7;
          await this.analyzeErrors(days);
          break;
        case 'cleanup.stuck':
          await this.cleanupStuck();
          break;
        case 'cleanup.v2data':
          await this.cleanupV2Data();
          break;
        case 'migrate.modes':
          await this.migrateModes();
          break;
        case 'check.realtime':
          const duration = options[0] ? parseInt(options[0]) : 60;
          await this.monitorRealtime(duration);
          break;
        default:
          console.log(`🚧 "${category} ${action}" 기능은 아직 구현되지 않았습니다.`);
          console.log('곧 추가될 예정입니다! 🛠️');
      }
    } catch (error) {
      console.error('❌ 실행 중 오류:', error.message);
    } finally {
      await this.pool.end();
    }
  }
}

// 실행
if (require.main === module) {
  const manager = new DatabaseManager();
  manager.run(process.argv).catch(console.error);
}

module.exports = DatabaseManager;