import jwt from 'jsonwebtoken'

export const validateJwtSecret = () => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.includes('change-me') || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Set a random JWT_SECRET of at least 32 bytes in server/.env before issuing tokens')
  }
  return secret
}

// Signs a JWT carrying the user id.
export function generateToken(userId, expiresIn = '7d', tokenVersion = 0) {
  return jwt.sign(
    { sub: String(userId), ver: tokenVersion },
    validateJwtSecret(),
    { expiresIn, algorithm: 'HS256' },
  )
}

// Verifies a JWT and returns its payload. Throws when the token is invalid or expired.
export function verifyToken(token) {
  return jwt.verify(token, validateJwtSecret(), { algorithms: ['HS256'] })
}
