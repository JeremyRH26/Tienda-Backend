const express = require('express')
const router = express.Router()
const expensesController = require('../controllers/expenses.controller')

router.get('/categories', expensesController.listCategories)
router.post('/categories', expensesController.createCategory)
router.get('/:id', expensesController.getById)
router.put('/:id', expensesController.update)
router.delete('/:id', expensesController.remove)
router.post('/', expensesController.create)

module.exports = router
