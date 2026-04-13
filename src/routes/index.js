const express = require('express')
const router = express.Router()
const salesRoutes = require('./sales.routes')
const authRoutes = require('./auth.routes')
const employeesRoutes = require('./employees.routes')
const rolesRoutes = require('./roles.routes')
const permissionsRoutes = require('./permissions.routes')
const expensesRoutes = require('./expenses.routes')
const inventoryRoutes = require('./inventory.routes')

//importacion de rutas
router.use('/auth', authRoutes)
router.use('/employees', employeesRoutes)
router.use('/expenses', expensesRoutes)
router.use('/inventory', inventoryRoutes)
router.use('/sales', salesRoutes)
router.use('/roles', rolesRoutes)
router.use('/permissions', permissionsRoutes)

module.exports = router
