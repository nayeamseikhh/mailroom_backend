import HttpError from '../utils/httpError.js'
import addressparser from 'nodemailer/lib/addressparser/index.js'
import {
  decryptCredentials,
  encryptCredentials,
  getCredentialEncryptionKey,
} from './credentialEncryption.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SMTP_FIELDS = new Set([
  'host',
  'port',
  'secure',
  'username',
  'password',
  'senderEmail',
])

export function validateSmtpCredentials(input, { requirePassword = true } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'SMTP settings must be an object.')
  }
  for (const field of Object.keys(input)) {
    if (!SMTP_FIELDS.has(field)) throw new HttpError(400, `Unknown SMTP setting: ${field}.`)
  }

  const host = typeof input.host === 'string' ? input.host.trim().toLowerCase() : ''
  const port = Number(input.port)
  const username = typeof input.username === 'string' ? input.username.trim() : ''
  const rawPassword = typeof input.password === 'string' ? input.password : ''
  const senderEmail = typeof input.senderEmail === 'string'
    ? input.senderEmail.trim().toLowerCase()
    : ''
  const secure = input.secure
  const password = host === 'smtp.gmail.com'
    ? rawPassword.replace(/\s+/g, '')
    : rawPassword

  if (!/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/.test(host)) {
    throw new HttpError(400, 'Enter a valid SMTP host.')
  }
  const defaultAllowedHosts = 'smtp.gmail.com,smtp.office365.com,smtp-mail.outlook.com,smtp.sendgrid.net,smtp.mailgun.org,smtp.resend.com,smtp.zoho.com'
  const allowedHostsString = process.env.SMTP_ALLOWED_HOSTS ?? defaultAllowedHosts
  const allowedHosts = allowedHostsString
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (!allowedHosts.includes(host)) {
    throw new HttpError(400, 'This SMTP host is not approved by the server administrator.')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(400, 'SMTP port must be a valid TCP port.')
  }
  if (typeof secure !== 'boolean') {
    throw new HttpError(400, 'Choose whether the SMTP connection uses implicit TLS.')
  }
  if (host === 'smtp.gmail.com' && (
    (port === 587 && secure) ||
    (port === 465 && !secure)
  )) {
    throw new HttpError(
      400,
      'Gmail TLS setting does not match the port: use port 587 with implicit TLS off, or port 465 with implicit TLS on.',
    )
  }
  if (!username || username.length > 254) {
    throw new HttpError(400, 'Enter a valid SMTP username.')
  }
  if (host === 'smtp.gmail.com' && !EMAIL_PATTERN.test(username)) {
    throw new HttpError(
      400,
      'For Gmail, SMTP username must be your full Google email address. Put the display name in Sender name.',
    )
  }
  if ((requirePassword && !password) || password.length > 1024) {
    throw new HttpError(400, 'Enter a valid SMTP app password.')
  }
  if (!EMAIL_PATTERN.test(senderEmail) || senderEmail.length > 254) {
    throw new HttpError(400, 'Enter a valid sender email address.')
  }

  return { host, port, secure, username, password, senderEmail }
}

export function encryptSmtpCredentials(credentials) {
  return encryptCredentials(credentials)
}

export function decryptSmtpCredentials(envelope) {
  const currentKey = getCredentialEncryptionKey()
  let decrypted
  try {
    decrypted = decryptCredentials(envelope, currentKey)
  } catch (currentError) {
    const previousKeyValue = process.env.SMTP_CREDENTIALS_PREVIOUS_KEY
    if (!previousKeyValue) throw currentError
    const previousKey = getCredentialEncryptionKey(previousKeyValue)
    decrypted = decryptCredentials(envelope, previousKey)
  }
  return validateSmtpCredentials(decrypted)
}

export async function getSmtpCredentials(Settings, userId, userEmail) {
  let settings = await Settings.findById(String(userId))
    .select('+smtpCredentialsEncrypted +smtpLegacyMigrationDone')
    .lean()
  if (!settings?.smtpCredentialsEncrypted && !settings?.smtpLegacyMigrationDone) {
    await migrateLegacySmtpCredentials(Settings, userId, userEmail, settings)
    settings = await Settings.findById(String(userId))
      .select('+smtpCredentialsEncrypted +smtpLegacyMigrationDone')
      .lean()
  }
  if (!settings?.smtpCredentialsEncrypted) return null
  const envelope = settings.smtpCredentialsEncrypted
  let currentKey
  try {
    currentKey = getCredentialEncryptionKey()
  } catch {
    throw new HttpError(503, 'SMTP credential encryption is not configured correctly on the server.')
  }
  let decrypted
  let needsReencryption = false
  try {
    decrypted = decryptCredentials(envelope, currentKey)
  } catch (currentError) {
    const previousKeyValue = process.env.SMTP_CREDENTIALS_PREVIOUS_KEY
    if (!previousKeyValue) throw currentError
    const previousKey = getCredentialEncryptionKey(previousKeyValue)
    decrypted = decryptCredentials(envelope, previousKey)
    needsReencryption = true
  }
  const credentials = validateSmtpCredentials(decrypted)
  if (needsReencryption) {
    await Settings.updateOne(
      { _id: String(userId), smtpCredentialsEncrypted: envelope },
      { $set: { smtpCredentialsEncrypted: encryptCredentials(credentials, currentKey) } },
    )
  }
  return credentials
}

async function migrateLegacySmtpCredentials(Settings, userId, userEmail, settings) {
  const email = typeof userEmail === 'string'
    ? userEmail.trim().toLowerCase()
    : ''
  const smtpUser = process.env.SMTP_USER?.trim().toLowerCase() || ''
  const sender = addressparser(process.env.SMTP_FROM?.trim() || '')
  const senderEmail = sender.length === 1
    ? sender[0].address?.trim().toLowerCase() || ''
    : ''
  let credentials

  if (
    email &&
    smtpUser === email &&
    senderEmail === email &&
    process.env.SMTP_HOST &&
    process.env.SMTP_PASSWORD
  ) {
    const host = process.env.SMTP_HOST.trim().toLowerCase()
    const password = host === 'smtp.gmail.com'
      ? process.env.SMTP_PASSWORD.replace(/\s+/g, '')
      : process.env.SMTP_PASSWORD
    credentials = validateSmtpCredentials({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      username: process.env.SMTP_USER.trim(),
      password,
      senderEmail,
    })
  }

  const update = {
    $set: { smtpLegacyMigrationDone: true },
    $setOnInsert: { _id: String(userId) },
  }
  if (credentials) {
    update.$set.smtpCredentialsEncrypted = encryptSmtpCredentials(credentials)
    update.$set['sending.senderEmail'] = credentials.senderEmail
    if (sender[0].name?.trim()) {
      update.$set['sending.senderName'] = sender[0].name.trim()
    }
  }

  await Settings.updateOne(
    {
      _id: String(userId),
      smtpLegacyMigrationDone: { $ne: true },
      smtpCredentialsEncrypted: { $exists: false },
    },
    update,
    { upsert: !settings },
  )
}

export function publicSmtpSettings(credentials) {
  if (!credentials) {
    return {
      configured: false,
      host: '',
      port: 587,
      secure: false,
      username: '',
      senderEmail: '',
      passwordSet: false,
    }
  }
  const { host, port, secure, username, senderEmail } = credentials
  return { configured: true, host, port, secure, username, senderEmail, passwordSet: true }
}
