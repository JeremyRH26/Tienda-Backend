const db = require('../db/db')

function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

function normalizeProductRow(row) {
  if (!row) return null
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  const stockUpdated =
    row.stock_updated_at instanceof Date
      ? row.stock_updated_at.toISOString()
      : row.stock_updated_at
  return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    categoryName: row.category_name != null ? String(row.category_name) : '',
    supplierId: row.supplier_id != null ? Number(row.supplier_id) : null,
    name: row.name != null ? String(row.name) : '',
    costPrice: Number(row.cost_price),
    salePrice: Number(row.sale_price),
    imageUrl: row.image_url != null ? String(row.image_url) : null,
    status: Number(row.status),
    createdAt: createdAt != null ? String(createdAt) : null,
    updatedAt: updatedAt != null ? String(updatedAt) : null,
    quantity: Number(row.quantity ?? 0),
    minStock: Number(row.min_stock ?? 0),
    stockUpdatedAt: stockUpdated != null ? String(stockUpdated) : null
  }
}

exports.listCategories = async () => {
  const [rows] = await db.query(
    'SELECT id, name FROM product_category ORDER BY name ASC'
  )
  return Array.isArray(rows) ? rows : []
}

/** Solo lectura para selects de producto (tabla supplier). */
exports.listSuppliers = async () => {
  const [rows] = await db.query(
    `SELECT id, company_name, contact_name, phone, email
     FROM supplier
     ORDER BY company_name ASC, id ASC`
  )
  return Array.isArray(rows) ? rows : []
}

exports.insertCategoryByName = async (name) => {
  const [sets] = await db.query('CALL sp_product_category_get_or_create(?)', [name])
  const rows = firstResultSetRows(sets)
  const raw = rows[0]?.category_id ?? rows[0]?.CATEGORY_ID
  return raw != null ? Number(raw) : null
}

exports.listProducts = async (includeInactive = false) => {
  const [sets] = await db.query('CALL sp_product_list(?)', [includeInactive ? 1 : 0])
  const rows = firstResultSetRows(sets)
  return rows.map((r) => normalizeProductRow(r)).filter(Boolean)
}

exports.findById = async (id) => {
  const [sets] = await db.query('CALL sp_product_get_by_id(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  return normalizeProductRow(rows[0])
}

exports.insert = async ({
  categoryId,
  supplierId,
  name,
  costPrice,
  salePrice,
  imageUrl,
  status,
  initialQuantity,
  minStock
}) => {
  const [sets] = await db.query(
    'CALL sp_product_insert(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      Number(categoryId),
      supplierId != null ? Number(supplierId) : null,
      name,
      costPrice,
      salePrice,
      imageUrl ?? null,
      status != null ? Number(status) : 1,
      initialQuantity != null ? Number(initialQuantity) : 0,
      minStock != null ? Number(minStock) : 0
    ]
  )
  const rows = firstResultSetRows(sets)
  const raw = rows[0]?.product_id ?? rows[0]?.PRODUCT_ID
  return raw != null ? Number(raw) : null
}

exports.update = async ({
  id,
  categoryId,
  supplierId,
  name,
  costPrice,
  salePrice,
  imageUrl,
  status
}) => {
  const [sets] = await db.query(
    'CALL sp_product_update(?, ?, ?, ?, ?, ?, ?, ?)',
    [
      Number(id),
      Number(categoryId),
      supplierId != null ? Number(supplierId) : null,
      name,
      costPrice,
      salePrice,
      imageUrl ?? null,
      status != null ? Number(status) : 1
    ]
  )
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}

exports.softDelete = async (id) => {
  const [sets] = await db.query('CALL sp_product_soft_delete(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}

exports.adjustStock = async (productId, delta) => {
  const [sets] = await db.query('CALL sp_stock_adjust(?, ?)', [Number(productId), Number(delta)])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}

exports.setMinStock = async (productId, minStock) => {
  const [sets] = await db.query('CALL sp_stock_set_min(?, ?)', [
    Number(productId),
    Number(minStock)
  ])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}

exports.setImageUrl = async (productId, imageUrl) => {
  const trimmed =
    imageUrl != null && String(imageUrl).trim() !== '' ? String(imageUrl).trim() : null
  const [result] = await db.query(
    'UPDATE product SET image_url = ?, updated_at = NOW() WHERE id = ?',
    [trimmed, Number(productId)]
  )
  return result.affectedRows > 0
}

exports.updateCategoryById = async (id, name) => {
  const [result] = await db.query(
    'UPDATE product_category SET name = ? WHERE id = ?',
    [name, Number(id)]
  )
  return result.affectedRows > 0
}

exports.countProductsUsingCategory = async (categoryId) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS n FROM product WHERE category_id = ?',
    [Number(categoryId)]
  )
  return Number(rows[0]?.n ?? rows[0]?.N ?? 0)
}

exports.deleteCategoryById = async (id) => {
  const [result] = await db.query('DELETE FROM product_category WHERE id = ?', [
    Number(id)
  ])
  return result.affectedRows > 0
}

exports.getFirstActiveEmployeeId = async () => {
  const [rows] = await db.query(
    'SELECT id FROM employee WHERE status = 1 ORDER BY id ASC LIMIT 1'
  )
  const id = rows[0]?.id
  return id != null ? Number(id) : null
}
