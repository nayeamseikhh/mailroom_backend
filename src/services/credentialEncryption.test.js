import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  decryptCredentials,
  encryptCredentials,
  getCredentialEncryptionKey,
} from './credentialEncryption.js'

test('encrypts and decrypts credentials with authenticated encryption', () => {
  const key = randomBytes(32)
  const config = { host: 'smtp.example.com', password: 'private-app-password' }
  const encrypted = encryptCredentials(config, key)

  assert.notEqual(encrypted.includes(config.password), true)
  assert.deepEqual(decryptCredentials(encrypted, key), config)
  assert.throws(() => decryptCredentials(encrypted, randomBytes(32)))
})

test('accepts only canonical base64-encoded 32-byte encryption keys', () => {
  assert.equal(getCredentialEncryptionKey(randomBytes(32).toString('base64')).length, 32)
  assert.throws(() => getCredentialEncryptionKey('too-short'), /32-byte key/)
})
