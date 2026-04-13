const db = require('../db/db')

function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

exports.getDefaultEmployeeId = async () => {
  const [rows] = await db.query(
    'SELECT id FROM employee WHERE status = 1 ORDER BY id ASC LIMIT 1'
  )
  const id = rows[0]?.id
  return id != null ? Number(id) : null
}

exports.createSale = async ({
  customerId,
  employeeId,
  products,
  total,
  paymentMethod
}) => {
  const [sets] = await db.query('CALL sp_sale_create(?, ?, ?, ?, ?)', [
    customerId != null && customerId !== '' ? Number(customerId) : null,
    Number(employeeId),
    JSON.stringify(products),
    total != null && total !== '' ? Number(total) : null,
    paymentMethod ?? 'cash'
  ])

  const rows = firstResultSetRows(sets)
  const row = rows[0] ?? {}
  return {
    saleId:
      row.sale_id != null
        ? Number(row.sale_id)
        : row.SALE_ID != null
          ? Number(row.SALE_ID)
          : null,
    totalAmount:
      row.total_amount != null
        ? Number(row.total_amount)
        : row.TOTAL_AMOUNT != null
          ? Number(row.TOTAL_AMOUNT)
          : null
  }
}
