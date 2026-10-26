import HttpError from '../utils/httpError.js'
import {
  validateNotificationsInput,
  validateProfileInput,
  validateSendingInput,
} from '../utils/settingsValidation.js'
import {
  decryptSmtpCredentials,
  encryptSmtpCredentials,
  getSmtpCredentials,
  publicSmtpSettings,
  validateSmtpCredentials,
} from '../services/smtpCredentials.js'
import { getCredentialEncryptionKey } from '../services/credentialEncryption.js'
import {
  decryptImapCredentials,
  encryptImapCredentials,
  getImapCredentials,
  publicImapSettings,
  validateImapCredentials,
} from '../services/imapCredentials.js'
import { testImapConnection } from '../services/inboxService.js'
import {
  closeSmtpTransport,
  getSenderAddress,
  verifySmtpConnection,
} from '../services/emailService.js'

async function getUserSettings(Settings, userId) {
  return Settings.findByIdAndUpdate(
    String(userId),
    { $setOnInsert: { _id: String(userId) } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}

function requireCredentialEncryptionKey() {
  try {
    return getCredentialEncryptionKey()
  } catch {
    throw new HttpError(503, 'Mail credential encryption is not configured correctly on the server.')
  }
}

export async function getSettings(req, res) {
  await getUserSettings(req.models.Settings, req.user._id)
  const smtpCredentials = await getSmtpCredentials(
    req.models.Settings,
    req.user._id,
    req.user.email,
  )
  const settings = await req.models.Settings.findById(String(req.user._id))
  res.json({
    profile: settings.profile,
    notifications: settings.notifications,
    sending: settings.sending,
    smtp: publicSmtpSettings(smtpCredentials),
    imap: publicImapSettings(await getImapCredentials(req.models.Settings, req.user._id)),
  })
}

async function updateSection(req, res, section, validator) {
  const input = validator(req.body)
  const settings = await getUserSettings(req.models.Settings, req.user._id)

  for (const [field, value] of Object.entries(input)) {
    settings.set(`${section}.${field}`, value)
  }

  await settings.save()
  res.json({ [section]: settings[section] })
}

export async function updateProfile(req, res) {
  await updateSection(req, res, 'profile', validateProfileInput)
}

export async function updateNotifications(req, res) {
  await updateSection(req, res, 'notifications', validateNotificationsInput)
}

export async function updateSending(req, res) {
  await updateSection(req, res, 'sending', validateSendingInput)
}

export async function updateSmtpSettings(req, res) {
  requireCredentialEncryptionKey()
  const Settings = req.models.Settings
  await getUserSettings(Settings, req.user._id)
  const settings = await Settings.findById(String(req.user._id))
    .select('+smtpCredentialsEncrypted')
  const current = settings.smtpCredentialsEncrypted
    ? decryptSmtpCredentials(settings.smtpCredentialsEncrypted)
    : null
  const input = { ...req.body }
  if (!input.password && current) input.password = current.password
  const credentials = validateSmtpCredentials(input, { requirePassword: true })

  settings.smtpCredentialsEncrypted = encryptSmtpCredentials(credentials)
  settings.smtpLegacyMigrationDone = true
  settings.set('sending.senderEmail', credentials.senderEmail)
  await settings.save()
  closeSmtpTransport(req.models.databaseName)
  res.json({
    smtp: publicSmtpSettings(credentials),
    sending: settings.sending,
  })
}

export async function testSmtpSettings(req, res) {
  requireCredentialEncryptionKey()
  const input = { ...req.body }
  if (!input.password) {
    const savedCredentials = await getSmtpCredentials(
      req.models.Settings,
      req.user._id,
      req.user.email,
    )
    if (savedCredentials) input.password = savedCredentials.password
  }
  const credentials = validateSmtpCredentials(input)
  const transportKey = `smtp-test:${req.user._id}`
  try {
    await verifySmtpConnection(credentials, transportKey)
  } catch (error) {
    console.error('SMTP connection test failed:', error.code || error.name)
    const authenticationFailure =
      error.code === 'EAUTH' ||
      error.responseCode === 535 ||
      /5\.7\.[0-9]+/.test(error.response || '')
    const message = authenticationFailure
      ? credentials.host === 'smtp.gmail.com'
        ? 'Gmail rejected the SMTP login. Enter your full Gmail address as SMTP username (not “Mailroom”) and use a current Google App Password created with 2-Step Verification enabled.'
        : 'The SMTP server rejected the username or password. Check the credentials with your email provider.'
      : error.code === 'ESOCKET'
        ? credentials.host === 'smtp.gmail.com'
          ? 'Gmail closed the SMTP connection. Use port 587 with implicit TLS off, or port 465 with implicit TLS on. If that is already correct, check your server network or firewall.'
          : 'The SMTP server closed the secure connection. Check the port/TLS combination and your email provider’s TLS requirements.'
        : ['ETIMEDOUT', 'ECONNECTION', 'EDNS'].includes(error.code)
          ? 'Could not reach the SMTP server. Check the host, port, TLS setting, and server network access.'
        : 'The SMTP server could not verify this configuration. Check the settings and provider requirements.'
    res.status(502).json({ message })
    return
  } finally {
    closeSmtpTransport(transportKey)
  }
  res.json({ success: true, senderEmail: getSenderAddress(credentials) })
}

export async function deleteSmtpSettings(req, res) {
  await getUserSettings(req.models.Settings, req.user._id)
  const settings = await req.models.Settings.findById(String(req.user._id))
    .select('+smtpCredentialsEncrypted')
  settings.smtpCredentialsEncrypted = undefined
  settings.smtpLegacyMigrationDone = true
  await settings.save()
  closeSmtpTransport(req.models.databaseName)
  res.json({ smtp: publicSmtpSettings(null) })
}

export async function updateImapSettings(req, res) {
  requireCredentialEncryptionKey()
  const Settings = req.models.Settings
  await getUserSettings(Settings, req.user._id)
  const settings = await Settings.findById(String(req.user._id))
    .select('+imapCredentialsEncrypted')
  const current = settings.imapCredentialsEncrypted
    ? decryptImapCredentials(settings.imapCredentialsEncrypted)
    : null
  const input = { ...req.body }
  if (!input.password && current) input.password = current.password
  const credentials = validateImapCredentials(input)

  settings.imapCredentialsEncrypted = encryptImapCredentials(credentials)
  await settings.save()
  res.json({ imap: publicImapSettings(credentials) })
}

export async function testImapSettings(req, res) {
  requireCredentialEncryptionKey()
  const input = { ...req.body }
  if (!input.password) {
    const savedCredentials = await getImapCredentials(req.models.Settings, req.user._id)
    if (savedCredentials) input.password = savedCredentials.password
  }
  const credentials = validateImapCredentials(input)
  try {
    const result = await testImapConnection(credentials)
    res.json({ success: true, mailbox: result.mailbox })
  } catch (error) {
    console.error('IMAP connection test failed:', error.code || error.name)
    const authenticationFailure = error.code === 'AUTHENTICATIONFAILED' ||
      error.responseStatus === 'AUTHENTICATIONFAILED'
    throw new HttpError(
      502,
      authenticationFailure
        ? 'The IMAP server rejected the username or password. Check the mailbox credentials with your email provider.'
        : 'Could not connect to this IMAP mailbox. Check the host, port, TLS setting, and provider requirements.',
    )
  }
}

export async function deleteImapSettings(req, res) {
  await getUserSettings(req.models.Settings, req.user._id)
  const settings = await req.models.Settings.findById(String(req.user._id))
    .select('+imapCredentialsEncrypted')
  settings.imapCredentialsEncrypted = undefined
  await settings.save()
  res.json({ imap: publicImapSettings(null) })
}
