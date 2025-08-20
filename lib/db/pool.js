/**
 * Database Connection Pool
 */

const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    host: 'mkt.techb.kr',
    port: 5432,
    database: 'v1_coupang',
    // database: 'coupang_test',
    user: 'techb_pp',
    password: 'Tech1324!',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Database connected');
});

pool.on('error', (err) => {
    console.error('❌ Database error:', err);
});

module.exports = pool;