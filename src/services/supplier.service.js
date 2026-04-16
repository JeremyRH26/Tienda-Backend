const supplierRepository = require('../repositories/supplier.repository')
const { badRequest, notFound } = require('../utils/httpError')

function parseSupplierId(id) {
  const num = Number(id)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }
  return num
}

function trimStr(v, maxLen) {
  const s = v != null ? String(v).trim() : ''
  if (maxLen != null && s.length > maxLen) {
    return s.slice(0, maxLen)
  }
  return s
}

function basicEmailOk(email) {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

exports.list = async () => {
  return await supplierRepository.listAll()
}

exports.getById = async (id) => {
  const num = parseSupplierId(id)
  if (num == null) {
    throw badRequest('Id de proveedor inválido')
  }
  const row = await supplierRepository.findById(num)
  if (!row) {
    throw notFound('Proveedor no encontrado')
  }
  return row
}

exports.create = async (body) => {
  const companyName = trimStr(body.companyName, 200)
  const contactName = trimStr(body.contactName, 200)
  const phone = trimStr(body.phone, 40)
  const email = trimStr(body.email, 200)

  if (!companyName) {
    throw badRequest('El nombre de la empresa es obligatorio')
  }
  if (!basicEmailOk(email)) {
    throw badRequest('El correo electrónico no es válido')
  }

  const newId = await supplierRepository.insert({
    companyName,
    contactName,
    phone,
    email
  })
  if (newId == null) {
    const err = new Error('No se pudo obtener el id del proveedor registrado')
    err.statusCode = 500
    throw err
  }
  return { id: newId }
}

exports.update = async (id, body) => {
  const num = parseSupplierId(id)
  if (num == null) {
    throw badRequest('Id de proveedor inválido')
  }

  const companyName = trimStr(body.companyName, 200)
  const contactName = trimStr(body.contactName, 200)
  const phone = trimStr(body.phone, 40)
  const email = trimStr(body.email, 200)

  if (!companyName) {
    throw badRequest('El nombre de la empresa es obligatorio')
  }
  if (!basicEmailOk(email)) {
    throw badRequest('El correo electrónico no es válido')
  }

  const ok = await supplierRepository.update({
    id: num,
    companyName,
    contactName,
    phone,
    email
  })
  if (!ok) {
    throw notFound('Proveedor no encontrado')
  }

  const row = await supplierRepository.findById(num)
  if (!row) {
    throw notFound('Proveedor no encontrado')
  }
  return row
}

exports.remove = async (id) => {
  const num = parseSupplierId(id)
  if (num == null) {
    throw badRequest('Id de proveedor inválido')
  }
  const ok = await supplierRepository.remove(num)
  if (!ok) {
    throw notFound('Proveedor no encontrado')
  }
  return { deleted: true }
}
