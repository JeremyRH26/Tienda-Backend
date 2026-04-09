const rolesRepository = require('../repositories/roles.repository')
const { badRequest, conflict, notFound } = require('../utils/httpError')

const MAX_ROLE_NAME_LENGTH = 128

function normalizeRoleName(name) {
  return typeof name === 'string' ? name.trim() : ''
}

function parseRoleId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) {
    return null
  }
  return id
}

function normalizePermissionIds(raw) {
  if (!Array.isArray(raw)) {
    return null
  }
  const nums = raw.map((item) => Number(item))
  if (nums.some((n) => !Number.isInteger(n) || n < 1)) {
    return null
  }
  return [...new Set(nums)]
}

exports.createRole = async (data) => {
  const name = normalizeRoleName(data?.name)
  if (!name) {
    throw badRequest('El nombre del rol es obligatorio')
  }
  if (name.length > MAX_ROLE_NAME_LENGTH) {
    throw badRequest(`El nombre del rol no puede superar ${MAX_ROLE_NAME_LENGTH} caracteres`)
  }

  const duplicate = await rolesRepository.findRoleByName(name)
  if (duplicate) {
    throw conflict('Ya existe un rol con ese nombre')
  }

  const id = await rolesRepository.insertRole(name)
  return { id, name }
}

exports.listRoles = async () => {
  const rows = await rolesRepository.findAllRoles()
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

exports.listPermissionsByRole = async (roleIdParam) => {
  const roleId = parseRoleId(roleIdParam)
  if (roleId == null) {
    throw badRequest('El id del rol no es válido')
  }

  const role = await rolesRepository.findRoleById(roleId)
  if (!role) {
    throw notFound('Rol no encontrado')
  }

  const rows = await rolesRepository.findPermissionsByRoleId(roleId)
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    description: p.description
  }))
}

exports.updateRole = async (roleIdParam, data) => {
  const roleId = parseRoleId(roleIdParam)
  if (roleId == null) {
    throw badRequest('El id del rol no es válido')
  }

  const name = normalizeRoleName(data?.name)
  if (!name) {
    throw badRequest('El nombre del rol es obligatorio')
  }
  if (name.length > MAX_ROLE_NAME_LENGTH) {
    throw badRequest(`El nombre del rol no puede superar ${MAX_ROLE_NAME_LENGTH} caracteres`)
  }

  const role = await rolesRepository.findRoleById(roleId)
  if (!role) {
    throw notFound('Rol no encontrado')
  }

  const duplicate = await rolesRepository.findRoleByName(name)
  if (duplicate && Number(duplicate.id) !== roleId) {
    throw conflict('Ya existe un rol con ese nombre')
  }

  const ok = await rolesRepository.updateRoleName(roleId, name)
  if (!ok) {
    throw notFound('Rol no encontrado')
  }

  return { id: roleId, name }
}

exports.assignPermissionsToRole = async (roleIdParam, data) => {
  const roleId = parseRoleId(roleIdParam)
  if (roleId == null) {
    throw badRequest('El id del rol no es válido')
  }

  const permissionIds = normalizePermissionIds(data?.permissionIds)
  if (permissionIds === null) {
    throw badRequest('permissionIds debe ser un array de ids numéricos válidos')
  }

  const role = await rolesRepository.findRoleById(roleId)
  if (!role) {
    throw notFound('Rol no encontrado')
  }

  if (permissionIds.length > 0) {
    const count = await rolesRepository.countPermissionsByIds(permissionIds)
    if (count !== permissionIds.length) {
      throw badRequest('Uno o más permisos no existen')
    }
  }

  await rolesRepository.replaceRolePermissions(roleId, permissionIds)

  const rows = await rolesRepository.findPermissionsByRoleId(roleId)
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    description: p.description
  }))
}
