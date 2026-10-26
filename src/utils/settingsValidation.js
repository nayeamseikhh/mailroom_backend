import HttpError from './httpError.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROFILE_FIELDS = new Map([
  ['name', 120],
  ['email', 254],
  ['company', 160],
  ['phone', 40],
  ['timezone', 100],
])
const SENDING_FIELDS = new Map([
  ['senderName', 120],
  ['senderEmail', 254],
  ['replyToEmail', 254],
])
const NOTIFICATION_FIELDS = new Set([
  'campaignUpdates',
  'weeklyReports',
  'productUpdates',
  'securityAlerts',
])

function validateObject(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, `A ${label} object is required.`)
  }
}

function validateTextFields(input, label, fields, emailFields = []) {
  validateObject(input, label)
  const result = {}

  for (const [field, maxLength] of fields) {
    if (input[field] === undefined) continue
    if (typeof input[field] !== 'string') {
      throw new HttpError(400, `${field} must be text.`)
    }

    const value = input[field].trim()
    if (value.length > maxLength) {
      throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`)
    }
    if (emailFields.includes(field) && value && !EMAIL_PATTERN.test(value)) {
      throw new HttpError(400, `${field} must be a valid email address.`)
    }
    result[field] = emailFields.includes(field) ? value.toLowerCase() : value
  }

  return result
}

export function validateProfileInput(input) {
  return validateTextFields(input, 'profile', PROFILE_FIELDS, ['email'])
}

export function validateSendingInput(input) {
  return validateTextFields(input, 'sending settings', SENDING_FIELDS, [
    'senderEmail',
    'replyToEmail',
  ])
}

export function validateNotificationsInput(input) {
  validateObject(input, 'notification preferences')
  const result = {}

  for (const [field, value] of Object.entries(input)) {
    if (!NOTIFICATION_FIELDS.has(field)) {
      throw new HttpError(400, `Unknown notification preference: ${field}.`)
    }
    if (typeof value !== 'boolean') {
      throw new HttpError(400, `${field} must be true or false.`)
    }
    result[field] = value
  }

  return result
}
