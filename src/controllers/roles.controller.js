const rolesService = require('../services/roles.service')

exports.create = async (req, res, next) => {
  try {
    const result = await rolesService.createRole(req.body)
    res.status(201).json({
      message: 'Rol creado correctamente',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

exports.list = async (req, res, next) => {
  try {
    const data = await rolesService.listRoles()
    res.json({ data })
  } catch (error) {
    next(error)
  }
}

exports.listPermissionsByRole = async (req, res, next) => {
  try {
    const data = await rolesService.listPermissionsByRole(req.params.roleId)
    res.json({ data })
  } catch (error) {
    next(error)
  }
}

exports.assignPermissions = async (req, res, next) => {
  try {
    const data = await rolesService.assignPermissionsToRole(req.params.roleId, req.body)
    res.json({
      message: 'Permisos del rol actualizados correctamente',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.update = async (req, res, next) => {
  try {
    const result = await rolesService.updateRole(req.params.roleId, req.body)
    res.json({
      message: 'Rol actualizado correctamente',
      data: result
    })
  } catch (error) {
    next(error)
  }
}
