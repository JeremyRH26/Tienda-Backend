const express = require('express')
const router = express.Router()
const salesRoutes = require('./sales.routes')

router.use('/sales', salesRoutes)

module.exports = router
