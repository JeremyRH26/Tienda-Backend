function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function unauthorized(message) {
  const err = new Error(message)
  err.statusCode = 401
  return err
}

module.exports = { badRequest, unauthorized }
