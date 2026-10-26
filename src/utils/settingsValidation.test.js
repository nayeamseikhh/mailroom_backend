import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateNotificationsInput,
  validateProfileInput,
  validateSendingInput,
} from './settingsValidation.js'

test('normalizes profile text and email fields', () => {
  assert.deepEqual(
    validateProfileInput({ name: '  Alex Morgan ', email: ' ALEX@example.com ' }),
    { name: 'Alex Morgan', email: 'alex@example.com' },
  )
})

test('rejects invalid profile email and oversized fields', () => {
  assert.throws(
    () => validateProfileInput({ email: 'not-an-email' }),
    { statusCode: 400, message: 'email must be a valid email address.' },
  )
  assert.throws(
    () => validateProfileInput({ name: 'x'.repeat(121) }),
    { statusCode: 400 },
  )
})

test('validates and normalizes sending settings', () => {
  assert.deepEqual(
    validateSendingInput({
      senderName: ' Mailroom ',
      senderEmail: ' TEAM@example.com ',
    }),
    { senderName: 'Mailroom', senderEmail: 'team@example.com' },
  )
  assert.throws(
    () => validateSendingInput({ replyToEmail: 'bad' }),
    { statusCode: 400 },
  )
})

test('accepts only known boolean notification preferences', () => {
  assert.deepEqual(
    validateNotificationsInput({ campaignUpdates: false, weeklyReports: true }),
    { campaignUpdates: false, weeklyReports: true },
  )
  assert.throws(
    () => validateNotificationsInput({ productUpdates: 'yes' }),
    { statusCode: 400 },
  )
  assert.throws(
    () => validateNotificationsInput({ admin: true }),
    { statusCode: 400 },
  )
})
