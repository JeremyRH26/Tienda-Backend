const db = require('../db/db')

/**
 * mysql2 devuelve, para CALL, un array de conjuntos de resultados.
 * El primer SELECT del procedimiento suele estar en sets[0] como array de filas.
 */
function firstResultSetRows(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return []
  }
  const first = sets[0]
  return Array.isArray(first) ? first : []
}

exports.findRoleById = async (roleId) => {
  const [sets] = await db.query('CALL sp_role_get_by_id(?)', [roleId])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}

exports.findByUsername = async (username) => {
  const [sets] = await db.query('CALL sp_employee_get_id_by_username(?)', [
    username
  ])
  const rows = firstResultSetRows(sets)
  const row = rows[0]
  if (!row) {
    return null
  }
  const id = row.id != null ? Number(row.id) : null
  if (id == null) {
    return null
  }
  const status = Number(row.status) === 1 ? 1 : 0
  return { id, status }
}

exports.releaseUsernameIfInactive = async (employeeId) => {
  const [sets] = await db.query(
    'CALL sp_employee_release_username_if_inactive(?)',
    [employeeId]
  )
  const rows = firstResultSetRows(sets)
  return Number(rows[0]?.affected ?? 0) > 0
}

exports.insert = async ({ roleId, fullName, username, passwordHash, phone }) => {
  const [sets] = await db.query(
    'CALL sp_employee_insert(?, ?, ?, ?, ?)',
    [roleId, fullName, username, passwordHash, phone ?? null]
  )
  const rows = firstResultSetRows(sets)
  const id = rows[0]?.id
  return id != null ? Number(id) : null
}

exports.findAll = async () => {
  const [sets] = await db.query('CALL sp_employee_list_all()')
  return firstResultSetRows(sets)
}

exports.findById = async (id) => {
  const [sets] = await db.query('CALL sp_employee_get_by_id(?)', [id])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}

/** Cuenta colaboradores activos (status = 1) con el rol indicado. */
exports.countActiveByRoleId = async (roleId) => {
  const [sets] = await db.query('CALL sp_employee_count_by_role_id(?)', [
    roleId
  ])
  const rows = firstResultSetRows(sets)
  return Number(rows[0]?.cnt ?? 0)
}

exports.updateById = async ({
  id,
  roleId,
  fullName,
  username,
  phone,
  status,
  passwordHash
}) => {
  const [sets] = await db.query('CALL sp_employee_update(?, ?, ?, ?, ?, ?, ?)', [
    id,
    roleId,
    fullName,
    username,
    phone ?? null,
    status,
    passwordHash ?? null
  ])
  const rows = firstResultSetRows(sets)
  const affected = Number(rows[0]?.affected ?? 0)
  return affected > 0
}

/** @returns {{ ok: boolean, outcome: 'deleted' | 'deactivated' | null }} */
exports.deleteById = async (id) => {
  const [sets] = await db.query('CALL sp_employee_delete(?)', [id])
  const rows = firstResultSetRows(sets)
  const row = rows[0]
  if (!row) {
    return { ok: false, outcome: null }
  }
  const affected = Number(row.affected ?? 0)
  const raw = row.outcome ?? row.Outcome
  const outcome =
    raw === 'deleted' || raw === 'deactivated' ? raw : null
  return {
    ok: affected > 0,
    outcome: outcome ?? null
  }
}
