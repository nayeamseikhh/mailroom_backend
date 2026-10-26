import HttpError from './httpError.js'

// Wraps async route handlers so any error goes to your error handler.
// Also turns two common MongoDB errors into clean messages.
export default function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      if (error?.code === 11000) {
        return next(new HttpError(409, 'A contact with this email already exists.'))
      }
      if (error?.name === 'CastError') {
        return next(new HttpError(400, 'Invalid ID.'))
      }
      next(error)
    })
  }
}
