const express = require('express')
const router = express.Router()
const rolesController = require('../controllers/roles.controller')

router.post('/', rolesController.create)
router.get('/', rolesController.list)
router.get('/:roleId/permissions', rolesController.listPermissionsByRole)
router.put('/:roleId/permissions', rolesController.assignPermissions)
router.put('/:roleId', rolesController.update)

module.exports = router
