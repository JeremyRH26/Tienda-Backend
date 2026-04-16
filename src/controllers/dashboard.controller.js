const dashboardService = require('../services/dashboard.service')

exports.getSummary = async (req, res, next) => {
  try {
    const data = await dashboardService.getSummary()
    res.json({ message: 'Resumen del dashboard', data })
  } catch (error) {
    next(error)
  }
}
