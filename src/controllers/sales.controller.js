const salesService = require('../services/sales.service')

exports.createSale = async (req, res, next) => {
  try {
    const saleData = req.body
    const result = await salesService.createSale(saleData)
    res.status(201).json({
      message: 'Venta creada exitosamente',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

exports.listSales = async (req, res, next) => {
  try {
    const dateStart = req.query.dateStart
    const dateEnd = req.query.dateEnd
    if (!dateStart || !dateEnd) {
      const err = new Error('Parámetros dateStart y dateEnd son obligatorios (YYYY-MM-DD)')
      err.statusCode = 400
      throw err
    }
    const data = await salesService.listSalesByDateRange(
      String(dateStart),
      String(dateEnd)
    )
    res.json({ message: 'Ventas', data })
  } catch (e) {
    next(e)
  }
}

exports.listHistory = async (req, res, next) => {
  try {
    const dateStart = req.query.dateStart
    const dateEnd = req.query.dateEnd
    if (!dateStart || !dateEnd) {
      const err = new Error('Parámetros dateStart y dateEnd son obligatorios (YYYY-MM-DD)')
      err.statusCode = 400
      throw err
    }
    const data = await salesService.listHistoryBundle(
      String(dateStart),
      String(dateEnd)
    )
    res.json({ message: 'Historial de ventas y abonos', data })
  } catch (e) {
    next(e)
  }
}

exports.getSaleById = async (req, res, next) => {
  try {
    const data = await salesService.getSaleDetail(req.params.id)
    res.json({ message: 'Detalle de venta', data })
  } catch (e) {
    next(e)
  }
}

exports.daySummary = async (req, res, next) => {
  try {
    const date = req.query.date
    if (!date) {
      const err = new Error('Parámetro date obligatorio (YYYY-MM-DD)')
      err.statusCode = 400
      throw err
    }
    const data = await salesService.getDaySummary(String(date))
    res.json({ message: 'Resumen del día', data })
  } catch (e) {
    next(e)
  }
}

exports.updateSale = async (req, res, next) => {
  try {
    const result = await salesService.updateSale(req.params.id, req.body)
    res.json({
      message: 'Venta actualizada',
      data: result
    })
  } catch (e) {
    next(e)
  }
}

exports.deleteSale = async (req, res, next) => {
  try {
    await salesService.deleteSale(req.params.id)
    res.json({ message: 'Venta eliminada' })
  } catch (e) {
    next(e)
  }
}
