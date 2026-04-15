const db = require('../db/db')

function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

/** Fila tipo OkPacket/ResultSetHeader de mysql2 (no es un registro SELECT). */
function isServerResultMetaRow(row) {
  if (!row || typeof row !== 'object') return false
  if ('sale_id' in row || 'SALE_ID' in row) return false
  return typeof row.affectedRows === 'number'
}

/**
 * Tras CALL, mysql2 puede devolver:
 *   [ [ { sale_id, ... } ] ]  o  [ { sale_id, ... } ]  o  [ ResultSetHeader, [ rows ] ]
 * Buscamos el primer array de filas de datos.
 */
function extractProcedureSelectRows(raw) {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return []
  }
  const head = raw[0]
  if (Array.isArray(head)) {
    if (head.length > 0 && !isServerResultMetaRow(head[0])) {
      return head
    }
  } else if (head && typeof head === 'object' && !isServerResultMetaRow(head)) {
    return raw
  }
  for (let i = 0; i < raw.length; i += 1) {
    const part = raw[i]
    if (!Array.isArray(part) || part.length === 0) continue
    const r0 = part[0]
    if (r0 && typeof r0 === 'object' && !isServerResultMetaRow(r0)) {
      return part
    }
  }
  return []
}

function procedureResultSets(sets) {
  if (!Array.isArray(sets)) {
    return []
  }
  return sets.map((s) => (Array.isArray(s) ? s : []))
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
  const [raw] = await db.query('CALL sp_sale_create(?, ?, ?, ?, ?)', [
    customerId != null && customerId !== '' ? Number(customerId) : null,
    Number(employeeId),
    JSON.stringify(products),
    total != null && total !== '' ? Number(total) : null,
    paymentMethod ?? 'cash'
  ])

  const rows = extractProcedureSelectRows(raw)
  const row = rows[0] ?? {}
  const sid = row.sale_id ?? row.SALE_ID
  const tam = row.total_amount ?? row.TOTAL_AMOUNT
  return {
    saleId: sid != null && sid !== '' ? Number(sid) : null,
    totalAmount: tam != null && tam !== '' ? Number(tam) : null
  }
}

exports.listSalesByDateRange = async (dateStart, dateEnd) => {
  const [sets] = await db.query('CALL sp_sale_list_by_date_range(?, ?)', [
    dateStart,
    dateEnd
  ])
  return firstResultSetRows(sets)
}

/** Una fila por línea de detalle; agrupar en el servicio por id de venta. */
exports.listSalesWithLinesForRange = async (dateStart, dateEnd) => {
  const [rows] = await db.query(
    `SELECT
       s.id,
       s.customer_id,
       c.full_name AS customer_name,
       s.employee_id,
       e.full_name AS employee_name,
       s.sale_date,
       s.total_amount,
       s.payment_method,
       sd.quantity,
       sd.unit_price,
       COALESCE(p.name, CONCAT('Producto #', sd.product_id)) AS product_name
     FROM sale s
     INNER JOIN employee e ON e.id = s.employee_id
     LEFT JOIN customer c ON c.id = s.customer_id
     INNER JOIN sale_details sd ON sd.sale_id = s.id
     LEFT JOIN product p ON p.id = sd.product_id
     WHERE DATE(s.sale_date) BETWEEN ? AND ?
     ORDER BY s.sale_date DESC, s.id DESC, sd.id ASC`,
    [dateStart, dateEnd]
  )
  return Array.isArray(rows) ? rows : []
}

exports.getSaleWithLines = async (saleId) => {
  const [sets] = await db.query('CALL sp_sale_get_full(?)', [Number(saleId)])
  const parts = procedureResultSets(sets)
  const headerRows = parts[0] ?? []
  const lineRows = parts[1] ?? []
  return {
    header: headerRows[0] ?? null,
    lines: Array.isArray(lineRows) ? lineRows : []
  }
}

exports.getDayCashTotals = async (dayYmd) => {
  const [sets] = await db.query('CALL sp_pos_day_cash_totals(?)', [dayYmd])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}
