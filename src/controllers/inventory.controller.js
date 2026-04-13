const inventoryService = require('../services/inventory.service')

exports.listCategories = async (req, res, next) => {
  try {
    const data = await inventoryService.listCategories()
    res.json({ message: 'Categorías de producto', data })
  } catch (error) {
    next(error)
  }
}

exports.createCategory = async (req, res, next) => {
  try {
    const data = await inventoryService.createCategory(req.body)
    res.status(200).json({
      message: 'Categoría disponible (nueva o existente con el mismo nombre)',
      data
    })
  } catch (error) {
    next(error)
  }
}

exports.listProducts = async (req, res, next) => {
  try {
    const data = await inventoryService.listProducts(req.query)
    res.json({ message: 'Productos e inventario', data })
  } catch (error) {
    next(error)
  }
}

exports.getById = async (req, res, next) => {
  try {
    const data = await inventoryService.getById(req.params.id)
    res.json({ message: 'Detalle del producto', data })
  } catch (error) {
    next(error)
  }
}

exports.create = async (req, res, next) => {
  try {
    const data = await inventoryService.create(req.body)
    res.status(201).json({ message: 'Producto registrado', data })
  } catch (error) {
    next(error)
  }
}

exports.update = async (req, res, next) => {
  try {
    const data = await inventoryService.update(req.params.id, req.body)
    res.json({ message: 'Producto actualizado', data })
  } catch (error) {
    next(error)
  }
}

exports.remove = async (req, res, next) => {
  try {
    const data = await inventoryService.remove(req.params.id)
    res.json({ message: 'Producto dado de baja (status=0)', data })
  } catch (error) {
    next(error)
  }
}

exports.adjustStock = async (req, res, next) => {
  try {
    const data = await inventoryService.adjustStock(req.params.id, req.body)
    res.json({ message: 'Stock actualizado', data })
  } catch (error) {
    next(error)
  }
}

exports.setMinStock = async (req, res, next) => {
  try {
    const data = await inventoryService.setMinStock(req.params.id, req.body)
    res.json({ message: 'Mínimo de stock actualizado', data })
  } catch (error) {
    next(error)
  }
}

exports.uploadImage = async (req, res, next) => {
  try {
    const data = await inventoryService.setImageFromUpload(req.params.id, req.file)
    res.json({ message: 'Imagen subida y URL guardada en el producto', data })
  } catch (error) {
    next(error)
  }
}
