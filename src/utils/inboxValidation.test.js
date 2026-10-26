import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateInboxAction,
  validateInboxFolder,
  validateInboxSend,
} from './inboxValidation.js'

test('accepts supported mailbox folders and rejects invalid folders', () => {
  assert.equal(validateInboxFolder('spam'), 'spam')
  assert.throws(() => validateInboxFolder('../INBOX'), { statusCode: 400 })
})

test('validates destructive inbox actions and allowed fields', () => {
  assert.deepEqual(validateInboxAction({ action: 'archive', folder: 'inbox' }), {
    action: 'archive',
    folder: 'inbox',
  })
  assert.deepEqual(validateInboxAction({ action: 'deleteForever', folder: 'spam' }), {
    action: 'deleteForever',
    folder: 'spam',
  })
  assert.deepEqual(validateInboxAction({ action: 'trash', folder: 'inbox', uids: [3, 4, 3] }), {
    action: 'trash',
    folder: 'inbox',
    uids: [3, 4],
  })
  assert.throws(() => validateInboxAction({ action: 'purge', folder: 'inbox' }), { statusCode: 400 })
  assert.throws(() => validateInboxAction({ action: 'trash', folder: 'inbox', path: 'INBOX' }), { statusCode: 400 })
  assert.throws(() => validateInboxAction({ action: 'trash', folder: 'inbox', uids: [0] }), { statusCode: 400 })
})

test('normalizes and validates compose email fields', () => {
  assert.deepEqual(validateInboxSend({
    to: '  Person@Example.com ',
    subject: ' Hello ',
    body: 'Message body',
  }), {
    to: 'person@example.com',
    subject: 'Hello',
    body: 'Message body',
  })
  assert.throws(() => validateInboxSend({ to: 'bad', subject: 'Hi', body: 'Body' }), { statusCode: 400 })
  assert.throws(() => validateInboxSend({ to: 'person@example.com', subject: 'Hi\nBcc:x', body: 'Body' }), { statusCode: 400 })
})
