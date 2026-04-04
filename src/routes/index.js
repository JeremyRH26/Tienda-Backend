const express = require('express')
const router = express.Router()
const salesRoutes = require('./sales.routes')

//importacion de rutas
router.use('/sales', salesRoutes)

module.exports = router
