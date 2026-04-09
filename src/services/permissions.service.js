const rolesRepository = require('../repositories/roles.repository')

exports.listAllPermissions = async () => {
  const rows = await rolesRepository.findAllPermissions()
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    description: p.description
  }))
}
