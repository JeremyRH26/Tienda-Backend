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

exports.insertRole = async (name) => {
  const [sets] = await db.query('CALL sp_role_insert(?)', [name])
  const rows = firstResultSetRows(sets)
  const id = rows[0]?.id
  return id != null ? Number(id) : null
}

exports.findRoleById = async (roleId) => {
  const [sets] = await db.query('CALL sp_role_get_by_id(?)', [roleId])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}

exports.findRoleByName = async (name) => {
  const [sets] = await db.query('CALL sp_role_get_by_name(?)', [name])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}

exports.findAllRoles = async () => {
  const [sets] = await db.query('CALL sp_role_list_all()')
  return firstResultSetRows(sets)
}

exports.findAllPermissions = async () => {
  const [sets] = await db.query('CALL sp_permission_list_all()')
  return firstResultSetRows(sets)
}

exports.findPermissionsByRoleId = async (roleId) => {
  const [sets] = await db.query('CALL sp_role_permission_list_by_role(?)', [roleId])
  return firstResultSetRows(sets)
}

exports.countPermissionsByIds = async (permissionIds) => {
  if (permissionIds.length === 0) {
    return 0
  }
  const placeholders = permissionIds.map(() => '?').join(',')
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM permission WHERE id IN (${placeholders})`,
    permissionIds
  )
  return Number(rows[0]?.cnt ?? 0)
}

exports.replaceRolePermissions = async (roleId, permissionIds) => {
  await db.query('CALL sp_role_permission_replace(?, ?)', [
    roleId,
    JSON.stringify(permissionIds)
  ])
}

exports.updateRoleName = async (roleId, name) => {
  const [result] = await db.query('UPDATE role SET name = ? WHERE id = ?', [
    name,
    roleId
  ])
  return result.affectedRows > 0
}
