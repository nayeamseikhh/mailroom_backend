import mongoose from 'mongoose'
import HttpError from './httpError.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTACT_STATUSES = new Set(['Subscribed', 'Unsubscribed', 'Bounced', 'Suppressed'])

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be text.`)
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer.`)
  }
  return trimmed
}

function parseTags(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) && typeof value !== 'string') {
    throw new HttpError(400, 'Tags must be a list of text values.')
  }
  const tags = (Array.isArray(value) ? value : value.split(','))
    .map((tag) => {
      if (typeof tag !== 'string') {
        throw new HttpError(400, 'Tags must be text values.')
      }
      return tag.trim()
    })
    .filter(Boolean)
  const uniqueTags = [...new Set(tags)]
  if (uniqueTags.length > 30 || uniqueTags.some((tag) => tag.length > 40)) {
    throw new HttpError(400, 'Use at most 30 tags, each 40 characters or fewer.')
  }
  return uniqueTags
}

export function validateContactInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'A contact object is required.')
  }

  const result = {}
  if (!partial || input.name !== undefined) {
    const name = optionalString(input.name, 'Name', 120)
    if (!name) throw new HttpError(400, 'Name is required.')
    result.name = name
  }
  if (!partial || input.email !== undefined) {
    const email = optionalString(input.email, 'Email', 254)?.toLowerCase()
    if (!email || !EMAIL_PATTERN.test(email)) {
      throw new HttpError(400, 'A valid email address is required.')
    }
    result.email = email
  }

  for (const [field, maxLength] of [
    ['company', 160],
    ['phone', 40],
    ['notes', 2000],
    ['source', 100],
  ]) {
    const value = optionalString(input[field], field, maxLength)
    if (value !== undefined) result[field] = value
  }

  if (input.status !== undefined) {
    if (!CONTACT_STATUSES.has(input.status)) {
      throw new HttpError(400, 'Status must be Subscribed, Unsubscribed, Bounced, or Suppressed.')
    }
    result.status = input.status
  }

  if (input.customFields !== undefined) {
    if (!input.customFields || typeof input.customFields !== 'object' || Array.isArray(input.customFields)) {
      throw new HttpError(400, 'Custom fields must be an object.')
    }
    const entries = Object.entries(input.customFields)
    if (entries.length > 50) {
      throw new HttpError(400, 'A contact can have at most 50 custom fields.')
    }
    result.customFields = {}
    for (const [key, value] of entries) {
      const name = key.trim()
      if (!name || name.length > 80 || ['__proto__', 'prototype', 'constructor'].includes(name)) {
        throw new HttpError(400, 'Custom field names must be 1 to 80 characters.')
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new HttpError(400, `Custom field "${name}" must be text or a number.`)
      }
      const textValue = String(value).trim()
      if (textValue.length > 1000) {
        throw new HttpError(400, `Custom field "${name}" must be 1,000 characters or fewer.`)
      }
      result.customFields[name] = textValue
    }
  }

  const tags = parseTags(input.tags)
  if (tags !== undefined) result.tags = tags

  if (input.listId !== undefined) {
    if (input.listId === '' || input.listId === null) {
      result.listId = null
    } else if (!mongoose.isValidObjectId(input.listId)) {
      throw new HttpError(400, 'List ID is invalid.')
    } else {
      result.listId = input.listId
    }
  }

  return result
}

export function validateListInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'A list object is required.')
  }

  const result = {}
  if (!partial || input.name !== undefined) {
    const name = optionalString(input.name, 'List name', 120)
    if (!name) throw new HttpError(400, 'List name is required.')
    result.name = name
    result.nameKey = name.toLocaleLowerCase()
  }
  if (input.folder !== undefined) {
    const folder = optionalString(input.folder, 'Folder name', 120)
    result.folder = folder || ''
    result.folderKey = (folder || '').toLocaleLowerCase()
  } else if (!partial) {
    result.folder = ''
    result.folderKey = ''
  }
  if (input.description !== undefined) {
    result.description = optionalString(input.description, 'Description', 500)
  }
  return result
}
