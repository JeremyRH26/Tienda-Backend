function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  const status = Number(err.statusCode) || 500
  const isClientError = status >= 400 && status < 500

  res.status(isClientError ? status : 500).json({
    message: isClientError ? err.message : 'Error interno del servidor',
    ...(process.env.NODE_ENV !== 'production' && !isClientError && { detail: err.message })
  })
}

module.exports = errorMiddleware
