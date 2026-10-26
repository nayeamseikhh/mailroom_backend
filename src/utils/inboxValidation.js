import HttpError from './httpError.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FOLDERS = new Set(['inbox', 'sent', 'all', 'spam', 'trash'])
const ACTIONS = new Set(['archive', 'trash', 'spam', 'restore', 'deleteForever'])

export function validateInboxFolder(value = 'inbox') {
  if (typeof value !== 'string' || !FOLDERS.has(value)) {
    throw new HttpError(400, 'Invalid inbox folder.')
  }
  return value
}

export function validateInboxAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'An inbox action is required.')
  }
  const fields = Object.keys(input)
  if (fields.some((field) => !['action', 'folder', 'uids'].includes(field))) {
    throw new HttpError(400, 'Unknown inbox action field.')
  }
  if (!ACTIONS.has(input.action)) {
    throw new HttpError(400, 'Invalid inbox action.')
  }
  const result = {
    action: input.action,
    folder: validateInboxFolder(input.folder),
  }
  if (input.uids !== undefined) {
    if (!Array.isArray(input.uids) || !input.uids.length || input.uids.length > 100) {
      throw new HttpError(400, 'Select between 1 and 100 emails.')
    }
    if (input.uids.some((uid) => !Number.isSafeInteger(uid) || uid < 1)) {
      throw new HttpError(400, 'Email selection contains an invalid ID.')
    }
    result.uids = [...new Set(input.uids)]
  }
  return result
}

export function validateInboxSend(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'An email message is required.')
  }
  if (Object.keys(input).some((field) => !['to', 'subject', 'body'].includes(field))) {
    throw new HttpError(400, 'Unknown email field.')
  }

  const to = typeof input.to === 'string' ? input.to.trim().toLowerCase() : ''
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  const body = typeof input.body === 'string' ? input.body : ''
  if (!EMAIL_PATTERN.test(to)) throw new HttpError(400, 'Enter a valid recipient email address.')
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) {
    throw new HttpError(400, 'Subject is required and must be 200 characters or fewer.')
  }
  if (!body.trim() || body.length > 100000) {
    throw new HttpError(400, 'Message is required and must be 100,000 characters or fewer.')
  }

  return { to, subject, body }
}
