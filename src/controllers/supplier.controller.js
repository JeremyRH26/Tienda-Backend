const supplierService = require('../services/supplier.service')

exports.list = async (req, res, next) => {
  try {
    const data = await supplierService.list()
    res.json({ message: 'Listado de proveedores', data })
  } catch (error) {
    next(error)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const data = await supplierService.getById(req.params.id)
    res.json({ message: 'Detalle del proveedor', data })
  } catch (error) {
    next(error)
  }
}

exports.create = async (req, res, next) => {
  try {
    const data = await supplierService.create(req.body)
    res.status(201).json({ message: 'Proveedor registrado', data })
  } catch (error) {
    next(error)
  }
}

exports.update = async (req, res, next) => {
  try {
    const data = await supplierService.update(req.params.id, req.body)
    res.json({ message: 'Proveedor actualizado', data })
  } catch (error) {
    next(error)
  }
}

exports.remove = async (req, res, next) => {
  try {
    const data = await supplierService.remove(req.params.id)
    res.json({ message: 'Proveedor eliminado', data })
  } catch (error) {
    next(error)
  }
}
