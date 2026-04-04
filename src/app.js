const express = require('express')
const cors = require('cors')
const apiRoutes = require('./routes')
const errorMiddleware = require('./middleware/error.middleware')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api', apiRoutes)

app.use(errorMiddleware)

module.exports = app
