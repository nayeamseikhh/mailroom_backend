import HttpError from './httpError.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEXT_LIMITS = new Map([
  ['name', 200],
  ['senderName', 120],
  ['subject', 200],
  ['previewText', 250],
])
const ALLOWED_FIELDS = new Set([
  ...TEXT_LIMITS.keys(),
  'senderEmail',
  'recipients',
  'cc',
  'bcc',
  'replyTo',
  'body',
  'audienceListId',
  'audienceListIds',
  'contactIds',
  'fallbackValues',
]);

function validateEmail(value, field, { optional = false } = {}) {
  if (optional && (value === undefined || value === '')) return ''
  if (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim())) {
    throw new HttpError(400, `${field} must be a valid email address.`)
  }
  return value.trim().toLowerCase()
}

function validateEmailList(value, field, limit) {
  if (value === undefined) return undefined
  const addresses = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[;,\n]+/)
      : null

  if (!addresses || addresses.length > limit) {
    throw new HttpError(400, `${field} must contain no more than ${limit} email addresses.`)
  }

  const emails = addresses
    .map((address) => validateEmail(address, field))
  return [...new Set(emails)]
}

export function validateCampaignInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'A campaign object is required.')
  }

  const unknownField = Object.keys(input).find((field) => !ALLOWED_FIELDS.has(field))
  if (unknownField) throw new HttpError(400, `Unknown campaign field: ${unknownField}.`)

  const result = {}
  for (const [field, maxLength] of TEXT_LIMITS) {
    if (input[field] === undefined) continue
    if (typeof input[field] !== 'string') {
      throw new HttpError(400, `${field} must be text.`)
    }
    const value = input[field].trim()
    if (value.length > maxLength) {
      throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`)
    }
    if (['senderName', 'subject'].includes(field) && /[\r\n]/.test(value)) {
      throw new HttpError(400, `${field} cannot contain line breaks.`)
    }
    result[field] = value
  }

  if (input.senderEmail !== undefined) {
    result.senderEmail = input.senderEmail === ''
      ? ''
      : validateEmail(input.senderEmail, 'senderEmail')
  } else if (!partial) {
    result.senderEmail = ''
  }

  if (input.replyTo !== undefined) {
    result.replyTo = validateEmail(input.replyTo, 'replyTo', { optional: true })
  }

  for (const field of ['recipients', 'cc', 'bcc']) {
    const emails = validateEmailList(input[field], field, field === 'recipients' ? 5000 : 20)
    if (emails !== undefined) result[field] = emails
  }

  if (input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.length > 100000) {
      throw new HttpError(400, 'body must be text of 100,000 characters or fewer.')
    }
    result.body = input.body
  }

  if (input.audienceListId !== undefined) {
    if (input.audienceListId && !/^[a-f\d]{24}$/i.test(input.audienceListId)) {
      throw new HttpError(400, 'audienceListId is invalid.')
    }
    result.audienceListId = input.audienceListId || null
  }

  if (input.audienceListIds !== undefined) {
    if (!Array.isArray(input.audienceListIds) || input.audienceListIds.length > 100 ||
      input.audienceListIds.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
      throw new HttpError(400, 'audienceListIds must contain no more than 100 valid list IDs.')
    }
    result.audienceListIds = [...new Set(input.audienceListIds)]
  }

  if (input.contactIds !== undefined) {
    if (!Array.isArray(input.contactIds) || input.contactIds.length > 10000 ||
      input.contactIds.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
      throw new HttpError(400, 'contactIds must contain no more than 10,000 valid contact IDs.')
    }
    result.contactIds = [...new Set(input.contactIds)]
  }

  if (input.fallbackValues !== undefined) {
    if (!input.fallbackValues || typeof input.fallbackValues !== 'object' || Array.isArray(input.fallbackValues)) {
      throw new HttpError(400, 'fallbackValues must be an object.')
    }
    const entries = Object.entries(input.fallbackValues)
    if (entries.length > 50) throw new HttpError(400, 'Use no more than 50 personalization fallbacks.')
    result.fallbackValues = {}
    for (const [field, value] of entries) {
      if (!/^[A-Za-z][\w.]{0,79}$/.test(field) || typeof value !== 'string' || value.length > 300) {
        throw new HttpError(400, 'Personalization fallbacks must use valid field names and text values up to 300 characters.')
      }
      result.fallbackValues[field] = value.trim()
    }
  }

  return result
}
