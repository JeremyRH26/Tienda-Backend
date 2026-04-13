const inventoryRepository = require('../repositories/inventory.repository')
const r2Service = require('./r2.service')
const { badRequest, notFound } = require('../utils/httpError')

function parseProductId(id) {
  const num = Number(id)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }
  return num
}

exports.listCategories = async () => {
  return await inventoryRepository.listCategories()
}

exports.createCategory = async (body) => {
  const name = body.name != null ? String(body.name).trim() : ''
  if (!name) {
    throw badRequest('El nombre de la categoría es obligatorio')
  }
  const id = await inventoryRepository.insertCategoryByName(name)
  if (id == null) {
    const err = new Error('No se pudo crear ni resolver la categoría')
    err.statusCode = 500
    throw err
  }
  return { id, name }
}

exports.listProducts = async (query) => {
  const includeInactive =
    query?.includeInactive === true ||
    query?.includeInactive === '1' ||
    query?.includeInactive === 'true'
  return await inventoryRepository.listProducts(includeInactive)
}

exports.getById = async (id) => {
  const num = parseProductId(id)
  if (num == null) {
    throw badRequest('Id de producto inválido')
  }
  try {
    const row = await inventoryRepository.findById(num)
    if (!row) {
      throw notFound('Producto no encontrado')
    }
    return row
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('id inválido')) {
      throw badRequest('Id de producto inválido')
    }
    throw e
  }
}

exports.create = async (body) => {
  const categoryId = Number(body.categoryId)
  const name = body.name != null ? String(body.name).trim() : ''
  const costPrice = Number(body.costPrice)
  const salePrice = Number(body.salePrice)
  const supplierId = body.supplierId != null ? Number(body.supplierId) : null
  const imageUrl = body.imageUrl != null ? String(body.imageUrl).trim() : ''
  const status = body.status != null ? Number(body.status) : 1
  const initialQuantity =
    body.initialQuantity != null ? Number(body.initialQuantity) : 0
  const minStock = body.minStock != null ? Number(body.minStock) : 0

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    throw badRequest('categoryId debe ser válido')
  }
  if (!name) {
    throw badRequest('El nombre del producto es obligatorio')
  }
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw badRequest('costPrice inválido')
  }
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    throw badRequest('salePrice inválido')
  }
  if (!Number.isFinite(initialQuantity) || initialQuantity < 0) {
    throw badRequest('initialQuantity inválida')
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    throw badRequest('minStock inválido')
  }

  try {
    const productId = await inventoryRepository.insert({
      categoryId,
      supplierId: supplierId != null && Number.isFinite(supplierId) ? supplierId : null,
      name,
      costPrice,
      salePrice,
      imageUrl: imageUrl || null,
      status,
      initialQuantity,
      minStock
    })
    if (productId == null) {
      const err = new Error('No se pudo obtener el id del producto')
      err.statusCode = 500
      throw err
    }
    return { productId }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('categoría')) {
      throw badRequest('La categoría no existe.')
    }
    throw e
  }
}

exports.update = async (id, body) => {
  const num = parseProductId(id)
  if (num == null) {
    throw badRequest('Id de producto inválido')
  }

  const categoryId = Number(body.categoryId)
  const name = body.name != null ? String(body.name).trim() : ''
  const costPrice = Number(body.costPrice)
  const salePrice = Number(body.salePrice)
  const supplierId = body.supplierId != null ? Number(body.supplierId) : null
  const imageUrl = body.imageUrl != null ? String(body.imageUrl).trim() : ''
  const status = body.status != null ? Number(body.status) : 1

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    throw badRequest('categoryId debe ser válido')
  }
  if (!name) {
    throw badRequest('El nombre del producto es obligatorio')
  }
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw badRequest('costPrice inválido')
  }
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    throw badRequest('salePrice inválido')
  }

  try {
    const ok = await inventoryRepository.update({
      id: num,
      categoryId,
      supplierId: supplierId != null && Number.isFinite(supplierId) ? supplierId : null,
      name,
      costPrice,
      salePrice,
      imageUrl: imageUrl || null,
      status
    })
    if (!ok) {
      throw notFound('Producto no encontrado')
    }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('no encontrado')) {
      throw notFound('Producto no encontrado')
    }
    if (msg.includes('categoría')) {
      throw badRequest('La categoría no existe.')
    }
    if (msg.includes('id inválido')) {
      throw badRequest('Id de producto inválido')
    }
    throw e
  }

  const row = await inventoryRepository.findById(num)
  if (!row) {
    throw notFound('Producto no encontrado')
  }
  return row
}

exports.remove = async (id) => {
  const num = parseProductId(id)
  if (num == null) {
    throw badRequest('Id de producto inválido')
  }
  try {
    await inventoryRepository.softDelete(num)
    return { deleted: true }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('no encontrado')) {
      throw notFound('Producto no encontrado')
    }
    if (msg.includes('id inválido')) {
      throw badRequest('Id de producto inválido')
    }
    throw e
  }
}

exports.adjustStock = async (id, body) => {
  const num = parseProductId(id)
  if (num == null) {
    throw badRequest('Id de producto inválido')
  }
  const delta = Number(body.delta)
  if (!Number.isFinite(delta) || delta === 0) {
    throw badRequest('delta debe ser un número distinto de cero')
  }
  try {
    const ok = await inventoryRepository.adjustStock(num, delta)
    if (!ok) {
      throw badRequest('No se pudo ajustar el stock')
    }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('stock insuficiente') || msg.includes('sin registro de stock')) {
      throw badRequest(
        msg.includes('sin registro')
          ? 'El producto no tiene registro de inventario.'
          : 'Stock insuficiente para este ajuste.'
      )
    }
    if (msg.includes('id inválido') || msg.includes('product_id inválido')) {
      throw badRequest('Id de producto inválido')
    }
    throw e
  }
  return await exports.getById(num)
}

exports.setImageFromUpload = async (id, file) => {
  const num = parseProductId(id)
  if (num == null) {
    throw badRequest('Id de producto inválido')
  }
  if (!file || !file.buffer) {
    throw badRequest('Archivo de imagen requerido')
  }
  if (!r2Service.isConfigured()) {
    const err = new Error(
      'Almacenamiento R2 no configurado en el servidor (variables R2_*).'
    )
    err.statusCode = 503
    throw err
  }

  const url = await r2Service.uploadProductImage({
    buffer: file.buffer,
    contentType: file.mimetype,
    productId: num,
    originalName: file.originalname
  })

  try {
    const ok = await inventoryRepository.setImageUrl(num, url)
    if (!ok) {
      throw notFound('Producto no encontrado')
    }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('no encontrado')) {
      throw notFound('Producto no encontrado')
    }
    if (msg.includes('id inválido')) {
      throw badRequest('Id de producto inválido')
    }
    throw e
  }

  return await exports.getById(num)
}

exports.setMinStock = async (id, body) => {
  const num = parseProductId(id)
  if (num == null) {
    throw badRequest('Id de producto inválido')
  }
  const minStock = Number(body.minStock)
  if (!Number.isFinite(minStock) || minStock < 0) {
    throw badRequest('minStock inválido')
  }
  try {
    const ok = await inventoryRepository.setMinStock(num, minStock)
    if (!ok) {
      throw badRequest('No se pudo actualizar el mínimo')
    }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('sin registro de stock')) {
      throw badRequest('El producto no tiene registro de inventario.')
    }
    throw e
  }
  return await exports.getById(num)
}
