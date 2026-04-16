const express = require('express')
const router = express.Router()
const supplierController = require('../controllers/supplier.controller')

router.get('/', supplierController.list)
router.post('/', supplierController.create)
router.get('/:id', supplierController.getById)
router.put('/:id', supplierController.update)
router.delete('/:id', supplierController.remove)

module.exports = router
