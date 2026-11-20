const oracledb = require('oracledb');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

let pool;

async function connectDatabase() {
    const user = process.env.ORACLE_USER;
    const password = process.env.ORACLE_PASSWORD;
    const connectString = process.env.ORACLE_CONNECT_STRING || 'localhost:1521/XEPDB1';
    if (!user || !password) {
        throw new Error('Configura ORACLE_USER y ORACLE_PASSWORD en el archivo .env.');
    }
    pool = await oracledb.createPool({
        user,
        password,
        connectString,
        poolMin: 1,
        poolMax: Number(process.env.ORACLE_POOL_MAX || 5),
        poolIncrement: 1
    });
    try {
        await execute('SELECT 1 AS connected FROM dual');
        console.log('Conexión al servicio local Oracle XE establecida.');
    } catch (error) {
        await closeDatabase();
        throw error;
    }
}

async function execute(sql, binds = {}) {
    if (!pool) throw new Error('La conexión a Oracle todavía no está inicializada.');
    let connection;
    try {
        connection = await pool.getConnection();
        const safeBinds = Object.fromEntries(Object.entries(binds).map(([name, value]) => [
            name,
            typeof value === 'string' && value.length > 32767
                ? { val: value, type: oracledb.CLOB }
                : value
        ]));
        return await connection.execute(sql, safeBinds, { autoCommit: true });
    } finally {
        if (connection) await connection.close();
    }
}

async function closeDatabase() {
    if (pool) {
        const activePool = pool;
        pool = null;
        await activePool.close(10);
    }
}

function isConnected() {
    return Boolean(pool);
}

module.exports = { connectDatabase, execute, closeDatabase, isConnected };
