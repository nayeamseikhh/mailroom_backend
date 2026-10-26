export const MIN_PASSWORD_LENGTH = 12
const MAX_BCRYPT_PASSWORD_BYTES = 72

export function getPasswordPolicyError(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_PASSWORD_BYTES) {
    return 'Password must be 72 bytes or fewer.'
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'Password must contain a letter.'
  }
  if (!/\d/.test(password)) {
    return 'Password must contain a number.'
  }
  return null
}
