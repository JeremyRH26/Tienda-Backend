const bcrypt = require('bcryptjs')
const employeesRepository = require('../repositories/employees.repository')
const { badRequest, conflict, notFound } = require('../utils/httpError')

function toIso(value) {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return value
}

function normalizeEmployeeRow(row) {
  if (!row) {
    return null
  }
  const status = Number(row.status) === 1 ? 1 : 0
  return {
    id: Number(row.id),
    roleId: Number(row.roleId ?? row.role_id),
    fullName: row.fullName ?? row.full_name,
    username: row.username,
    phone: row.phone ?? null,
    status,
    createdAt: toIso(row.createdAt ?? row.created_at),
    updatedAt: toIso(row.updatedAt ?? row.updated_at),
    roleName: row.roleName ?? row.role_name
  }
}

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10
const MIN_PASSWORD_LENGTH = 8

exports.list = async () => {
  const rows = await employeesRepository.findAll()
  return rows.map((r) => normalizeEmployeeRow(r)).filter(Boolean)
}

exports.update = async (id, data) => {
  const employeeId = Number(id)
  if (!Number.isInteger(employeeId) || employeeId < 1) {
    throw badRequest('El id del empleado no es válido')
  }

  const fullName =
    typeof data.fullName === 'string' ? data.fullName.trim() : ''
  const username =
    typeof data.username === 'string' ? data.username.trim() : ''
  const phone =
    data.phone == null || data.phone === ''
      ? null
      : String(data.phone).trim() || null
  const roleId = Number(data.roleId)
  const password =
    typeof data.password === 'string' && data.password.length > 0
      ? data.password
      : ''

  const rawStatus = data.status
  if (
    rawStatus !== 0 &&
    rawStatus !== 1 &&
    rawStatus !== '0' &&
    rawStatus !== '1'
  ) {
    throw badRequest('El estado debe ser 0 (inactivo) o 1 (activo)')
  }
  const statusNorm = rawStatus === 1 || rawStatus === '1' ? 1 : 0

  if (!fullName) {
    throw badRequest('El nombre completo es obligatorio')
  }

  if (!username) {
    throw badRequest('El usuario es obligatorio')
  }

  if (username.length > 100) {
    throw badRequest('El usuario no puede superar 100 caracteres')
  }

  if (!Number.isInteger(roleId) || roleId < 1) {
    throw badRequest('El rol es obligatorio y debe ser un id válido')
  }

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
    )
  }

  const role = await employeesRepository.findRoleById(roleId)
  if (!role) {
    throw badRequest('El rol indicado no existe')
  }

  const taken = await employeesRepository.findByUsername(username)
  if (taken && Number(taken.id) !== employeeId) {
    if (taken.status === 1) {
      throw conflict('Ya existe un empleado con ese nombre de usuario')
    }
    const released = await employeesRepository.releaseUsernameIfInactive(
      taken.id
    )
    if (!released) {
      throw conflict('Ya existe un empleado con ese nombre de usuario')
    }
  }

  let passwordHash = null
  if (password) {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  }

  const ok = await employeesRepository.updateById({
    id: employeeId,
    roleId,
    fullName,
    username,
    phone,
    status: statusNorm,
    passwordHash
  })

  if (!ok) {
    throw notFound('Empleado no encontrado')
  }

  const row = await employeesRepository.findById(employeeId)
  if (!row) {
    throw notFound('Empleado no encontrado')
  }

  const normalized = normalizeEmployeeRow(row)
  return {
    id: normalized.id,
    fullName: normalized.fullName,
    username: normalized.username,
    phone: normalized.phone,
    status: normalized.status,
    role: {
      id: normalized.roleId,
      name: normalized.roleName
    }
  }
}

exports.remove = async (id) => {
  const employeeId = Number(id)
  if (!Number.isInteger(employeeId) || employeeId < 1) {
    throw badRequest('El id del empleado no es válido')
  }

  const { ok, outcome } = await employeesRepository.deleteById(employeeId)

  if (!ok || outcome == null) {
    throw notFound('Empleado no encontrado')
  }

  return { outcome }
}

exports.register = async (data) => {
  const fullName =
    typeof data.fullName === 'string' ? data.fullName.trim() : ''
  const username =
    typeof data.username === 'string' ? data.username.trim() : ''
  const password = typeof data.password === 'string' ? data.password : ''
  const phone =
    data.phone == null || data.phone === ''
      ? null
      : String(data.phone).trim() || null

  const roleId = Number(data.roleId)
  if (!Number.isInteger(roleId) || roleId < 1) {
    throw badRequest('El rol es obligatorio y debe ser un id válido')
  }

  if (!fullName) {
    throw badRequest('El nombre completo es obligatorio')
  }

  if (!username) {
    throw badRequest('El usuario es obligatorio')
  }

  if (username.length > 100) {
    throw badRequest('El usuario no puede superar 100 caracteres')
  }

  if (!password) {
    throw badRequest('La contraseña es obligatoria')
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
    )
  }

  const role = await employeesRepository.findRoleById(roleId)
  if (!role) {
    throw badRequest('El rol indicado no existe')
  }

  const taken = await employeesRepository.findByUsername(username)
  if (taken) {
    if (taken.status === 1) {
      throw conflict('Ya existe un empleado con ese nombre de usuario')
    }
    const released = await employeesRepository.releaseUsernameIfInactive(
      taken.id
    )
    if (!released) {
      throw conflict('Ya existe un empleado con ese nombre de usuario')
    }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const id = await employeesRepository.insert({
    roleId,
    fullName,
    username,
    passwordHash,
    phone
  })

  return {
    id,
    fullName,
    username,
    phone,
    status: 1,
    role: {
      id: role.id,
      name: role.name
    }
  }
}
