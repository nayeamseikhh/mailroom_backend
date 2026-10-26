import HttpError from '../utils/httpError.js'
import {
  decryptCredentials,
  encryptCredentials,
  getCredentialEncryptionKey,
} from './credentialEncryption.js'

const IMAP_FIELDS = new Set(['host', 'port', 'secure', 'username', 'password', 'mailbox'])
const HOST_PATTERN = /^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/

export function validateImapCredentials(input, { requirePassword = true } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'IMAP settings must be an object.')
  }
  for (const field of Object.keys(input)) {
    if (!IMAP_FIELDS.has(field)) throw new HttpError(400, `Unknown IMAP setting: ${field}.`)
  }

  const host = typeof input.host === 'string' ? input.host.trim().toLowerCase() : ''
  const port = Number(input.port)
  const secure = input.secure
  const username = typeof input.username === 'string' ? input.username.trim() : ''
  const password = typeof input.password === 'string' ? input.password : ''
  const mailbox = typeof input.mailbox === 'string' && input.mailbox.trim()
    ? input.mailbox.trim()
    : 'INBOX'
  const allowedHosts = (process.env.IMAP_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  if (!HOST_PATTERN.test(host)) throw new HttpError(400, 'Enter a valid IMAP host.')
  if (!allowedHosts.includes(host)) {
    throw new HttpError(400, 'This IMAP host is not approved by the server administrator.')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(400, 'IMAP port must be a valid TCP port.')
  }
  if (typeof secure !== 'boolean') {
    throw new HttpError(400, 'Choose whether the IMAP connection uses implicit TLS.')
  }
  if (!username || username.length > 254) {
    throw new HttpError(400, 'Enter a valid IMAP username.')
  }
  if ((requirePassword && !password) || password.length > 1024) {
    throw new HttpError(400, 'Enter a valid IMAP password or app password.')
  }
  if (mailbox.length > 255 || /[\u0000-\u001f\u007f]/.test(mailbox)) {
    throw new HttpError(400, 'Enter a valid IMAP mailbox name.')
  }

  return { host, port, secure, username, password, mailbox }
}

export function encryptImapCredentials(credentials) {
  return encryptCredentials(credentials)
}

export function decryptImapCredentials(envelope) {
  const currentKey = getCredentialEncryptionKey()
  try {
    return validateImapCredentials(decryptCredentials(envelope, currentKey))
  } catch (currentError) {
    if (currentError instanceof HttpError) throw currentError
    const previousKeyValue = process.env.SMTP_CREDENTIALS_PREVIOUS_KEY
    if (!previousKeyValue) throw currentError
    const previousKey = getCredentialEncryptionKey(previousKeyValue)
    return validateImapCredentials(decryptCredentials(envelope, previousKey))
  }
}

export async function getImapCredentials(Settings, userId) {
  const settings = await Settings.findById(String(userId))
    .select('+imapCredentialsEncrypted')
    .lean()
  if (!settings?.imapCredentialsEncrypted) return null
  const envelope = settings.imapCredentialsEncrypted
  try {
    return validateImapCredentials(
      decryptCredentials(envelope, getCredentialEncryptionKey()),
    )
  } catch (error) {
    if (error instanceof HttpError) throw error
    const previousKeyValue = process.env.SMTP_CREDENTIALS_PREVIOUS_KEY
    if (!previousKeyValue) {
      throw new HttpError(503, 'Saved IMAP credentials could not be decrypted. Check the server encryption key.')
    }
    let credentials
    try {
      credentials = validateImapCredentials(
        decryptCredentials(envelope, getCredentialEncryptionKey(previousKeyValue)),
      )
    } catch {
      throw new HttpError(503, 'Saved IMAP credentials could not be decrypted. Check the server encryption key.')
    }
    await Settings.updateOne(
      { _id: String(userId), imapCredentialsEncrypted: envelope },
      { $set: { imapCredentialsEncrypted: encryptImapCredentials(credentials) } },
    )
    return credentials
  }
}

export function publicImapSettings(credentials) {
  if (!credentials) {
    return {
      configured: false,
      host: '',
      port: 993,
      secure: true,
      username: '',
      mailbox: 'INBOX',
      passwordSet: false,
    }
  }
  const { host, port, secure, username, mailbox } = credentials
  return { configured: true, host, port, secure, username, mailbox, passwordSet: true }
}
