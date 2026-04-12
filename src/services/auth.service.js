const bcrypt = require('bcryptjs')
const authRepository = require('../repositories/auth.repository')
const { badRequest, unauthorized } = require('../utils/httpError')

exports.login = async ({ username, password }) => {
  const u = typeof username === 'string' ? username.trim() : ''
  if (!u) {
    throw badRequest('El usuario es obligatorio')
  }
  if (!password || typeof password !== 'string') {
    throw badRequest('La contraseña es obligatoria')
  }

  const row = await authRepository.findActiveEmployeeWithRoleByUsername(u)
  if (!row) {
    throw unauthorized('Usuario o contraseña incorrectos')
  }

  const ok = await bcrypt.compare(password, row.passwordHash)
  if (!ok) {
    throw unauthorized('Usuario o contraseña incorrectos')
  }

  const permissions = await authRepository.findPermissionCodesByRoleId(row.roleId)

  return {
    employee: {
      id: row.id,
      fullName: row.fullName,
      username: row.username,
      phone: row.phone,
      status: row.status
    },
    role: {
      id: row.roleId,
      name: row.roleName
    },
    permissions
  }
}
