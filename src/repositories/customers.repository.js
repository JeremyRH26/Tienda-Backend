const db = require('../db/db')

function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

exports.listCustomers = async () => {
  const [sets] = await db.query('CALL sp_customer_list_with_balance()')
  return firstResultSetRows(sets)
}

exports.getCustomerById = async (id) => {
  const [sets] = await db.query('CALL sp_customer_get_by_id(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}

exports.insertCustomer = async ({ fullName, phone, email }) => {
  const [sets] = await db.query('CALL sp_customer_insert(?, ?, ?)', [
    fullName,
    phone,
    email ?? null
  ])
  const rows = firstResultSetRows(sets)
  const row = rows[0] ?? {}
  const cid = row.customer_id ?? row.CUSTOMER_ID
  return cid != null ? Number(cid) : null
}

exports.updateCustomer = async (id, { fullName, phone, email }) => {
  const [sets] = await db.query('CALL sp_customer_update(?, ?, ?, ?)', [
    Number(id),
    fullName,
    phone,
    email ?? null
  ])
  const rows = firstResultSetRows(sets)
  const row = rows[0] ?? {}
  return Number(row.affected ?? row.AFFECTED ?? 0)
}

exports.listAbonosByDateRange = async (dateStart, dateEnd) => {
  const [sets] = await db.query('CALL sp_customer_abono_list_by_date_range(?, ?)', [
    dateStart,
    dateEnd
  ])
  return firstResultSetRows(sets)
}

exports.getCustomerBalanceDue = async (customerId) => {
  const [sets] = await db.query('CALL sp_customer_balance(?)', [Number(customerId)])
  const rows = firstResultSetRows(sets)
  const r = rows[0]
  if (!r) return 0
  return Number(r.balance_due ?? r.BALANCE_DUE ?? 0)
}

/** Ventas a crédito de un cliente con líneas (agrupado en Node). */
exports.listCreditSalesWithLines = async (customerId) => {
  const [rows] = await db.query(
    `SELECT s.id AS sale_id,
            s.sale_date,
            s.total_amount,
            sd.quantity,
            sd.unit_price,
            COALESCE(p.name, CONCAT('Producto #', sd.product_id)) AS product_name
     FROM sale s
     INNER JOIN sale_details sd ON sd.sale_id = s.id
     LEFT JOIN product p ON p.id = sd.product_id
     WHERE s.customer_id = ? AND s.payment_method = 'credit'
     ORDER BY s.sale_date DESC, s.id DESC, sd.id ASC`,
    [Number(customerId)]
  )
  return rows
}

exports.insertAbono = async ({ customerId, amount, note }) => {
  const [sets] = await db.query('CALL sp_customer_abono_insert(?, ?, ?, ?)', [
    Number(customerId),
    Number(amount),
    note ?? null,
    1
  ])
  const rows = firstResultSetRows(sets)
  const row = rows[0] ?? {}
  const aid = row.customer_account_id ?? row.CUSTOMER_ACCOUNT_ID
  return aid != null ? Number(aid) : null
}
