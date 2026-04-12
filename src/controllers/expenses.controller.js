const expensesService = require('../services/expenses.service')

exports.listCategories = async (req, res, next) => {
  try {
    const data = await expensesService.listCategories()
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
    res.status(201).json({
      message: 'Categoría creada',
      data
    })
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
