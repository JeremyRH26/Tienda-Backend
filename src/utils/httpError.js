function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

module.exports = { badRequest }
