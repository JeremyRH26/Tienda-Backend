const salesService = require('../services/sales.service')

exports.createSale = async (req, res, next) => {
  try {
    //recibimos los datos de la petición
    const saleData = req.body
    //llamamos al servicio
    const result = await salesService.createSale(saleData)

    //enviamos la respuesta
    res.status(201).json({
      message: 'Venta creada exitosamente',
      data: result
    })
  } catch (error) {
    next(error)
  }
}
