const mysql = require('mysql2/promise')

/**
 * Zona horaria de la sesión MySQL (NOW(), TIMESTAMP, DATE() en consultas).
 * Ej.: America/Guatemala (requiere tablas de zona en el servidor) o -06:00.
 * Si no coincide con tu país, defina DB_TIMEZONE en .env.
 */
const dbTimeZone = process.env.DB_TIMEZONE || '-06:00'

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? 'manager',
  database: process.env.DB_NAME || 'tienda'
})

pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [dbTimeZone], (err) => {
    if (err) {
      console.warn('[db] SET time_zone falló:', err.message)
    }
  })
})

module.exports = pool
