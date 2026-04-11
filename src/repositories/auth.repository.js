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

/**
 * Empleado activo con rol (incluye password_hash solo para validación en servicio).
 */
exports.findActiveEmployeeWithRoleByUsername = async (username) => {
  const [sets] = await db.query('CALL sp_auth_employee_active_by_username(?)', [
    username
  ])
  const rows = firstResultSetRows(sets)
  return rows[0] ?? null
}

/**
 * Códigos de permisos del rol vía role_permission + permission.
 */
exports.findPermissionCodesByRoleId = async (roleId) => {
  const [sets] = await db.query('CALL sp_auth_permission_codes_by_role(?)', [
    roleId
  ])
  const rows = firstResultSetRows(sets)
  return rows.map((r) => r.code)
}
