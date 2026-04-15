const express = require('express')
const router = express.Router()
const customersController = require('../controllers/customers.controller')

router.get('/abonos', customersController.listAbonos)
router.get('/', customersController.list)
router.post('/', customersController.create)
router.get('/:id/credit-sales', customersController.listCreditSales)
router.post('/:id/abonos', customersController.createAbono)
router.get('/:id', customersController.getById)
router.put('/:id', customersController.update)

module.exports = router
