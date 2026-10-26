import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCampaignInput } from './campaignValidation.js'

test('normalizes sender and recipient addresses while preserving optional draft content', () => {
  const campaign = validateCampaignInput({
    senderEmail: 'Sender@Example.com',
    senderName: ' Sender ',
    recipients: ['Person@Example.com', 'person@example.com'],
    subject: '  Update  ',
  })

  assert.equal(campaign.senderEmail, 'sender@example.com')
  assert.equal(campaign.senderName, 'Sender')
  assert.deepEqual(campaign.recipients, ['person@example.com'])
  assert.equal(campaign.subject, 'Update')
})

test('rejects invalid recipient addresses', () => {
  assert.throws(
    () => validateCampaignInput({ senderEmail: 'sender@example.com', recipients: ['bad-address'] }),
    { statusCode: 400 },
  )
})

test('rejects mail headers with line breaks and oversized copy lists', () => {
  assert.throws(
    () => validateCampaignInput({
      senderEmail: 'sender@example.com',
      senderName: 'Sender\nBcc: attacker@example.com',
    }),
    { statusCode: 400 },
  )
  assert.throws(
    () => validateCampaignInput({
      senderEmail: 'sender@example.com',
      cc: Array.from({ length: 21 }, (_, index) => `person${index}@example.com`),
    }),
    { statusCode: 400 },
  )
})

test('rejects unknown fields instead of persisting unsupported campaign controls', () => {
  assert.throws(
    () => validateCampaignInput({ senderEmail: 'sender@example.com', sendNow: true }),
    { statusCode: 400 },
  )
})

test('accepts partial campaign updates without requiring sender fields', () => {
  assert.deepEqual(validateCampaignInput({ subject: 'Revised subject' }, { partial: true }), {
    subject: 'Revised subject',
  })
})

test('allows incomplete drafts to be saved before sender details are configured', () => {
  assert.deepEqual(validateCampaignInput({ subject: 'Draft subject' }), {
    subject: 'Draft subject',
    senderEmail: '',
  })
})

test('accepts selected database contacts and personalization fallbacks', () => {
  const result = validateCampaignInput({
    contactIds: ['64b000000000000000000001'],
    fallbackValues: { name: 'friend', 'customFields.industry': 'your industry' },
  })
  assert.deepEqual(result.contactIds, ['64b000000000000000000001'])
  assert.deepEqual(result.fallbackValues, {
    name: 'friend',
    'customFields.industry': 'your industry',
  })
})

test('rejects malformed individual contact IDs', () => {
  assert.throws(
    () => validateCampaignInput({ contactIds: ['not-an-object-id'] }),
    { statusCode: 400 },
  )
})
