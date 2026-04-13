const salesRepository = require('../repositories/sales.repository')
const { badRequest } = require('../utils/httpError')

function normalizeSaleLine(line) {
  if (!line || typeof line !== 'object') {
    return null
  }
  const productId = Number(line.productId ?? line.product_id)
  const quantity = Number(line.quantity)
  const unitPriceRaw = line.unitPrice ?? line.unit_price
  const unitPrice =
    unitPriceRaw != null && unitPriceRaw !== '' ? Number(unitPriceRaw) : null
  return { productId, quantity, unitPrice }
}

exports.createSale = async (data) => {
  if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
    throw badRequest('Debe incluir productos en la venta')
  }

  const products = []
  for (const line of data.products) {
    const n = normalizeSaleLine(line)
    if (!n || !Number.isFinite(n.productId) || n.productId <= 0) {
      throw badRequest('Cada línea debe incluir productId válido')
    }
    if (!Number.isFinite(n.quantity) || n.quantity <= 0) {
      throw badRequest('Cada línea debe incluir quantity mayor a cero')
    }
    const row = { productId: n.productId, quantity: n.quantity }
    if (n.unitPrice != null && Number.isFinite(n.unitPrice)) {
      row.unitPrice = n.unitPrice
    }
    products.push(row)
  }

  let employeeId =
    data.employeeId != null && data.employeeId !== ''
      ? Number(data.employeeId)
      : null
  if (employeeId == null || !Number.isFinite(employeeId) || employeeId <= 0) {
    employeeId = await salesRepository.getDefaultEmployeeId()
  }
  if (employeeId == null) {
    throw badRequest(
      'No hay empleado activo en el sistema. Envíe employeeId en el cuerpo de la venta.'
    )
  }

  const customerId =
    data.customerId != null && data.customerId !== ''
      ? Number(data.customerId)
      : null
  if (
    customerId != null &&
    (!Number.isFinite(customerId) || customerId <= 0)
  ) {
    throw badRequest('customerId inválido')
  }

  const total =
    data.total != null && data.total !== '' ? Number(data.total) : null
  if (total != null && !Number.isFinite(total)) {
    throw badRequest('total inválido')
  }

  const paymentRaw =
    data.paymentMethod != null ? String(data.paymentMethod).trim().toLowerCase() : ''
  const paymentMethod =
    paymentRaw === '' ? 'efectivo' : paymentRaw

  try {
    const result = await salesRepository.createSale({
      customerId: customerId != null && Number.isFinite(customerId) ? customerId : null,
      employeeId,
      products,
      total: total != null && Number.isFinite(total) ? total : null,
      paymentMethod
    })

    if (result.saleId == null) {
      const err = new Error('No se pudo obtener el id de la venta')
      err.statusCode = 500
      throw err
    }

    return result
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('stock insuficiente') || msg.includes('sin inventario')) {
      throw badRequest('Stock insuficiente para completar la venta.')
    }
    if (msg.includes('total no coincide')) {
      throw badRequest('El total enviado no coincide con precios y cantidades.')
    }
    if (msg.includes('producto inválido') || msg.includes('inactivo')) {
      throw badRequest('Hay productos inválidos o inactivos en el carrito.')
    }
    if (msg.includes('empleado')) {
      throw badRequest('Empleado no válido para registrar la venta.')
    }
    if (msg.includes('JSON de productos')) {
      throw badRequest('Formato de productos inválido.')
    }
    throw e
  }
}
