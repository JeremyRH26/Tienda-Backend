const express = require('express')
const router = express.Router()
const permissionsController = require('../controllers/permissions.controller')

router.get('/', permissionsController.listAll)

module.exports = router
