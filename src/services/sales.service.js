const salesRepository = require('../repositories/sales.repository')
const { badRequest } = require('../utils/httpError')

// Los servicios son las validaciones previas a procesar la petición

exports.createSale = async (data) => {
  if (!data.customerId) {
    throw badRequest('El cliente es obligatorio')
  }

  if (!data.products || data.products.length === 0) {
    throw badRequest('Debe incluir productos en la venta')
  }

  return await salesRepository.createSale({
    customerId: data.customerId,
    products: data.products,
    total: data.total ?? null
  })
}
