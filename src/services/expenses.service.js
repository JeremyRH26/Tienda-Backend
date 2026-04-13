const expensesRepository = require('../repositories/expenses.repository')
const { badRequest, notFound } = require('../utils/httpError')

function paymentMethodForApi(dbValue) {
  const x = String(dbValue || '').toLowerCase()
  if (x === 'cash') return 'efectivo'
  if (x === 'transfer') return 'transferencia'
  return x === 'efectivo' ? 'efectivo' : 'transferencia'
}

function parseExpenseId(id) {
  const num = Number(id)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }
  return num
}

function mapExpenseRowToApi(row) {
  if (!row) return null
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    expenseDate: row.expenseDate,
    amount: row.amount,
    paymentMethod: paymentMethodForApi(row.paymentMethod),
    note: row.note
  }
}

exports.listCategories = async () => {
  return await expensesRepository.listCategories()
}

exports.list = async () => {
  const rows = await expensesRepository.listAll()
  return rows.map((row) => mapExpenseRowToApi(row)).filter(Boolean)
}

exports.createCategory = async (body) => {
  const name = body.name != null ? String(body.name).trim() : ''
  if (!name) {
    throw badRequest('El nombre de la categoría es obligatorio')
  }
  const id = await expensesRepository.insertCategory(name)
  if (id == null) {
    const err = new Error('No se pudo crear ni resolver la categoría')
    err.statusCode = 500
    throw err
  }
  return { id, name }
}

function parseCategoryIdParam(id) {
  const num = Number(id)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }
  return num
}

exports.updateCategory = async (categoryId, body) => {
  const num = parseCategoryIdParam(categoryId)
  if (num == null) {
    throw badRequest('Id de categoría inválido')
  }
  const name = body.name != null ? String(body.name).trim() : ''
  if (!name) {
    throw badRequest('El nombre de la categoría es obligatorio')
  }
  try {
    const ok = await expensesRepository.updateCategoryById(num, name)
    if (!ok) {
      throw notFound('Categoría no encontrada')
    }
    return { id: num, name }
  } catch (e) {
    if (e.statusCode) {
      throw e
    }
    if (e.code === 'ER_DUP_ENTRY') {
      throw badRequest('Ya existe una categoría con ese nombre')
    }
    throw e
  }
}

exports.removeCategory = async (categoryId) => {
  const num = parseCategoryIdParam(categoryId)
  if (num == null) {
    throw badRequest('Id de categoría inválido')
  }
  const cnt = await expensesRepository.countExpensesByCategory(num)
  if (cnt > 0) {
    throw badRequest(
      `No se puede eliminar: hay ${cnt} gasto(s) asociados a esta categoría.`
    )
  }
  const ok = await expensesRepository.deleteCategoryById(num)
  if (!ok) {
    throw notFound('Categoría no encontrada')
  }
  return { deleted: true }
}

exports.getById = async (id) => {
  const num = parseExpenseId(id)
  if (num == null) {
    throw badRequest('Id de gasto inválido')
  }
  let row
  try {
    row = await expensesRepository.findById(num)
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('id inválido')) {
      throw badRequest('Id de gasto inválido')
    }
    throw e
  }
  if (!row) {
    throw notFound('Gasto no encontrado')
  }
  return mapExpenseRowToApi(row)
}

exports.update = async (id, body) => {
  const num = parseExpenseId(id)
  if (num == null) {
    throw badRequest('Id de gasto inválido')
  }

  const amount = Number(body.amount)
  const categoryId = Number(body.categoryId)
  const expenseDate = body.expenseDate
  const paymentRaw = body.paymentMethod != null ? String(body.paymentMethod) : ''
  const note = body.note != null ? String(body.note) : ''

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    throw badRequest('categoryId debe ser un id válido de expense_category')
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest('El monto debe ser un número mayor a cero')
  }

  if (!expenseDate || typeof expenseDate !== 'string') {
    throw badRequest('La fecha del gasto es obligatoria')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate.trim())) {
    throw badRequest('La fecha debe tener formato YYYY-MM-DD')
  }

  const pay = paymentRaw.trim().toLowerCase()
  if (!['efectivo', 'transferencia', 'cash', 'transfer'].includes(pay)) {
    throw badRequest('Método de pago no válido (efectivo o transferencia)')
  }

  try {
    const ok = await expensesRepository.update({
      id: num,
      categoryId,
      expenseDate: expenseDate.trim(),
      amount,
      paymentMethod: pay,
      note
    })
    if (!ok) {
      throw notFound('Gasto no encontrado')
    }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('gasto no encontrado')) {
      throw notFound('Gasto no encontrado')
    }
    if (msg.includes('category_id') || msg.includes('expense_category')) {
      throw badRequest('La categoría no existe. Use un id válido de expense_category.')
    }
    if (msg.includes('id inválido')) {
      throw badRequest('Id de gasto inválido')
    }
    throw e
  }

  const row = await expensesRepository.findById(num)
  const mapped = mapExpenseRowToApi(row)
  if (!mapped) {
    throw notFound('Gasto no encontrado')
  }
  return mapped
}

exports.remove = async (id) => {
  const num = parseExpenseId(id)
  if (num == null) {
    throw badRequest('Id de gasto inválido')
  }
  try {
    await expensesRepository.remove(num)
    return { deleted: true }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('no encontrado')) {
      throw notFound('Gasto no encontrado')
    }
    if (msg.includes('id inválido')) {
      throw badRequest('Id de gasto inválido')
    }
    throw e
  }
}

exports.create = async (body) => {
  const amount = Number(body.amount)
  const categoryId = Number(body.categoryId)
  const expenseDate = body.expenseDate
  const paymentRaw = body.paymentMethod != null ? String(body.paymentMethod) : ''
  const note = body.note != null ? String(body.note) : ''

  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    throw badRequest('categoryId debe ser un id válido de expense_category')
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest('El monto debe ser un número mayor a cero')
  }

  if (!expenseDate || typeof expenseDate !== 'string') {
    throw badRequest('La fecha del gasto es obligatoria')
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate.trim())) {
    throw badRequest('La fecha debe tener formato YYYY-MM-DD')
  }

  const pay = paymentRaw.trim().toLowerCase()
  if (!['efectivo', 'transferencia', 'cash', 'transfer'].includes(pay)) {
    throw badRequest('Método de pago no válido (efectivo o transferencia)')
  }

  try {
    const expenseId = await expensesRepository.insert({
      categoryId,
      expenseDate: expenseDate.trim(),
      amount,
      paymentMethod: pay,
      note
    })

    if (expenseId == null) {
      const err = new Error('No se pudo obtener el id del gasto registrado')
      err.statusCode = 500
      throw err
    }

    return { expenseId }
  } catch (e) {
    const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
    if (msg.includes('category_id') || msg.includes('expense_category')) {
      throw badRequest('La categoría no existe. Use un id válido de expense_category.')
    }
    throw e
  }
}
