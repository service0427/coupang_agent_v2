/**
 * IP 중복 분석 도구
 * - IP별 실행 횟수 및 성공률 분석
 * - 중복 IP 사용이 성공률에 미치는 영향 파악
 * - 프록시별 IP 분포 확인
 */

const dbService = require('../lib/services/db-service');

async function analyzeIpDuplication(options = {}) {
  const {
    keywordId = null,
    days = 7,
    minUsage = 2,
    showProxyDetails = false
  } = options;

  console.log('🌐 IP 중복 사용 분석');
  console.log('='.repeat(150));

  try {
    // 기본 WHERE 절 구성
    let whereClause = `WHERE e.executed >= NOW() - INTERVAL '${days} days'`;
    const params = [];
    
    if (keywordId) {
      params.push(keywordId);
      whereClause += ` AND e.keyword_id = $${params.length}`;
    }

    // 1. IP별 사용 통계
    console.log('\n📊 IP별 사용 통계 (중복 사용 IP):');
    console.log('─'.repeat(150));
    
    const ipStatsQuery = `
      WITH ip_stats AS (
        SELECT 
          e.ip,
          COUNT(*) as total_uses,
          COUNT(DISTINCT e.keyword_id) as unique_keywords,
          COUNT(DISTINCT DATE(e.executed)) as active_days,
          SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN NOT e.success THEN 1 ELSE 0 END) as fail_count,
          SUM(CASE WHEN e.cart THEN 1 ELSE 0 END) as cart_count,
          ROUND(AVG(e.duration)/1000.0, 2) as avg_duration_sec,
          ROUND(AVG(e.traffic), 2) as avg_traffic_mb,
          MIN(e.executed) as first_used,
          MAX(e.executed) as last_used,
          STRING_AGG(DISTINCT e.proxy, ', ') as proxies_used
        FROM v1_executions e
        ${whereClause}
          AND e.ip IS NOT NULL
        GROUP BY e.ip
        HAVING COUNT(*) >= ${minUsage}
      )
      SELECT 
        ip,
        total_uses,
        unique_keywords,
        active_days,
        success_count,
        fail_count,
        cart_count,
        ROUND((success_count::NUMERIC / total_uses) * 100, 2) as success_rate,
        ROUND((cart_count::NUMERIC / NULLIF(success_count, 0)) * 100, 2) as cart_rate,
        avg_duration_sec,
        avg_traffic_mb,
        first_used,
        last_used,
        proxies_used
      FROM ip_stats
      ORDER BY total_uses DESC
      LIMIT 20
    `;
    
    const ipStats = await dbService.query(ipStatsQuery, params);
    
    console.log(
      'IP 주소'.padEnd(17) + '| ' +
      '사용수'.padEnd(8) + '| ' +
      '키워드'.padEnd(8) + '| ' +
      '성공'.padEnd(6) + '| ' +
      '실패'.padEnd(6) + '| ' +
      '장바구니'.padEnd(10) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      '장바구니율'.padEnd(12) + '| ' +
      '평균시간'.padEnd(10) + '| ' +
      '활성일수'
    );
    console.log('─'.repeat(150));
    
    ipStats.rows.forEach(row => {
      // IP 중복도에 따른 표시
      const duplicateIcon = row.total_uses > 100 ? '🔴' : 
                           row.total_uses > 50 ? '🟡' : 
                           row.total_uses > 20 ? '🟢' : '⚪';
      
      console.log(
        (row.ip || 'NULL').substring(0, 15).padEnd(17) + '| ' +
        `${duplicateIcon}${row.total_uses}`.padEnd(10) + '| ' +
        row.unique_keywords.toString().padEnd(8) + '| ' +
        row.success_count.toString().padEnd(6) + '| ' +
        row.fail_count.toString().padEnd(6) + '| ' +
        row.cart_count.toString().padEnd(10) + '| ' +
        `${row.success_rate}%`.padEnd(8) + '| ' +
        `${row.cart_rate || 0}%`.padEnd(12) + '| ' +
        `${row.avg_duration_sec}초`.padEnd(10) + '| ' +
        row.active_days.toString()
      );
    });

    // 2. IP 중복도별 성공률 비교
    console.log('\n📈 IP 중복도별 성공률 비교:');
    console.log('─'.repeat(120));
    
    const duplicateAnalysisQuery = `
      WITH ip_usage AS (
        SELECT 
          e.ip,
          COUNT(*) as use_count,
          AVG(CASE WHEN e.success THEN 100 ELSE 0 END) as success_rate,
          AVG(CASE WHEN e.cart THEN 100 ELSE 0 END) as cart_click_rate
        FROM v1_executions e
        ${whereClause}
          AND e.ip IS NOT NULL
        GROUP BY e.ip
      ),
      usage_groups AS (
        SELECT 
          CASE 
            WHEN use_count = 1 THEN '1회 사용'
            WHEN use_count BETWEEN 2 AND 5 THEN '2-5회'
            WHEN use_count BETWEEN 6 AND 10 THEN '6-10회'
            WHEN use_count BETWEEN 11 AND 20 THEN '11-20회'
            WHEN use_count BETWEEN 21 AND 50 THEN '21-50회'
            WHEN use_count BETWEEN 51 AND 100 THEN '51-100회'
            ELSE '100회 초과'
          END as usage_group,
          CASE 
            WHEN use_count = 1 THEN 1
            WHEN use_count BETWEEN 2 AND 5 THEN 2
            WHEN use_count BETWEEN 6 AND 10 THEN 3
            WHEN use_count BETWEEN 11 AND 20 THEN 4
            WHEN use_count BETWEEN 21 AND 50 THEN 5
            WHEN use_count BETWEEN 51 AND 100 THEN 6
            ELSE 7
          END as group_order,
          COUNT(*) as ip_count,
          ROUND(AVG(success_rate), 2) as avg_success_rate,
          ROUND(AVG(cart_click_rate), 2) as avg_cart_rate,
          SUM(use_count) as total_executions
        FROM ip_usage
        GROUP BY usage_group, group_order
      )
      SELECT 
        usage_group,
        ip_count,
        total_executions,
        avg_success_rate,
        avg_cart_rate
      FROM usage_groups
      ORDER BY group_order
    `;
    
    const duplicateAnalysis = await dbService.query(duplicateAnalysisQuery, params);
    
    console.log(
      '사용 빈도'.padEnd(15) + '| ' +
      'IP 수'.padEnd(8) + '| ' +
      '총 실행수'.padEnd(10) + '| ' +
      '평균 성공률'.padEnd(12) + '| ' +
      '평균 장바구니율'.padEnd(15) + '| ' +
      '성능 지표'
    );
    console.log('─'.repeat(120));
    
    duplicateAnalysis.rows.forEach(row => {
      // 성공률 시각화
      const successBar = '█'.repeat(Math.round(row.avg_success_rate / 10));
      
      console.log(
        row.usage_group.padEnd(15) + '| ' +
        row.ip_count.toString().padEnd(8) + '| ' +
        row.total_executions.toString().padEnd(10) + '| ' +
        `${row.avg_success_rate}%`.padEnd(12) + '| ' +
        `${row.avg_cart_rate}%`.padEnd(15) + '| ' +
        successBar
      );
    });

    // 3. 프록시별 IP 분포
    if (showProxyDetails) {
      console.log('\n🔄 프록시별 IP 사용 패턴:');
      console.log('─'.repeat(150));
      
      const proxyIpQuery = `
        WITH proxy_stats AS (
          SELECT 
            COALESCE(e.proxy, 'Direct') as proxy_name,
            COUNT(DISTINCT e.ip) as unique_ips,
            COUNT(*) as total_uses,
            COUNT(DISTINCT e.keyword_id) as unique_keywords,
            AVG(CASE WHEN e.success THEN 100 ELSE 0 END) as success_rate,
            STRING_AGG(DISTINCT e.ip, ', ' ORDER BY e.ip) as ip_list
          FROM v1_executions e
          ${whereClause}
          GROUP BY e.proxy
          HAVING COUNT(*) >= 5
        )
        SELECT 
          proxy_name,
          unique_ips,
          total_uses,
          unique_keywords,
          ROUND(success_rate, 2) as success_rate,
          ROUND(total_uses::NUMERIC / NULLIF(unique_ips, 0), 2) as avg_uses_per_ip,
          CASE 
            WHEN LENGTH(ip_list) > 100 
            THEN SUBSTRING(ip_list, 1, 97) || '...'
            ELSE ip_list
          END as sample_ips
        FROM proxy_stats
        ORDER BY total_uses DESC
        LIMIT 15
      `;
      
      const proxyIpStats = await dbService.query(proxyIpQuery, params);
      
      console.log(
        '프록시'.padEnd(25) + '| ' +
        'IP수'.padEnd(6) + '| ' +
        '사용수'.padEnd(8) + '| ' +
        'IP당 평균'.padEnd(10) + '| ' +
        '성공률'.padEnd(8) + '| ' +
        'IP 샘플'
      );
      console.log('─'.repeat(150));
      
      proxyIpStats.rows.forEach(row => {
        console.log(
          row.proxy_name.substring(0, 23).padEnd(25) + '| ' +
          row.unique_ips.toString().padEnd(6) + '| ' +
          row.total_uses.toString().padEnd(8) + '| ' +
          `${row.avg_uses_per_ip}회`.padEnd(10) + '| ' +
          `${row.success_rate}%`.padEnd(8) + '| ' +
          (row.sample_ips || 'N/A').substring(0, 60)
        );
      });
    }

    // 4. 시간대별 IP 중복 패턴
    console.log('\n⏰ 시간대별 IP 중복 사용 패턴:');
    console.log('─'.repeat(120));
    
    const timeIpQuery = `
      WITH hourly_ip AS (
        SELECT 
          EXTRACT(HOUR FROM e.executed) as hour,
          COUNT(DISTINCT e.ip) as unique_ips,
          COUNT(*) as total_uses,
          ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT e.ip), 0), 2) as reuse_ratio,
          AVG(CASE WHEN e.success THEN 100 ELSE 0 END) as success_rate
        FROM v1_executions e
        ${whereClause}
          AND e.ip IS NOT NULL
        GROUP BY hour
        HAVING COUNT(*) >= 10
      )
      SELECT 
        hour,
        unique_ips,
        total_uses,
        reuse_ratio,
        ROUND(success_rate, 2) as success_rate
      FROM hourly_ip
      ORDER BY hour
    `;
    
    const timeIpStats = await dbService.query(timeIpQuery, params);
    
    console.log(
      '시간'.padEnd(8) + '| ' +
      '고유 IP'.padEnd(10) + '| ' +
      '총 사용'.padEnd(10) + '| ' +
      '재사용 비율'.padEnd(12) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      '중복도 지표'
    );
    console.log('─'.repeat(120));
    
    timeIpStats.rows.forEach(row => {
      // 재사용 비율 시각화
      const reuseLevel = row.reuse_ratio > 10 ? '🔴🔴🔴' :
                         row.reuse_ratio > 5 ? '🟡🟡' :
                         row.reuse_ratio > 2 ? '🟢' : '⚪';
      
      console.log(
        `${row.hour.toString().padStart(2, '0')}:00`.padEnd(8) + '| ' +
        row.unique_ips.toString().padEnd(10) + '| ' +
        row.total_uses.toString().padEnd(10) + '| ' +
        `${row.reuse_ratio}:1`.padEnd(12) + '| ' +
        `${row.success_rate}%`.padEnd(8) + '| ' +
        reuseLevel
      );
    });

    // 5. IP 중복 영향 분석 요약
    console.log('\n💡 IP 중복 사용 영향 분석:');
    console.log('─'.repeat(150));
    
    const impactQuery = `
      WITH ip_classification AS (
        SELECT 
          e.*,
          ip_count.use_count,
          CASE 
            WHEN ip_count.use_count = 1 THEN 'unique'
            WHEN ip_count.use_count <= 10 THEN 'low_reuse'
            WHEN ip_count.use_count <= 50 THEN 'medium_reuse'
            ELSE 'high_reuse'
          END as ip_type
        FROM v1_executions e
        JOIN (
          SELECT ip, COUNT(*) as use_count
          FROM v1_executions
          ${whereClause}
          GROUP BY ip
        ) ip_count ON e.ip = ip_count.ip
        ${whereClause}
      )
      SELECT 
        ip_type,
        COUNT(*) as execution_count,
        AVG(CASE WHEN success THEN 100 ELSE 0 END) as success_rate,
        AVG(CASE WHEN cart THEN 100 ELSE 0 END) as cart_rate,
        AVG(duration)/1000.0 as avg_duration_sec,
        COUNT(DISTINCT keyword_id) as affected_keywords
      FROM ip_classification
      GROUP BY ip_type
      ORDER BY 
        CASE ip_type
          WHEN 'unique' THEN 1
          WHEN 'low_reuse' THEN 2
          WHEN 'medium_reuse' THEN 3
          ELSE 4
        END
    `;
    
    const impactStats = await dbService.query(impactQuery, params);
    
    console.log('IP 유형별 성능 비교:');
    impactStats.rows.forEach(row => {
      const typeLabel = {
        'unique': '🟢 고유 IP (1회)',
        'low_reuse': '🟡 낮은 재사용 (2-10회)',
        'medium_reuse': '🟠 중간 재사용 (11-50회)',
        'high_reuse': '🔴 높은 재사용 (50회 초과)'
      }[row.ip_type] || row.ip_type;
      
      console.log(`\n${typeLabel}:`);
      console.log(`  - 실행 횟수: ${row.execution_count}회`);
      console.log(`  - 성공률: ${parseFloat(row.success_rate).toFixed(2)}%`);
      console.log(`  - 장바구니 클릭률: ${parseFloat(row.cart_rate).toFixed(2)}%`);
      console.log(`  - 평균 실행시간: ${parseFloat(row.avg_duration_sec).toFixed(2)}초`);
      console.log(`  - 영향받은 키워드: ${row.affected_keywords}개`);
    });

    // 권장사항
    console.log('\n📌 권장사항:');
    const highReuseStats = impactStats.rows.find(r => r.ip_type === 'high_reuse');
    const uniqueStats = impactStats.rows.find(r => r.ip_type === 'unique');
    
    if (highReuseStats && uniqueStats) {
      const successDiff = parseFloat(uniqueStats.success_rate) - parseFloat(highReuseStats.success_rate);
      if (successDiff > 10) {
        console.log('  ⚠️ IP 재사용이 성공률을 크게 저하시키고 있습니다.');
        console.log(`     고유 IP 대비 ${successDiff.toFixed(1)}% 낮은 성공률`);
        console.log('  → 프록시 풀 확대 또는 IP 로테이션 주기 단축 권장');
      }
    }
    
    const topReusedIp = ipStats.rows[0];
    if (topReusedIp && topReusedIp.total_uses > 100) {
      console.log(`  ⚠️ IP ${topReusedIp.ip}가 ${topReusedIp.total_uses}회 과도하게 사용됨`);
      console.log('  → 해당 IP 차단 위험. 프록시 교체 필요');
    }
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 옵션 처리
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--keyword' && args[index + 1]) {
    options.keywordId = parseInt(args[index + 1]);
  } else if (arg === '--days' && args[index + 1]) {
    options.days = parseInt(args[index + 1]);
  } else if (arg === '--min' && args[index + 1]) {
    options.minUsage = parseInt(args[index + 1]);
  } else if (arg === '--proxy-details') {
    options.showProxyDetails = true;
  }
});

// 사용법 안내
if (args.includes('--help')) {
  console.log(`
사용법: node analyze-ip-duplication.js [옵션]

옵션:
  --keyword <ID>    특정 키워드만 분석
  --days <숫자>     분석 기간 (기본: 7일)
  --min <숫자>      최소 사용 횟수 (기본: 2)
  --proxy-details  프록시별 상세 정보 표시
  --help           도움말 표시

예시:
  node analyze-ip-duplication.js --days 30 --min 5
  node analyze-ip-duplication.js --keyword 31 --proxy-details
  node analyze-ip-duplication.js --days 1 --min 10
`);
  process.exit(0);
}

// 실행
analyzeIpDuplication(options);