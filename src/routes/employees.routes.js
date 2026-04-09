const express = require('express')
const router = express.Router()
const employeesController = require('../controllers/employees.controller')

router.post('/', employeesController.register)

module.exports = router
