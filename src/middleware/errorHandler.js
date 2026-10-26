export default function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error)
  }

  if (error.code === 11000) {
    return res.status(409).json({
      message: 'A contact with this email or a list with this name already exists.',
    })
  }

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({
      message: error.message,
    })
  }

  if (error.name === 'MulterError') {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'The uploaded file exceeds the allowed size.'
      : error.code === 'LIMIT_FILE_COUNT'
        ? 'Too many files were uploaded.'
        : 'The uploaded files could not be processed.'
    return res.status(400).json({ message })
  }

  if (error.message === 'Only .csv, .xls, and .xlsx files can be imported.') {
    return res.status(400).json({ message: error.message })
  }

  const statusCode = error.statusCode || 500
  if (statusCode >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, error.stack || error)
  }
  return res.status(statusCode).json({
    message: statusCode >= 500 ? 'Internal server error' : error.message,
  })
}
