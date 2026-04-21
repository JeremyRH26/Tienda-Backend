const express = require('express')
const router = express.Router()
const reportsController = require('../controllers/reports.controller')

router.get('/full', reportsController.getFull)

module.exports = router
