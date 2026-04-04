const salesRepository = require('../repositories/sales.repository')

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

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
