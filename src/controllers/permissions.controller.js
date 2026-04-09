const permissionsService = require('../services/permissions.service')

exports.listAll = async (req, res, next) => {
  try {
    const data = await permissionsService.listAllPermissions()
    res.json({ data })
  } catch (error) {
    next(error)
  }
}
