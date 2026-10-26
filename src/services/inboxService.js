import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import HttpError from '../utils/httpError.js'

const MESSAGE_LIST_LIMIT = 50
const MESSAGE_BODY_LIMIT = 50000

export function getImapConfig(environment = process.env) {
  if (environment.host) {
    return {
      host: environment.host,
      port: environment.port,
      secure: environment.secure,
      user: environment.username,
      password: environment.password,
      mailbox: environment.mailbox || 'INBOX',
    }
  }
  const { IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASSWORD, IMAP_MAILBOX } = environment
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASSWORD) {
    throw new HttpError(
      503,
      'Inbox is not configured. Connect an IMAP mailbox in Sending settings.',
    )
  }

  const port = Number(IMAP_PORT || 993)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(503, 'IMAP_PORT must be a valid TCP port.')
  }

  let secure = port === 993
  if (IMAP_SECURE !== undefined && IMAP_SECURE !== '') {
    if (!['true', 'false'].includes(IMAP_SECURE.toLowerCase())) {
      throw new HttpError(503, 'IMAP_SECURE must be true or false.')
    }
    secure = IMAP_SECURE.toLowerCase() === 'true'
  }

  return {
    host: IMAP_HOST,
    port,
    secure,
    user: IMAP_USER,
    password: IMAP_PASSWORD,
    mailbox: IMAP_MAILBOX?.trim() || 'INBOX',
  }
}

const SPECIAL_USE = {
  inbox: '\\Inbox',
  sent: '\\Sent',
  all: '\\All',
  spam: '\\Junk',
  trash: '\\Trash',
}

function fallbackMailboxMatch(folder, mailbox) {
  const path = mailbox.path.toLowerCase()
  const name = mailbox.name.toLowerCase()
  const candidates = {
    inbox: ['inbox'],
    sent: ['sent', 'sent mail', 'sent items'],
    all: ['all', 'all mail', '[gmail]/all mail'],
    spam: ['spam', 'junk', '[gmail]/spam', '[gmail]/junk email'],
    trash: ['trash', 'deleted', 'deleted items', '[gmail]/trash'],
  }
  return candidates[folder].some((candidate) => path === candidate || name === candidate)
}

async function resolveMailbox(client, folder, configuredInbox) {
  const mailboxes = await client.list()
  const specialMailbox = mailboxes.find(
    (mailbox) => mailbox.specialUse?.toLowerCase() === SPECIAL_USE[folder].toLowerCase(),
  )
  if (specialMailbox) return specialMailbox.path

  if (folder === 'inbox') return configuredInbox

  const fallback = mailboxes.find((mailbox) => fallbackMailboxMatch(folder, mailbox))
  if (fallback) return fallback.path

  throw new HttpError(503, `Your email provider does not expose a ${folder} folder over IMAP.`)
}

async function withInbox(callback, { folder = 'inbox', readOnly = true, credentials } = {}) {
  const config = getImapConfig(credentials)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    maxLiteralSize: 5 * 1024 * 1024,
    disableAutoIdle: true,
  })

  let connected = false
  try {
    await client.connect()
    connected = true
    const mailbox = await resolveMailbox(client, folder, config.mailbox)
    await client.mailboxOpen(mailbox, { readOnly })
    return await callback(client, mailbox)
  } finally {
    if (connected) await client.logout()
    else client.close()
  }
}

function addressFrom(addresses = []) {
  const address = addresses[0]
  return address
    ? { name: address.name || '', address: address.address || '' }
    : { name: '', address: '' }
}

function messageSummary(message) {
  return {
    uid: message.uid,
    subject: message.envelope?.subject || '(No subject)',
    from: addressFrom(message.envelope?.from),
    to: addressFrom(message.envelope?.to),
    date: message.envelope?.date || message.internalDate || null,
    unread: !message.flags?.has('\\Seen'),
  }
}

export async function testImapConnection(credentials) {
  return withInbox(async (_client, mailbox) => ({ mailbox }), { credentials })
}

export async function fetchInboxMessages(beforeUid, folder = 'inbox', credentials) {
  return withInbox(async (client) => {
    const uids = await client.search({ all: true }, { uid: true })
    const pageUids = uids
      .filter((uid) => beforeUid === undefined || uid < beforeUid)
      .sort((left, right) => right - left)
      .slice(0, MESSAGE_LIST_LIMIT)
    if (!pageUids.length) return { messages: [], nextBefore: null }

    const messages = await client.fetchAll(
      pageUids,
      { uid: true, envelope: true, flags: true, internalDate: true },
      { uid: true },
    )
    const hasOlder = uids.some((uid) => uid < pageUids.at(-1))
    return {
      messages: messages.map(messageSummary).sort((left, right) => right.uid - left.uid),
      nextBefore: hasOlder ? pageUids.at(-1) : null,
    }
  }, { folder, credentials })
}

export async function fetchInboxMessage(uid, folder = 'inbox', credentials) {
  return withInbox(async (client) => {
    const message = await client.fetchOne(
      uid,
      { uid: true, envelope: true, internalDate: true, source: true },
      { uid: true },
    )
    if (!message) return null

    const parsed = await simpleParser(message.source)
    return {
      ...messageSummary(message),
      from: parsed.from?.value?.[0]
        ? { name: parsed.from.value[0].name || '', address: parsed.from.value[0].address || '' }
        : messageSummary(message).from,
      to: parsed.to?.value?.[0]
        ? { name: parsed.to.value[0].name || '', address: parsed.to.value[0].address || '' }
        : messageSummary(message).to,
      subject: parsed.subject || message.envelope?.subject || '(No subject)',
      date: parsed.date || message.internalDate || null,
      text: (parsed.text || '').slice(0, MESSAGE_BODY_LIMIT),
      truncated: (parsed.text || '').length > MESSAGE_BODY_LIMIT,
    }
  }, { folder, credentials })
}

export async function updateInboxMessages(uids, action, folder = 'inbox', credentials) {
  return withInbox(async (client) => {
    if (action === 'deleteForever') {
      if (folder !== 'trash' && folder !== 'spam') {
        throw new HttpError(400, 'Emails can only be permanently deleted from Trash or Spam.')
      }
    }

    const targetFolder = {
      archive: 'all',
      trash: 'trash',
      spam: 'spam',
      restore: 'inbox',
    }[action]
    if (action !== 'deleteForever' && !targetFolder) throw new HttpError(400, 'Unsupported inbox action.')
    const destination = targetFolder && targetFolder !== folder
      ? await resolveMailbox(client, targetFolder, getImapConfig().mailbox)
      : null
    const updated = []
    const failed = []

    for (const uid of uids) {
      try {
        if (action === 'deleteForever') {
          await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true })
          await client.messageDelete(uid, { uid: true })
        } else if (destination) {
          const result = await client.messageMove(uid, destination, { uid: true })
          if (!result) throw new HttpError(404, 'Email not found in this folder.')
        }
        updated.push(uid)
      } catch (error) {
        failed.push({ uid, message: error instanceof HttpError ? error.message : 'Could not update email.' })
      }
    }
    return { updated, failed }
  }, { folder, readOnly: false, credentials })
}

export async function updateInboxMessage(uid, action, folder = 'inbox', credentials) {
  const result = await updateInboxMessages([uid], action, folder, credentials)
  if (result.failed.length) throw new HttpError(502, result.failed[0].message)
}
