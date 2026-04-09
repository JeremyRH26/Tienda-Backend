const db = require('../db/db')

exports.findRoleById = async (roleId) => {
  const [rows] = await db.query('SELECT id, name FROM role WHERE id = ? LIMIT 1', [
    roleId
  ])
  return rows[0] ?? null
}

exports.findByUsername = async (username) => {
  const [rows] = await db.query('SELECT id FROM employee WHERE username = ? LIMIT 1', [
    username
  ])
  return rows[0] ?? null
}

exports.insert = async ({ roleId, fullName, username, passwordHash, phone }) => {
  const [result] = await db.query(
    `INSERT INTO employee (role_id, full_name, username, password_hash, phone, status)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [roleId, fullName, username, passwordHash, phone ?? null]
  )

  return result.insertId
}
