import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateContactInput,
  validateListInput,
} from './contactValidation.js'

test('normalizes contact email, tags, and optional fields', () => {
  const contact = validateContactInput({
    name: '  Alex Morgan ',
    email: '  ALEX@example.com ',
    company: ' Example Co ',
    tags: 'newsletter, customer, newsletter',
  })

  assert.deepEqual(contact, {
    name: 'Alex Morgan',
    email: 'alex@example.com',
    company: 'Example Co',
    tags: ['newsletter', 'customer'],
  })
})

test('requires a valid email address', () => {
  assert.throws(
    () => validateContactInput({ name: 'Alex', email: 'not-an-email' }),
    { statusCode: 400, message: 'A valid email address is required.' },
  )
})

test('rejects invalid statuses and oversized tag lists', () => {
  assert.throws(
    () =>
      validateContactInput({
        name: 'Alex',
        email: 'alex@example.com',
        status: 'Pending',
      }),
    { statusCode: 400 },
  )

  assert.throws(
    () =>
      validateContactInput({
        name: 'Alex',
        email: 'alex@example.com',
        tags: Array.from({ length: 31 }, (_, index) => `tag-${index}`),
      }),
    { statusCode: 400 },
  )
})

test('normalizes list names and folder keys for duplicate detection', () => {
  assert.deepEqual(
    validateListInput({ name: '  Newsletter  ', folder: '  Marketing ' }),
    {
      name: 'Newsletter',
      nameKey: 'newsletter',
      folder: 'Marketing',
      folderKey: 'marketing',
    },
  )
})

test('allows a list without a parent folder', () => {
  assert.deepEqual(validateListInput({ name: '  Newsletter  ' }), {
    name: 'Newsletter',
    nameKey: 'newsletter',
    folder: '',
    folderKey: '',
  })
})

test('allows partial contact updates without requiring name and email', () => {
  assert.deepEqual(
    validateContactInput({ notes: 'Follow up next week' }, { partial: true }),
    { notes: 'Follow up next week' },
  )
})

test('validates and preserves dynamic custom fields', () => {
  assert.deepEqual(
    validateContactInput({
      name: 'Alex',
      email: 'alex@example.com',
      customFields: { industry: 'Energy', employees: 12 },
    }),
    {
      name: 'Alex',
      email: 'alex@example.com',
      customFields: { industry: 'Energy', employees: '12' },
    },
  )
  assert.throws(
    () => validateContactInput({
      name: 'Alex',
      email: 'alex@example.com',
      customFields: { constructor: 'unsafe' },
    }),
    { statusCode: 400 },
  )
})
