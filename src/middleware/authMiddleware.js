import User from '../models/User.js'
import HttpError from '../utils/httpError.js'
import { verifyToken } from '../utils/generateToken.js'
import { getTenantModels } from '../models/tenantModels.js'

const extractToken = (req) => {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) return header.slice(7).trim()
  if (req.cookies?.token) return req.cookies.token
  return null
}

// Requires a valid token. Attaches the user document to req.user.
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req)
    if (!token) throw new HttpError(401, 'Authentication required.')

    let payload
    try {
      payload = verifyToken(token)
    } catch {
      throw new HttpError(401, 'Your session has expired. Please log in again.')
    }

    const user = await User.findById(payload.sub).select('+databaseName +tokenVersion')
    if (!user) throw new HttpError(401, 'Account no longer exists.')
    if (!user.isActive) throw new HttpError(403, 'This account has been deactivated.')
    if ((payload.ver ?? 0) !== user.tokenVersion) {
      throw new HttpError(401, 'Your session is no longer valid. Please log in again.')
    }

    req.user = user
    req.models = await getTenantModels(user)
    next()
  } catch (error) {
    next(error)
  }
}

export default requireAuth
