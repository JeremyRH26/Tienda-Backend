const express = require('express')
const router = express.Router()
const salesRoutes = require('./sales.routes')
const authRoutes = require('./auth.routes')
const employeesRoutes = require('./employees.routes')

//importacion de rutas
router.use('/auth', authRoutes)
router.use('/employees', employeesRoutes)
router.use('/sales', salesRoutes)

module.exports = router
