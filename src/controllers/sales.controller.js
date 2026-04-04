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
