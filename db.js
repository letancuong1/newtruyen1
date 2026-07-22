const { Pool } = require('pg');

// Build config with sensible defaults for serverless environments
const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, idleTimeoutMillis: 30000 }
    : {
        user: 'hellotruyen_db',
        host: '116.118.9.75',
        database: 'hellotruyen_db',
        password: '2D4NpadfFYytNSB6',
        port: 5432,
        ssl: false,
        max: 2,
        idleTimeoutMillis: 30000
    };

// On serverless platforms (Vercel), reusing a global Pool across invocations
// reduces the overhead of creating many connections. Use a global holder in production.
let pool;
if (process.env.NODE_ENV === 'production') {
    if (!global._pgPool) {
        global._pgPool = new Pool(poolConfig);
    }
    pool = global._pgPool;
} else {
    pool = new Pool(poolConfig);
}

module.exports = pool;