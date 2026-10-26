import test from 'node:test'
import assert from 'node:assert/strict'
import { getPasswordPolicyError } from './passwordPolicy.js'

test('requires at least twelve characters with a letter and a number', () => {
  assert.match(getPasswordPolicyError('Short7pass'), /12 characters/)
  assert.match(getPasswordPolicyError('longenoughpassword'), /number/)
  assert.match(getPasswordPolicyError('123456789012'), /letter/)
  assert.equal(getPasswordPolicyError('SafePassphrase2026'), null)
})

test('rejects passwords that exceed bcrypt input capacity', () => {
  assert.match(getPasswordPolicyError(`${'a'.repeat(71)}12`), /72 bytes/)
  assert.match(getPasswordPolicyError(`${'ক'.repeat(25)}123`), /72 bytes/)
})
