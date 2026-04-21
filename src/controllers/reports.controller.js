const reportsService = require('../services/reports.service')

exports.getFull = async (req, res, next) => {
  try {
    const data = await reportsService.getFullReport({
      grouping: req.query.grouping,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      refDate: req.query.refDate
    })
    res.json({ message: 'Reporte', data })
  } catch (error) {
    next(error)
  }
}
