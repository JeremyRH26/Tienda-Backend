const customersRepository = require('../repositories/customers.repository')
const { badRequest, notFound } = require('../utils/httpError')

function mapCustomerRow(r) {
  return {
    id: Number(r.id),
    fullName: r.full_name != null ? String(r.full_name) : '',
    phone: r.phone != null ? String(r.phone) : '',
    email: r.email != null ? String(r.email) : '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    balanceDue:
      r.balance_due != null
        ? Number(r.balance_due)
        : r.BALANCE_DUE != null
          ? Number(r.BALANCE_DUE)
          : 0
  }
}

exports.listCustomers = async () => {
  const rows = await customersRepository.listCustomers()
  return (Array.isArray(rows) ? rows : []).map(mapCustomerRow)
}

exports.getCustomer = async (id) => {
  const row = await customersRepository.getCustomerById(id)
  if (!row) {
    throw notFound('Cliente no encontrado')
  }
  const balanceDue = await customersRepository.getCustomerBalanceDue(id)
  return {
    id: Number(row.id),
    fullName: String(row.full_name ?? ''),
    phone: String(row.phone ?? ''),
    email: row.email != null ? String(row.email) : '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    balanceDue
  }
}

exports.createCustomer = async (body) => {
  const fullName =
    body.fullName != null
      ? String(body.fullName).trim()
      : body.full_name != null
        ? String(body.full_name).trim()
        : ''
  const phone =
    body.phone != null ? String(body.phone).trim() : ''
  const email =
    body.email != null && body.email !== ''
      ? String(body.email).trim()
      : null

  if (!fullName) {
    throw badRequest('El nombre del cliente es obligatorio')
  }
  if (!phone) {
    throw badRequest('El teléfono es obligatorio')
  }

  try {
    const customerId = await customersRepository.insertCustomer({
      fullName,
      phone,
      email
    })
    if (customerId == null) {
      const err = new Error('No se pudo crear el cliente')
      err.statusCode = 500
      throw err
    }
    return await exports.getCustomer(customerId)
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('full_name') || msg.includes('phone')) {
      throw badRequest('Datos del cliente inválidos.')
    }
    throw e
  }
}

exports.updateCustomer = async (id, body) => {
  const fullName =
    body.fullName != null
      ? String(body.fullName).trim()
      : body.full_name != null
        ? String(body.full_name).trim()
        : ''
  const phone =
    body.phone != null ? String(body.phone).trim() : ''
  const email =
    body.email != null && body.email !== ''
      ? String(body.email).trim()
      : null

  if (!fullName) {
    throw badRequest('El nombre del cliente es obligatorio')
  }
  if (!phone) {
    throw badRequest('El teléfono es obligatorio')
  }

  const existing = await customersRepository.getCustomerById(id)
  if (!existing) {
    throw notFound('Cliente no encontrado')
  }

  try {
    await customersRepository.updateCustomer(id, { fullName, phone, email })
    return await exports.getCustomer(id)
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('no encontrado')) {
      throw notFound('Cliente no encontrado')
    }
    throw e
  }
}

function groupCreditSales(rows) {
  const map = new Map()
  for (const r of rows) {
    const sid = Number(r.sale_id)
    if (!Number.isFinite(sid)) continue
    if (!map.has(sid)) {
      map.set(sid, {
        saleId: sid,
        saleDate: r.sale_date,
        totalAmount: Number(r.total_amount ?? 0),
        items: []
      })
    }
    map.get(sid).items.push({
      name: String(r.product_name ?? ''),
      quantity: Number(r.quantity ?? 0),
      price: Number(r.unit_price ?? 0)
    })
  }
  return Array.from(map.values())
}

exports.listCreditSalesForCustomer = async (customerId) => {
  const rows = await customersRepository.listCreditSalesWithLines(customerId)
  return groupCreditSales(Array.isArray(rows) ? rows : [])
}

exports.registerAbono = async (customerId, body) => {
  const amount =
    body.amount != null && body.amount !== '' ? Number(body.amount) : NaN
  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest('Monto de abono inválido')
  }
  const note = body.note != null ? String(body.note).trim() : ''

  const existing = await customersRepository.getCustomerById(customerId)
  if (!existing) {
    throw notFound('Cliente no encontrado')
  }

  try {
    const accountId = await customersRepository.insertAbono({
      customerId,
      amount,
      note: note || null
    })
    if (accountId == null) {
      const err = new Error('No se pudo registrar el abono')
      err.statusCode = 500
      throw err
    }
    return { customerAccountId: accountId }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('amount inválido') || msg.includes('customer_id')) {
      throw badRequest('No se pudo registrar el abono.')
    }
    throw e
  }
}

exports.listAbonosByDateRange = async (dateStart, dateEnd) => {
  const rows = await customersRepository.listAbonosByDateRange(dateStart, dateEnd)
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: Number(r.id),
    customerId: Number(r.customer_id),
    customerName: String(r.customer_name ?? ''),
    amount: Number(r.amount ?? 0),
    note: r.note != null ? String(r.note) : '',
    paidAt: r.paid_at,
    createdAt: r.created_at
  }))
}
