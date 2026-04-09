const db = require('../db/db')

/**
 * Empleado activo con rol (incluye password_hash solo para validación en servicio).
 */
exports.findActiveEmployeeWithRoleByUsername = async (username) => {
  const [rows] = await db.query(
    `SELECT e.id,
            e.full_name AS fullName,
            e.username,
            e.password_hash AS passwordHash,
            e.phone,
            e.status,
            e.role_id AS roleId,
            r.name AS roleName
     FROM employee e
     INNER JOIN role r ON r.id = e.role_id
     WHERE e.username = ? AND e.status = 1
     LIMIT 1`,
    [username]
  )

  return rows[0] ?? null
}

/**
 * Códigos de permisos del rol vía role_permission + permission.
 */
exports.findPermissionCodesByRoleId = async (roleId) => {
  const [rows] = await db.query(
    `SELECT p.code AS code
     FROM role_permission rp
     INNER JOIN permission p ON p.id = rp.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.code`,
    [roleId]
  )

  return rows.map((r) => r.code)
}
