const db = require('../db/db')

exports.createSale = async ({ customerId, products, total }) => {
  const [rows] = await db.query('CALL CreateSale(?, ?, ?)', [
    customerId,
    JSON.stringify(products),
    total
  ])

  return rows[0]
}
