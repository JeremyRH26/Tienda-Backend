const db = require('../db/db')

function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

function normalizeExpenseRow(row) {
  if (!row) return null
  const ed = row.expense_date
  let expenseDate
  if (ed instanceof Date) {
    expenseDate = ed.toISOString().slice(0, 10)
  } else if (typeof ed === 'string') {
    expenseDate = ed.slice(0, 10)
  } else {
    expenseDate = String(ed ?? '')
  }
  return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    categoryName: row.category_name != null ? String(row.category_name) : '',
    expenseDate,
    amount: Number(row.amount),
    paymentMethod: row.payment_method != null ? String(row.payment_method) : '',
    note: row.note != null ? String(row.note) : ''
  }
}

exports.listCategories = async () => {
  const [rows] = await db.query(
    'SELECT id, name FROM expense_category ORDER BY name ASC'
  )
  return rows
}

exports.listAll = async () => {
  const [sets] = await db.query('CALL sp_expense_list()')
  const rows = firstResultSetRows(sets)
  return rows.map((r) => normalizeExpenseRow(r))
}

exports.insertCategory = async (name) => {
  try {
    const [result] = await db.query(
      'INSERT INTO expense_category (name) VALUES (?)',
      [name]
    )
    return result.insertId != null ? Number(result.insertId) : null
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      const [rows] = await db.query(
        'SELECT id FROM expense_category WHERE name = ? LIMIT 1',
        [name]
      )
      return rows[0]?.id != null ? Number(rows[0].id) : null
    }
    throw e
  }
}

exports.insert = async ({
  categoryId,
  expenseDate,
  amount,
  paymentMethod,
  note
}) => {
  const [sets] = await db.query('CALL sp_expense_insert(?, ?, ?, ?, ?)', [
    Number(categoryId),
    expenseDate,
    amount,
    paymentMethod,
    note ?? null
  ])

  const rows = firstResultSetRows(sets)
  const row = rows[0] ?? {}
  const rawId = row.expense_id ?? row.EXPENSE_ID
  return rawId != null ? Number(rawId) : null
}

exports.findById = async (id) => {
  const [sets] = await db.query('CALL sp_expense_get_by_id(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  return normalizeExpenseRow(rows[0])
}

exports.update = async ({
  id,
  categoryId,
  expenseDate,
  amount,
  paymentMethod,
  note
}) => {
  const [sets] = await db.query('CALL sp_expense_update(?, ?, ?, ?, ?, ?)', [
    Number(id),
    Number(categoryId),
    expenseDate,
    amount,
    paymentMethod,
    note ?? null
  ])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}

exports.remove = async (id) => {
  const [sets] = await db.query('CALL sp_expense_delete(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.deleted ?? rows[0]?.DELETED ?? 0)
  return n > 0
}

exports.updateCategoryById = async (id, name) => {
  const [result] = await db.query(
    'UPDATE expense_category SET name = ? WHERE id = ?',
    [name, Number(id)]
  )
  return result.affectedRows > 0
}

exports.countExpensesByCategory = async (categoryId) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS n FROM expense WHERE category_id = ?',
    [Number(categoryId)]
  )
  return Number(rows[0]?.n ?? rows[0]?.N ?? 0)
}

exports.deleteCategoryById = async (id) => {
  const [result] = await db.query('DELETE FROM expense_category WHERE id = ?', [
    Number(id)
  ])
  return result.affectedRows > 0
}
