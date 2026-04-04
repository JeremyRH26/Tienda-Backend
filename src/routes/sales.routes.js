const express = require('express')
const router = express.Router()
const salesController = require('../controllers/sales.controller')

//rutas final y llamar al controlador
router.post('/', salesController.createSale)

module.exports = router
