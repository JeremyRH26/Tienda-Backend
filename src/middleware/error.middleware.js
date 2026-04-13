function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  const status = Number(err.statusCode)
  const code = Number.isFinite(status) && status >= 400 && status <= 599 ? status : 500
  const isClientError = code >= 400 && code < 500

  res.status(code).json({
    message: isClientError || code >= 502 ? err.message : 'Error interno del servidor',
    ...(process.env.NODE_ENV !== 'production' && !isClientError && code < 502 && { detail: err.message })
  })
}

module.exports = errorMiddleware
