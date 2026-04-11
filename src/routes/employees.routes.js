const express = require('express')
const router = express.Router()
const employeesController = require('../controllers/employees.controller')

router.get('/', employeesController.list)
router.post('/', employeesController.register)
router.put('/:id', employeesController.update)
router.delete('/:id', employeesController.remove)

module.exports = router
