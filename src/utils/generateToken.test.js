import test from 'node:test'
import assert from 'node:assert/strict'
import { generateToken, validateJwtSecret, verifyToken } from './generateToken.js'

test('requires a random JWT secret of at least 32 bytes', () => {
  const original = process.env.JWT_SECRET
  try {
    process.env.JWT_SECRET = 'too-short'
    assert.throws(validateJwtSecret, /at least 32 bytes/)
    process.env.JWT_SECRET = 'change-me-'.padEnd(40, 'x')
    assert.throws(validateJwtSecret, /at least 32 bytes/)
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = original
  }
})

test('signs only HS256 tokens and preserves the session version', () => {
  const original = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'a'.repeat(48)
  try {
    const token = generateToken('507f1f77bcf86cd799439011', '1h', 4)
    assert.deepEqual(verifyToken(token).ver, 4)
    const [header, payload, signature] = token.split('.')
    const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    assert.throws(() => verifyToken(`${header}.${payload}.${changedSignature}`))
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = original
  }
})
