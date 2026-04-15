const express = require('express')
const router = express.Router()
const salesController = require('../controllers/sales.controller')

router.get('/summary/day', salesController.daySummary)
router.get('/history', salesController.listHistory)
router.get('/', salesController.listSales)
router.put('/:id', salesController.updateSale)
router.delete('/:id', salesController.deleteSale)
router.get('/:id', salesController.getSaleById)
router.post('/', salesController.createSale)

module.exports = router
