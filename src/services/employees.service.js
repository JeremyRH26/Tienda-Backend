const bcrypt = require('bcrypt')
const employeesRepository = require('../repositories/employees.repository')
const { badRequest, conflict } = require('../utils/httpError')

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10
const MIN_PASSWORD_LENGTH = 8

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
    throw conflict('Ya existe un empleado con ese nombre de usuario')
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
