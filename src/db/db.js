const mysql = require('mysql2/promise')

/**
 * Zona horaria de la sesión MySQL (NOW(), TIMESTAMP, DATE() en consultas).
 * Ej.: America/Guatemala (requiere tablas de zona en el servidor) o -06:00.
 * Si no coincide con tu país, defina DB_TIMEZONE en .env (y en Railway).
 */
const dbTimeZone = process.env.DB_TIMEZONE || '-06:00'

/**
 * mysql2 solo acepta `local`, `Z` u offset `±HH:MM` (no nombres IANA).
 * Sin esto, DATETIME se interpreta en la zona del proceso Node (p. ej. UTC en servidor)
 * y las horas guardadas con SET time_zone quedan desplazadas (~6 h en CA).
 * Debe representar la misma zona civil que `SET time_zone` arriba.
 */
function mysql2TimezoneOption(envTz) {
  const s = String(envTz ?? '').trim()
  if (/^(?:local|Z|[+-]\d{2}:\d{2})$/.test(s)) return s
  const ianaToOffset = {
    'America/Guatemala': '-06:00',
    'America/Belize': '-06:00',
    'America/Costa_Rica': '-06:00',
    'America/El_Salvador': '-06:00',
    'America/Managua': '-06:00',
    'America/Tegucigalpa': '-06:00',
    'America/Mexico_City': '-06:00',
    'America/Merida': '-06:00',
    'America/Monterrey': '-06:00',
    'America/Hermosillo': '-07:00',
    'America/Tijuana': '-08:00'
  }
  return ianaToOffset[s] || '-06:00'
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? 'manager',
  database: process.env.DB_NAME || 'tienda',
  timezone: mysql2TimezoneOption(dbTimeZone)
})

/**
 * Evita condición de carrera: pool.on('connection') hace SET time_zone en callback
 * asíncrono y la primera query del pool puede ejecutarse ANTES de que termine el SET.
 * En RDS la sesión suele ser UTC → NOW() queda en UTC y en la consola parece “otro día”.
 *
 * Marcamos cada conexión física (WeakMap) tras SET exitoso para no repetir en cada query.
 */
const sessionTzReady = new WeakMap()

async function ensureSessionTimezone(conn) {
  const core = conn.connection
  if (sessionTzReady.get(core)) return
  await conn.query('SET time_zone = ?', [dbTimeZone])
  sessionTzReady.set(core, true)
}

const rawQuery = pool.query.bind(pool)
const rawExecute = pool.execute.bind(pool)

pool.query = async function queryWithSessionTz(sql, params) {
  const conn = await pool.getConnection()
  try {
    await ensureSessionTimezone(conn)
    if (params !== undefined) {
      return await conn.query(sql, params)
    }
    return await conn.query(sql)
  } finally {
    conn.release()
  }
}

pool.execute = async function executeWithSessionTz(sql, params) {
  const conn = await pool.getConnection()
  try {
    await ensureSessionTimezone(conn)
    if (params !== undefined) {
      return await conn.execute(sql, params)
    }
    return await conn.execute(sql)
  } finally {
    conn.release()
  }
}

// Referencias por si en el futuro se necesita llamar al pool sin wrapper (depuración).
pool.__rawQuery = rawQuery
pool.__rawExecute = rawExecute

module.exports = pool
