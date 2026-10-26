import assert from 'node:assert/strict'
import test from 'node:test'
import { getImapConfig } from './inboxService.js'

const validEnvironment = {
  IMAP_HOST: 'imap.example.com',
  IMAP_USER: 'mailbox@example.com',
  IMAP_PASSWORD: 'app-password',
}

test('requires IMAP host, user, and password', () => {
  assert.throws(
    () => getImapConfig({}),
    (error) => error.statusCode === 503 && error.message.includes('Sending settings'),
  )
})

test('uses secure INBOX defaults for the standard IMAP TLS port', () => {
  assert.deepEqual(getImapConfig(validEnvironment), {
    host: 'imap.example.com',
    port: 993,
    secure: true,
    user: 'mailbox@example.com',
    password: 'app-password',
    mailbox: 'INBOX',
  })
})

test('supports an explicit non-TLS port and mailbox name', () => {
  assert.deepEqual(getImapConfig({
    ...validEnvironment,
    IMAP_PORT: '143',
    IMAP_MAILBOX: 'INBOX/Replies',
  }), {
    host: 'imap.example.com',
    port: 143,
    secure: false,
    user: 'mailbox@example.com',
    password: 'app-password',
    mailbox: 'INBOX/Replies',
  })
})

test('rejects invalid IMAP port and TLS values', () => {
  assert.throws(
    () => getImapConfig({ ...validEnvironment, IMAP_PORT: '0' }),
    (error) => error.statusCode === 503 && error.message.includes('IMAP_PORT'),
  )
  assert.throws(
    () => getImapConfig({ ...validEnvironment, IMAP_SECURE: 'yes' }),
    (error) => error.statusCode === 503 && error.message.includes('IMAP_SECURE'),
  )
})
