const db = require('../db/db')

exports.sumSalesBetween = async (startInclusive, endExclusive) => {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS total
     FROM sale
     WHERE sale_date >= ? AND sale_date < ?`,
    [startInclusive, endExclusive]
  )
  return Number(rows[0]?.total ?? rows[0]?.TOTAL ?? 0)
}

exports.salesByDayBetween = async (startInclusive, endExclusive) => {
  const [rows] = await db.query(
    `SELECT DATE(s.sale_date) AS d, COALESCE(SUM(s.total_amount), 0) AS total
     FROM sale s
     WHERE s.sale_date >= ? AND s.sale_date < ?
     GROUP BY DATE(s.sale_date)
     ORDER BY d ASC`,
    [startInclusive, endExclusive]
  )
  return Array.isArray(rows) ? rows : []
}

exports.sumCreditSalesTotal = async () => {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(total_amount), 0) AS total
     FROM sale
     WHERE payment_method = 'credit'`
  )
  return Number(rows[0]?.total ?? rows[0]?.TOTAL ?? 0)
}

exports.countCustomersWithCreditSales = async () => {
  const [rows] = await db.query(
    `SELECT COUNT(DISTINCT customer_id) AS n
     FROM sale
     WHERE payment_method = 'credit' AND customer_id IS NOT NULL`
  )
  return Number(rows[0]?.n ?? rows[0]?.N ?? 0)
}

exports.listLowStockProducts = async (limit = 20) => {
  const [rows] = await db.query(
    `SELECT p.id,
            p.name,
            pc.name AS category_name,
            ps.quantity,
            ps.min_stock
     FROM product p
     INNER JOIN product_stock ps ON ps.product_id = p.id
     INNER JOIN product_category pc ON pc.id = p.category_id
     WHERE p.status = 1 AND ps.quantity < ps.min_stock
     ORDER BY ps.quantity ASC, p.name ASC
     LIMIT ?`,
    [Number(limit) || 20]
  )
  return Array.isArray(rows) ? rows : []
}

exports.listRecentSales = async (limit = 8) => {
  const [rows] = await db.query(
    `SELECT s.id,
            s.total_amount,
            s.sale_date,
            s.payment_method,
            c.full_name AS customer_name
     FROM sale s
     LEFT JOIN customer c ON c.id = s.customer_id
     ORDER BY s.sale_date DESC, s.id DESC
     LIMIT ?`,
    [Number(limit) || 8]
  )
  return Array.isArray(rows) ? rows : []
}

exports.listRecentExpenses = async (limit = 6) => {
  const [rows] = await db.query(
    `SELECT e.id,
            e.amount,
            e.expense_date,
            e.note,
            ec.name AS category_name
     FROM expense e
     INNER JOIN expense_category ec ON ec.id = e.category_id
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT ?`,
    [Number(limit) || 6]
  )
  return Array.isArray(rows) ? rows : []
}
