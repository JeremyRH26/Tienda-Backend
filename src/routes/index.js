const express = require('express')
const router = express.Router()
const salesRoutes = require('./sales.routes')
const authRoutes = require('./auth.routes')

//importacion de rutas
router.use('/auth', authRoutes)
router.use('/sales', salesRoutes)

module.exports = router
