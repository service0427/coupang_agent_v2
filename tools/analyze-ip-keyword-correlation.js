/**
 * IP와 키워드별 성공률 상관관계 분석
 * 특정 IP가 특정 키워드에서 반복 사용되는 패턴과 영향 분석
 */

const dbService = require('../lib/services/db-service');

async function analyzeIpKeywordCorrelation(options = {}) {
  const {
    startId = 31,
    endId = 71,
    minExecutions = 10
  } = options;

  console.log(`🔍 IP-키워드 상관관계 분석 (ID ${startId}~${endId})`);
  console.log('='.repeat(150));

  try {
    // 1. 키워드별 IP 재사용 패턴
    console.log('\n📊 키워드별 IP 재사용 현황:');
    console.log('─'.repeat(150));
    
    const keywordIpQuery = `
      WITH keyword_ip_stats AS (
        SELECT 
          k.id,
          k.keyword,
          -- 키워드에서 파싱한 예상 노출
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
            THEN CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER)
            ELSE NULL
          END as expected_exposure,
          
          COUNT(e.id) as total_executions,
          COUNT(DISTINCT e.ip) as unique_ips,
          COUNT(e.id)::NUMERIC / NULLIF(COUNT(DISTINCT e.ip), 0) as ip_reuse_ratio,
          
          -- 가장 많이 사용된 IP
          MODE() WITHIN GROUP (ORDER BY e.ip) as most_used_ip,
          MAX(ip_count.use_count) as max_ip_usage,
          
          -- 성공 메트릭
          SUM(CASE WHEN e.success THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as found_count,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate
          
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        LEFT JOIN (
          SELECT keyword_id, ip, COUNT(*) as use_count
          FROM v1_executions
          WHERE keyword_id BETWEEN $1 AND $2
          GROUP BY keyword_id, ip
        ) ip_count ON e.keyword_id = ip_count.keyword_id AND e.ip = ip_count.ip
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.id, k.keyword
        HAVING COUNT(e.id) >= $3
      )
      SELECT 
        id,
        SUBSTRING(keyword FROM 1 FOR 30) as keyword_short,
        expected_exposure,
        total_executions,
        unique_ips,
        ROUND(ip_reuse_ratio, 2) as ip_reuse_ratio,
        most_used_ip,
        max_ip_usage,
        success_count,
        found_count,
        ROUND(success_rate, 2) as success_rate,
        -- 노출 차이
        ABS(COALESCE(expected_exposure, 0) - found_count) as exposure_diff
      FROM keyword_ip_stats
      ORDER BY ip_reuse_ratio DESC, exposure_diff DESC
    `;
    
    const keywordIpStats = await dbService.query(keywordIpQuery, [startId, endId, minExecutions]);
    
    console.log(
      'ID'.padEnd(5) + '| ' +
      '키워드'.padEnd(32) + '| ' +
      '실행'.padEnd(6) + '| ' +
      'IP수'.padEnd(6) + '| ' +
      'IP재사용'.padEnd(10) + '| ' +
      '최다IP'.padEnd(17) + '| ' +
      '최다사용'.padEnd(10) + '| ' +
      '성공률'.padEnd(8) + '| ' +
      '노출차이'
    );
    console.log('─'.repeat(150));
    
    keywordIpStats.rows.forEach(row => {
      const reuseLevel = row.ip_reuse_ratio > 2 ? '🔴' : 
                        row.ip_reuse_ratio > 1.5 ? '🟡' : '🟢';
      
      console.log(
        row.id.toString().padEnd(5) + '| ' +
        row.keyword_short.padEnd(32) + '| ' +
        row.total_executions.toString().padEnd(6) + '| ' +
        row.unique_ips.toString().padEnd(6) + '| ' +
        `${reuseLevel}${row.ip_reuse_ratio}:1`.padEnd(12) + '| ' +
        (row.most_used_ip || 'N/A').substring(0, 15).padEnd(17) + '| ' +
        (row.max_ip_usage || 0).toString().padEnd(10) + '| ' +
        `${row.success_rate}%`.padEnd(8) + '| ' +
        row.exposure_diff
      );
    });

    // 2. IP 재사용과 성공률 상관관계
    console.log('\n📈 IP 재사용 비율별 성공률 상관관계:');
    console.log('─'.repeat(120));
    
    const correlationQuery = `
      WITH keyword_metrics AS (
        SELECT 
          k.id,
          k.keyword,
          COUNT(e.id) as executions,
          COUNT(DISTINCT e.ip) as unique_ips,
          COUNT(e.id)::NUMERIC / NULLIF(COUNT(DISTINCT e.ip), 0) as ip_reuse_ratio,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
          
          -- 노출 정확도
          CASE 
            WHEN k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]' THEN
              ABS(
                CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER) - 
                SUM(CASE WHEN e.found THEN 1 ELSE 0 END)
              )
            ELSE NULL
          END as exposure_diff
          
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        WHERE k.id BETWEEN $1 AND $2
        GROUP BY k.id, k.keyword
        HAVING COUNT(e.id) >= 10
      )
      SELECT 
        CASE 
          WHEN ip_reuse_ratio <= 1.1 THEN '1.0-1.1 (최소 중복)'
          WHEN ip_reuse_ratio <= 1.3 THEN '1.1-1.3 (낮은 중복)'
          WHEN ip_reuse_ratio <= 1.5 THEN '1.3-1.5 (중간 중복)'
          WHEN ip_reuse_ratio <= 2.0 THEN '1.5-2.0 (높은 중복)'
          ELSE '2.0+ (매우 높은 중복)'
        END as reuse_category,
        COUNT(*) as keyword_count,
        AVG(success_rate) as avg_success_rate,
        AVG(exposure_diff) as avg_exposure_diff,
        MIN(success_rate) as min_success_rate,
        MAX(success_rate) as max_success_rate
      FROM keyword_metrics
      GROUP BY reuse_category
      ORDER BY 
        CASE reuse_category
          WHEN '1.0-1.1 (최소 중복)' THEN 1
          WHEN '1.1-1.3 (낮은 중복)' THEN 2
          WHEN '1.3-1.5 (중간 중복)' THEN 3
          WHEN '1.5-2.0 (높은 중복)' THEN 4
          ELSE 5
        END
    `;
    
    const correlation = await dbService.query(correlationQuery, [startId, endId]);
    
    console.log(
      'IP 재사용 수준'.padEnd(25) + '| ' +
      '키워드수'.padEnd(10) + '| ' +
      '평균 성공률'.padEnd(12) + '| ' +
      '평균 노출차'.padEnd(12) + '| ' +
      '최소-최대 성공률'
    );
    console.log('─'.repeat(120));
    
    correlation.rows.forEach(row => {
      const successBar = '█'.repeat(Math.round(row.avg_success_rate / 10));
      
      console.log(
        row.reuse_category.padEnd(25) + '| ' +
        row.keyword_count.toString().padEnd(10) + '| ' +
        `${parseFloat(row.avg_success_rate).toFixed(2)}%`.padEnd(12) + '| ' +
        `±${parseFloat(row.avg_exposure_diff || 0).toFixed(1)}`.padEnd(12) + '| ' +
        `${parseFloat(row.min_success_rate).toFixed(1)}-${parseFloat(row.max_success_rate).toFixed(1)}%`
      );
    });

    // 3. 특정 IP의 키워드별 성능 차이
    console.log('\n🎯 동일 IP의 키워드별 성능 차이 (상위 5개 IP):');
    console.log('─'.repeat(150));
    
    const ipPerformanceQuery = `
      WITH ip_keyword_performance AS (
        SELECT 
          e.ip,
          e.keyword_id,
          k.keyword,
          COUNT(*) as usage_count,
          AVG(CASE WHEN e.success THEN 100.0 ELSE 0 END) as success_rate,
          AVG(e.duration) / 1000.0 as avg_duration_sec
        FROM v1_executions e
        JOIN v1_keywords k ON e.keyword_id = k.id
        WHERE k.id BETWEEN $1 AND $2
          AND e.ip IN (
            SELECT ip 
            FROM v1_executions 
            WHERE keyword_id BETWEEN $1 AND $2
            GROUP BY ip 
            HAVING COUNT(*) >= 10
            ORDER BY COUNT(*) DESC 
            LIMIT 5
          )
        GROUP BY e.ip, e.keyword_id, k.keyword
      )
      SELECT 
        ip,
        COUNT(DISTINCT keyword_id) as keyword_count,
        STRING_AGG(
          SUBSTRING(keyword FROM 1 FOR 20) || '(' || usage_count || '회,' || 
          ROUND(success_rate, 0) || '%)', 
          ', ' 
          ORDER BY usage_count DESC
        ) as keyword_performance,
        AVG(success_rate) as avg_success_rate,
        STDDEV(success_rate) as success_rate_variance
      FROM ip_keyword_performance
      GROUP BY ip
      ORDER BY SUM(usage_count) DESC
      LIMIT 5
    `;
    
    const ipPerformance = await dbService.query(ipPerformanceQuery, [startId, endId]);
    
    console.log('IP별 키워드 성능 분포:');
    ipPerformance.rows.forEach(row => {
      console.log(`\n🔸 IP: ${row.ip}`);
      console.log(`   키워드 수: ${row.keyword_count}개`);
      console.log(`   평균 성공률: ${parseFloat(row.avg_success_rate).toFixed(2)}%`);
      console.log(`   성공률 분산: ±${parseFloat(row.success_rate_variance || 0).toFixed(2)}%`);
      console.log(`   키워드별 성능: ${row.keyword_performance}`);
    });

    // 4. IP 재사용과 노출 오차의 관계
    console.log('\n📊 IP 재사용과 노출 오차의 관계:');
    console.log('─'.repeat(150));
    
    const reuseExposureQuery = `
      WITH keyword_analysis AS (
        SELECT 
          k.id,
          k.keyword,
          -- 예상 노출
          CAST(SUBSTRING(k.keyword FROM '\\[\\d+/(\\d+)/\\d+/\\d+\\]') AS INTEGER) as expected_exposure,
          -- 실제 found
          SUM(CASE WHEN e.found THEN 1 ELSE 0 END) as actual_found,
          -- IP 재사용
          COUNT(e.id) as total_execs,
          COUNT(DISTINCT e.ip) as unique_ips,
          COUNT(e.id)::NUMERIC / NULLIF(COUNT(DISTINCT e.ip), 0) as ip_reuse_ratio
        FROM v1_keywords k
        LEFT JOIN v1_executions e ON k.id = e.keyword_id
        WHERE k.id BETWEEN $1 AND $2
          AND k.keyword ~ '\\[\\d+/\\d+/\\d+/\\d+\\]'
        GROUP BY k.id, k.keyword
        HAVING COUNT(e.id) > 0
      )
      SELECT 
        CASE 
          WHEN ip_reuse_ratio <= 1.1 THEN 'IP 중복 낮음 (≤1.1)'
          WHEN ip_reuse_ratio <= 1.5 THEN 'IP 중복 중간 (1.1-1.5)'
          ELSE 'IP 중복 높음 (>1.5)'
        END as ip_reuse_level,
        COUNT(*) as keyword_count,
        AVG(ABS(expected_exposure - actual_found)) as avg_exposure_diff,
        AVG(CASE 
          WHEN expected_exposure > 0 
          THEN ABS(expected_exposure - actual_found)::NUMERIC / expected_exposure * 100
          ELSE 0 
        END) as avg_diff_percentage
      FROM keyword_analysis
      GROUP BY ip_reuse_level
      ORDER BY 
        CASE ip_reuse_level
          WHEN 'IP 중복 낮음 (≤1.1)' THEN 1
          WHEN 'IP 중복 중간 (1.1-1.5)' THEN 2
          ELSE 3
        END
    `;
    
    const reuseExposure = await dbService.query(reuseExposureQuery, [startId, endId]);
    
    console.log(
      'IP 재사용 수준'.padEnd(25) + '| ' +
      '키워드 수'.padEnd(10) + '| ' +
      '평균 노출 차이'.padEnd(15) + '| ' +
      '오차율'
    );
    console.log('─'.repeat(150));
    
    reuseExposure.rows.forEach(row => {
      const errorLevel = row.avg_diff_percentage > 50 ? '🔴' :
                        row.avg_diff_percentage > 30 ? '🟡' : '🟢';
      
      console.log(
        row.ip_reuse_level.padEnd(25) + '| ' +
        row.keyword_count.toString().padEnd(10) + '| ' +
        `±${parseFloat(row.avg_exposure_diff).toFixed(1)}`.padEnd(15) + '| ' +
        `${errorLevel} ${parseFloat(row.avg_diff_percentage).toFixed(1)}%`
      );
    });

    // 5. 결론
    console.log('\n💡 분석 결론:');
    console.log('─'.repeat(150));
    
    // IP 재사용이 가장 높은 키워드들
    const highReuseKeywords = keywordIpStats.rows.filter(r => r.ip_reuse_ratio > 1.5);
    if (highReuseKeywords.length > 0) {
      console.log('\n🔴 IP 재사용이 높은 키워드 (재사용률 > 1.5):');
      highReuseKeywords.slice(0, 5).forEach(k => {
        console.log(`   ID ${k.id}: ${k.keyword_short} - 재사용 ${k.ip_reuse_ratio}:1, 노출차이 ${k.exposure_diff}`);
      });
    }
    
    // 상관관계 요약
    if (correlation.rows.length > 0) {
      const lowReuse = correlation.rows.find(r => r.reuse_category.includes('최소'));
      const highReuse = correlation.rows.find(r => r.reuse_category.includes('매우 높은'));
      
      if (lowReuse && highReuse) {
        const successDiff = lowReuse.avg_success_rate - highReuse.avg_success_rate;
        console.log(`\n📊 IP 재사용 영향:`);
        console.log(`   최소 중복 평균 성공률: ${parseFloat(lowReuse.avg_success_rate).toFixed(2)}%`);
        console.log(`   높은 중복 평균 성공률: ${parseFloat(highReuse.avg_success_rate).toFixed(2)}%`);
        
        if (Math.abs(successDiff) > 10) {
          console.log(`   ⚠️ IP 재사용이 성공률에 ${successDiff > 0 ? '부정적' : '긍정적'} 영향 (${Math.abs(successDiff).toFixed(1)}% 차이)`);
        } else {
          console.log(`   ✅ IP 재사용과 성공률 간 상관관계 미미 (${Math.abs(successDiff).toFixed(1)}% 차이)`);
        }
      }
    }
    
  } catch (error) {
    console.error('오류 발생:', error.message);
  } finally {
    await dbService.close();
  }
}

// CLI 실행
const args = process.argv.slice(2);
const options = {};

args.forEach((arg, index) => {
  if (arg === '--start' && args[index + 1]) {
    options.startId = parseInt(args[index + 1]);
  } else if (arg === '--end' && args[index + 1]) {
    options.endId = parseInt(args[index + 1]);
  } else if (arg === '--min' && args[index + 1]) {
    options.minExecutions = parseInt(args[index + 1]);
  }
});

if (args.includes('--help')) {
  console.log(`
사용법: node analyze-ip-keyword-correlation.js [옵션]

옵션:
  --start <ID>     시작 키워드 ID (기본: 31)
  --end <ID>       종료 키워드 ID (기본: 71)
  --min <수>       최소 실행 횟수 (기본: 10)
  --help          도움말 표시
`);
  process.exit(0);
}

analyzeIpKeywordCorrelation(options);