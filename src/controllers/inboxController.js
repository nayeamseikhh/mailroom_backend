import HttpError from '../utils/httpError.js'
import { fetchInboxMessage, fetchInboxMessages, updateInboxMessage, updateInboxMessages } from '../services/inboxService.js'
import { getImapCredentials } from '../services/imapCredentials.js'
import { validateInboxAction, validateInboxFolder } from '../utils/inboxValidation.js'

async function accountImapCredentials(req) {
  const credentials = await getImapCredentials(req.models.Settings, req.user._id)
  if (!credentials) throw new HttpError(503, 'Connect an IMAP mailbox in Sending settings to use Inbox.')
  return credentials
}

export async function getInboxMessages(req, res) {
  const beforeUid = req.query.before ? Number(req.query.before) : undefined
  if (beforeUid !== undefined && (!Number.isSafeInteger(beforeUid) || beforeUid < 1)) {
    throw new HttpError(400, 'Invalid inbox page cursor.')
  }
  const folder = validateInboxFolder(req.query.folder)

  try {
    const credentials = await accountImapCredentials(req)
    res.json(await fetchInboxMessages(beforeUid, folder, credentials))
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.error('IMAP inbox request failed:', error.code || error.name)
    throw new HttpError(502, 'Could not connect to the configured inbox. Check the IMAP settings.')
  }
}

export async function getInboxMessage(req, res) {
  const uid = Number(req.params.uid)
  if (!Number.isSafeInteger(uid) || uid < 1) {
    throw new HttpError(400, 'Invalid email ID.')
  }
  const folder = validateInboxFolder(req.query.folder)

  try {
    const credentials = await accountImapCredentials(req)
    const message = await fetchInboxMessage(uid, folder, credentials)
    if (!message) throw new HttpError(404, 'Email not found in the configured inbox.')
    res.json({ message })
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.error('IMAP email request failed:', error.code || error.name)
    throw new HttpError(502, 'Could not load this email. Check the IMAP connection and try again.')
  }
}

export async function actOnInboxMessage(req, res) {
  const uid = Number(req.params.uid)
  if (!Number.isSafeInteger(uid) || uid < 1) {
    throw new HttpError(400, 'Invalid email ID.')
  }
  const { action, folder } = validateInboxAction(req.body)

  try {
    const credentials = await accountImapCredentials(req)
    await updateInboxMessage(uid, action, folder, credentials)
    res.json({ success: true })
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.error('IMAP email action failed:', error.code || error.name)
    throw new HttpError(502, 'Could not update this email. Check the IMAP connection and try again.')
  }
}

export async function actOnInboxMessages(req, res) {
  const { action, folder, uids } = validateInboxAction(req.body)
  if (!uids) throw new HttpError(400, 'Select at least one email.')

  try {
    const credentials = await accountImapCredentials(req)
    res.json(await updateInboxMessages(uids, action, folder, credentials))
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.error('IMAP bulk email action failed:', error.code || error.name)
    throw new HttpError(502, 'Could not update selected emails. Check the IMAP connection and try again.')
  }
}

export async function sendInboxEmail(_req, _res) {
  throw new HttpError(503, 'Inbox sending is disabled until account-specific mailbox support is available.')
}
