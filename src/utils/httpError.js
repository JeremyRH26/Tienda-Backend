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

function conflict(message) {
  const err = new Error(message)
  err.statusCode = 409
  return err
}

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

module.exports = { badRequest, unauthorized, conflict, notFound }
