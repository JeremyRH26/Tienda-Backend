const authService = require('../services/auth.service')

exports.login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body)
    res.status(200).json({
      message: 'Sesión iniciada correctamente',
      data: result
    })
  } catch (error) {
    next(error)
  }
}
