const db = require('../db/db')

function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

function normalizeSupplierRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    companyName: row.companyName != null ? String(row.companyName) : String(row.company_name ?? ''),
    contactName: row.contactName != null ? String(row.contactName) : String(row.contact_name ?? ''),
    phone: row.phone != null ? String(row.phone) : '',
    email: row.email != null ? String(row.email) : ''
  }
}

exports.listAll = async () => {
  const [sets] = await db.query('CALL sp_supplier_list_all()')
  const rows = firstResultSetRows(sets)
  return rows.map((r) => normalizeSupplierRow(r)).filter(Boolean)
}

exports.findById = async (id) => {
  const [sets] = await db.query('CALL sp_supplier_get_by_id(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  return normalizeSupplierRow(rows[0])
}

exports.insert = async ({ companyName, contactName, phone, email }) => {
  const [sets] = await db.query('CALL sp_supplier_insert(?, ?, ?, ?)', [
    companyName,
    contactName,
    phone,
    email
  ])
  const rows = firstResultSetRows(sets)
  const rawId = rows[0]?.id ?? rows[0]?.ID
  return rawId != null ? Number(rawId) : null
}

exports.update = async ({ id, companyName, contactName, phone, email }) => {
  const [sets] = await db.query('CALL sp_supplier_update(?, ?, ?, ?, ?)', [
    Number(id),
    companyName,
    contactName,
    phone,
    email
  ])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}

exports.remove = async (id) => {
  const [sets] = await db.query('CALL sp_supplier_delete(?)', [Number(id)])
  const rows = firstResultSetRows(sets)
  const n = Number(rows[0]?.affected ?? rows[0]?.AFFECTED ?? 0)
  return n > 0
}
