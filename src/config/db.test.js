import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDatabaseUri } from './db.js'

test('requires TLS for production MongoDB connections', () => {
  assert.throws(
    () => validateDatabaseUri('mongodb://localhost/mailroom', 'production'),
    /must enable TLS/,
  )
  assert.doesNotThrow(() =>
    validateDatabaseUri('mongodb://localhost/mailroom?tls=true', 'production'),
  )
  assert.doesNotThrow(() =>
    validateDatabaseUri('mongodb://node1.example:27017,node2.example:27017/mailroom?tls=true', 'production'),
  )
  assert.doesNotThrow(() =>
    validateDatabaseUri('mongodb+srv://cluster.example/mailroom', 'production'),
  )
})

test('rejects MongoDB TLS options that disable certificate verification', () => {
  assert.throws(
    () => validateDatabaseUri('mongodb+srv://cluster.example/mailroom?tlsInsecure=true'),
    /cannot be disabled/,
  )
  assert.throws(
    () => validateDatabaseUri('mongodb://localhost/mailroom?tlsAllowInvalidCertificates=true'),
    /cannot be disabled/,
  )
})
