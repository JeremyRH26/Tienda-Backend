const employeesService = require('../services/employees.service')

exports.list = async (req, res, next) => {
  try {
    const data = await employeesService.list()
    res.json({
      message: 'Listado de empleados',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.update = async (req, res, next) => {
  try {
    const data = await employeesService.update(req.params.id, req.body)
    res.json({
      message: 'Empleado actualizado correctamente',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.remove = async (req, res, next) => {
  try {
    const { outcome } = await employeesService.remove(req.params.id)
    const message =
      outcome === 'deleted'
        ? 'Colaborador eliminado del sistema.'
        : 'Colaborador desactivado: se conserva el historial de ventas.'
    res.json({
      message,
      data: { outcome }
    })
  } catch (error) {
    next(error)
  }
}

exports.register = async (req, res, next) => {
  try {
    const result = await employeesService.register(req.body)
    res.status(201).json({
      message: 'Empleado registrado correctamente',
      data: result
    })
  } catch (error) {
    next(error)
  }
}
