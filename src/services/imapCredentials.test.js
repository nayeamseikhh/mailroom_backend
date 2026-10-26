import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  encryptImapCredentials,
  getImapCredentials,
  publicImapSettings,
  validateImapCredentials,
} from './imapCredentials.js'

const credentials = {
  host: 'imap.example.com',
  port: 993,
  secure: true,
  username: 'user@example.com',
  password: 'private-app-password',
  mailbox: 'INBOX',
}

test('requires an administrator-approved IMAP host', () => {
  const previous = process.env.IMAP_ALLOWED_HOSTS
  delete process.env.IMAP_ALLOWED_HOSTS
  try {
    assert.throws(() => validateImapCredentials(credentials), /not approved/)
  } finally {
    if (previous === undefined) delete process.env.IMAP_ALLOWED_HOSTS
    else process.env.IMAP_ALLOWED_HOSTS = previous
  }
})

test('validates and returns an approved custom IMAP mailbox configuration', () => {
  const previous = process.env.IMAP_ALLOWED_HOSTS
  process.env.IMAP_ALLOWED_HOSTS = 'imap.example.com'
  try {
    assert.deepEqual(validateImapCredentials(credentials), credentials)
  } finally {
    if (previous === undefined) delete process.env.IMAP_ALLOWED_HOSTS
    else process.env.IMAP_ALLOWED_HOSTS = previous
  }
})

test('does not expose IMAP password in public settings', () => {
  const settings = publicImapSettings(credentials)
  assert.equal(settings.configured, true)
  assert.equal(settings.passwordSet, true)
  assert.equal(Object.hasOwn(settings, 'password'), false)
})

test('loads only decryptable account-specific IMAP credentials', async () => {
  const previousKey = process.env.SMTP_CREDENTIALS_KEY
  const previousHosts = process.env.IMAP_ALLOWED_HOSTS
  process.env.SMTP_CREDENTIALS_KEY = randomBytes(32).toString('base64')
  process.env.IMAP_ALLOWED_HOSTS = 'imap.example.com'
  const envelope = encryptImapCredentials(credentials)
  const Settings = {
    findById(id) {
      assert.equal(id, 'owner-1')
      return {
        select(fields) {
          assert.equal(fields, '+imapCredentialsEncrypted')
          return {
            lean: async () => ({ imapCredentialsEncrypted: envelope }),
          }
        },
      }
    },
  }

  try {
    assert.deepEqual(await getImapCredentials(Settings, 'owner-1'), credentials)
  } finally {
    if (previousKey === undefined) delete process.env.SMTP_CREDENTIALS_KEY
    else process.env.SMTP_CREDENTIALS_KEY = previousKey
    if (previousHosts === undefined) delete process.env.IMAP_ALLOWED_HOSTS
    else process.env.IMAP_ALLOWED_HOSTS = previousHosts
  }
})
