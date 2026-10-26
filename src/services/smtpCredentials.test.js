import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { encryptCredentials } from './credentialEncryption.js'
import {
  decryptSmtpCredentials,
  getSmtpCredentials,
  publicSmtpSettings,
  validateSmtpCredentials,
} from './smtpCredentials.js'

const credentials = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  username: 'sender-user',
  password: 'private-app-password',
  senderEmail: 'sender@example.com',
}

test('does not expose saved SMTP passwords in settings responses', () => {
  const settings = publicSmtpSettings(credentials)
  assert.equal(settings.configured, true)
  assert.equal(settings.passwordSet, true)
  assert.equal(Object.hasOwn(settings, 'password'), false)
})

test('rejects SMTP hosts that are not explicitly approved', () => {
  const previous = process.env.SMTP_ALLOWED_HOSTS
  delete process.env.SMTP_ALLOWED_HOSTS
  try {
    assert.throws(
      () => validateSmtpCredentials(credentials),
      /not approved/,
    )
  } finally {
    if (previous === undefined) delete process.env.SMTP_ALLOWED_HOSTS
    else process.env.SMTP_ALLOWED_HOSTS = previous
  }
})

test('requires Gmail SMTP usernames to be full email addresses', () => {
  const previous = process.env.SMTP_ALLOWED_HOSTS
  process.env.SMTP_ALLOWED_HOSTS = 'smtp.gmail.com'
  try {
    assert.throws(
      () => validateSmtpCredentials({
        ...credentials,
        host: 'smtp.gmail.com',
        username: 'Mailroom',
      }),
      /full Google email address/,
    )
  } finally {
    if (previous === undefined) delete process.env.SMTP_ALLOWED_HOSTS
    else process.env.SMTP_ALLOWED_HOSTS = previous
  }
})

test('rejects Gmail SMTP ports configured with the wrong TLS mode', () => {
  const previous = process.env.SMTP_ALLOWED_HOSTS
  process.env.SMTP_ALLOWED_HOSTS = 'smtp.gmail.com'
  try {
    const gmail = {
      ...credentials,
      host: 'smtp.gmail.com',
      username: 'sender@example.com',
    }
    assert.throws(
      () => validateSmtpCredentials({ ...gmail, port: 587, secure: true }),
      /port 587 with implicit TLS off/,
    )
    assert.throws(
      () => validateSmtpCredentials({ ...gmail, port: 465, secure: false }),
      /port 465 with implicit TLS on/,
    )
    assert.doesNotThrow(() =>
      validateSmtpCredentials({ ...gmail, port: 587, secure: false }),
    )
    assert.doesNotThrow(() =>
      validateSmtpCredentials({ ...gmail, port: 465, secure: true }),
    )
  } finally {
    if (previous === undefined) delete process.env.SMTP_ALLOWED_HOSTS
    else process.env.SMTP_ALLOWED_HOSTS = previous
  }
})

test('decrypts credentials with the previous key during key rotation', () => {
  const currentKey = randomBytes(32)
  const previousKey = randomBytes(32)
  const previousCurrent = process.env.SMTP_CREDENTIALS_KEY
  const previousRotationKey = process.env.SMTP_CREDENTIALS_PREVIOUS_KEY
  const previousAllowedHosts = process.env.SMTP_ALLOWED_HOSTS
  process.env.SMTP_CREDENTIALS_KEY = currentKey.toString('base64')
  process.env.SMTP_CREDENTIALS_PREVIOUS_KEY = previousKey.toString('base64')
  process.env.SMTP_ALLOWED_HOSTS = 'smtp.example.com'
  try {
    const envelope = encryptCredentials(credentials, previousKey)
    assert.deepEqual(decryptSmtpCredentials(envelope), credentials)
  } finally {
    if (previousCurrent === undefined) delete process.env.SMTP_CREDENTIALS_KEY
    else process.env.SMTP_CREDENTIALS_KEY = previousCurrent
    if (previousRotationKey === undefined) delete process.env.SMTP_CREDENTIALS_PREVIOUS_KEY
    else process.env.SMTP_CREDENTIALS_PREVIOUS_KEY = previousRotationKey
    if (previousAllowedHosts === undefined) delete process.env.SMTP_ALLOWED_HOSTS
    else process.env.SMTP_ALLOWED_HOSTS = previousAllowedHosts
  }
})

test('migrates legacy SMTP settings only to the account matching the configured sender', async () => {
  const previousKey = process.env.SMTP_CREDENTIALS_KEY
  const previousAllowed = process.env.SMTP_ALLOWED_HOSTS
  const previousHost = process.env.SMTP_HOST
  const previousPort = process.env.SMTP_PORT
  const previousUser = process.env.SMTP_USER
  const previousPassword = process.env.SMTP_PASSWORD
  const previousFrom = process.env.SMTP_FROM
  process.env.SMTP_CREDENTIALS_KEY = randomBytes(32).toString('base64')
  process.env.SMTP_ALLOWED_HOSTS = 'smtp.gmail.com'
  process.env.SMTP_HOST = 'smtp.gmail.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_USER = 'codernayeam@gmail.com'
  process.env.SMTP_PASSWORD = 'test pass word'
  process.env.SMTP_FROM = 'Mailroom <codernayeam@gmail.com>'

  const createSettingsModel = () => {
    let stored
    return {
      findById() {
        return {
          select() {
            return {
              lean: async () => stored ? { ...stored } : null,
            }
          },
        }
      },
      async updateOne(filter, update) {
        if (stored && (
          stored.smtpLegacyMigrationDone === true ||
          stored.smtpCredentialsEncrypted
        )) return
        if (!stored && filter._id) stored = { _id: filter._id }
        Object.assign(stored, update.$set)
      },
      get stored() {
        return stored
      },
    }
  }
  const Settings = createSettingsModel()
  const OtherSettings = createSettingsModel()

  try {
    const migrated = await getSmtpCredentials(
      Settings,
      'account-1',
      'codernayeam@gmail.com',
    )
    assert.equal(migrated.host, 'smtp.gmail.com')
    assert.equal(migrated.password, 'testpassword')
    assert.equal(Settings.stored.smtpLegacyMigrationDone, true)
    assert.equal(Settings.stored['sending.senderEmail'], 'codernayeam@gmail.com')
    assert.equal(Settings.stored.smtpCredentialsEncrypted.includes('testpassword'), false)
    assert.equal(
      await getSmtpCredentials(OtherSettings, 'account-2', 'other@example.com'),
      null,
    )
  } finally {
    const restore = (name, value) => {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    restore('SMTP_CREDENTIALS_KEY', previousKey)
    restore('SMTP_ALLOWED_HOSTS', previousAllowed)
    restore('SMTP_HOST', previousHost)
    restore('SMTP_PORT', previousPort)
    restore('SMTP_USER', previousUser)
    restore('SMTP_PASSWORD', previousPassword)
    restore('SMTP_FROM', previousFrom)
  }
})
