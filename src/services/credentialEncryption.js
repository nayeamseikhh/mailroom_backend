import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const IV_LENGTH = 12
const TAG_LENGTH = 16

export function getCredentialEncryptionKey(value = process.env.SMTP_CREDENTIALS_KEY) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error('SMTP_CREDENTIALS_KEY must be a base64-encoded 32-byte key')
  }
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('SMTP_CREDENTIALS_KEY must be a base64-encoded 32-byte key')
  }
  return key
}

export function encryptCredentials(value, key = getCredentialEncryptionKey()) {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptCredentials(envelope, key = getCredentialEncryptionKey()) {
  if (typeof envelope !== 'string') throw new Error('Encrypted SMTP credentials are missing')
  const [version, ivText, tagText, ciphertextText, extra] = envelope.split('.')
  if (version !== VERSION || !ivText || !tagText || !ciphertextText || extra) {
    throw new Error('Encrypted SMTP credentials have an unsupported format')
  }

  const iv = Buffer.from(ivText, 'base64url')
  const tag = Buffer.from(tagText, 'base64url')
  const ciphertext = Buffer.from(ciphertextText, 'base64url')
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || !ciphertext.length) {
    throw new Error('Encrypted SMTP credentials are malformed')
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(plaintext)
}
