require('dotenv').config()
const pool = require('./db/db')
const app = require('./app')

const port = Number(process.env.PORT) || 8080

async function start() {
  try {
    await pool.query('SELECT 1')
    console.log('[DB] Conexión exitosa')
  } catch (err) {
    console.error('[DB] Conexión fallida:', err.message)
  }

  app.listen(port, () => {
    console.log(`Servidor en http://localhost:${port}`)
  }).on('error', (err) => {
    console.error('No se pudo abrir el puerto:', err.message)
    process.exit(1)
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
