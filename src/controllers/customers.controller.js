const customersService = require('../services/customers.service')

exports.list = async (req, res, next) => {
  try {
    const data = await customersService.listCustomers()
    res.json({ message: 'Clientes', data })
  } catch (e) {
    next(e)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const data = await customersService.getCustomer(req.params.id)
    res.json({ message: 'Cliente', data })
  } catch (e) {
    next(e)
  }
}

exports.create = async (req, res, next) => {
  try {
    const data = await customersService.createCustomer(req.body)
    res.status(201).json({ message: 'Cliente creado', data })
  } catch (e) {
    next(e)
  }
}

exports.update = async (req, res, next) => {
  try {
    const data = await customersService.updateCustomer(req.params.id, req.body)
    res.json({ message: 'Cliente actualizado', data })
  } catch (e) {
    next(e)
  }
}

exports.listCreditSales = async (req, res, next) => {
  try {
    const data = await customersService.listCreditSalesForCustomer(req.params.id)
    res.json({ message: 'Ventas a crédito del cliente', data })
  } catch (e) {
    next(e)
  }
}

exports.createAbono = async (req, res, next) => {
  try {
    const data = await customersService.registerAbono(req.params.id, req.body)
    res.status(201).json({ message: 'Abono registrado', data })
  } catch (e) {
    next(e)
  }
}

exports.listAbonos = async (req, res, next) => {
  try {
    const dateStart = req.query.dateStart
    const dateEnd = req.query.dateEnd
    if (!dateStart || !dateEnd) {
      const err = new Error('Parámetros dateStart y dateEnd son obligatorios (YYYY-MM-DD)')
      err.statusCode = 400
      throw err
    }
    const data = await customersService.listAbonosByDateRange(
      String(dateStart),
      String(dateEnd)
    )
    res.json({ message: 'Abonos', data })
  } catch (e) {
    next(e)
  }
}
