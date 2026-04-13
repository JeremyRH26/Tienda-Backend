const expensesService = require('../services/expenses.service')

exports.list = async (req, res, next) => {
  try {
    const data = await expensesService.list()
    res.json({
      message: 'Listado de gastos',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.listCategories = async (req, res, next) => {
  try {
    const rows = await expensesService.listCategories()
    const data = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: Number(r.id),
      name: r.name != null ? String(r.name) : ''
    }))
    res.json({
      message: 'Categorías de gasto',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const data = await expensesService.getById(req.params.id)
    res.json({
      message: 'Detalle del gasto',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.update = async (req, res, next) => {
  try {
    const data = await expensesService.update(req.params.id, req.body)
    res.json({
      message: 'Gasto actualizado correctamente',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.remove = async (req, res, next) => {
  try {
    const data = await expensesService.remove(req.params.id)
    res.json({
      message: 'Gasto eliminado',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.createCategory = async (req, res, next) => {
  try {
    const data = await expensesService.createCategory(req.body)
    res.status(200).json({
      message: 'Categoría disponible (nueva o ya existente con el mismo nombre)',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.updateCategory = async (req, res, next) => {
  try {
    const data = await expensesService.updateCategory(req.params.id, req.body)
    res.json({ message: 'Categoría actualizada', data })
  } catch (error) {
    next(error)
  }
}

exports.removeCategory = async (req, res, next) => {
  try {
    const data = await expensesService.removeCategory(req.params.id)
    res.json({ message: 'Categoría eliminada', data })
  } catch (error) {
    next(error)
  }
}

exports.create = async (req, res, next) => {
  try {
    const data = await expensesService.create(req.body)
    res.status(201).json({
      message: 'Gasto registrado correctamente',
      data
    })
  } catch (error) {
    next(error)
  }
}
