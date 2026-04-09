const employeesService = require('../services/employees.service')

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
