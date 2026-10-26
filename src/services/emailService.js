import { createHash } from 'node:crypto'
import addressparser from 'nodemailer/lib/addressparser/index.js'
import { createMailerTransport } from '../config/mailer.js'
import { renderPersonalization } from '../utils/personalization.js'
import { validateSmtpCredentials } from './smtpCredentials.js'

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const MAX_CACHED_TRANSPORTS = 100
const transports = new Map()
let transportOverride

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
}

export function isSmtpConfigured(credentials) {
  return Boolean(
    credentials?.host &&
    credentials?.username &&
    credentials?.password &&
    Number.isInteger(credentials?.port) &&
    credentials.port > 0 &&
    credentials.port <= 65535 &&
    getSenderAddress(credentials),
  )
}

export function getSenderAddress(credentials) {
  const parsed = addressparser(credentials?.senderEmail?.trim() || '')
  if (parsed.length !== 1) return ''
  const address = parsed[0].address?.trim().toLowerCase() || ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : ''
}

function closeTransport(transport) {
  if (typeof transport?.close === 'function') transport.close()
}

export function closeSmtpTransport(transportKey) {
  const cached = transports.get(transportKey)
  if (!cached) return
  transports.delete(transportKey)
  closeTransport(cached.transport)
}

function getTransport(credentials, transportKey) {
  if (transportOverride) return transportOverride
  if (!isSmtpConfigured(credentials)) throw new Error('Account SMTP is not configured.')
  if (typeof transportKey !== 'string' || !transportKey) {
    throw new Error('An account transport key is required.')
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify(credentials))
    .digest('hex')
  const cached = transports.get(transportKey)
  if (cached?.fingerprint === fingerprint) {
    transports.delete(transportKey)
    transports.set(transportKey, cached)
    return cached.transport
  }
  if (cached) closeTransport(cached.transport)

  const transport = createMailerTransport(credentials)
  transports.delete(transportKey)
  transports.set(transportKey, { fingerprint, transport })
  if (transports.size > MAX_CACHED_TRANSPORTS) {
    const [oldestKey, oldest] = transports.entries().next().value
    transports.delete(oldestKey)
    closeTransport(oldest.transport)
  }
  return transport
}

export function setTransportForTesting(nextTransport) {
  const previous = transportOverride
  transportOverride = nextTransport
  return () => {
    transportOverride = previous
  }
}

export async function verifySmtpConnection(credentials, transportKey) {
  const valid = validateSmtpCredentials(credentials)
  await getTransport(valid, transportKey).verify()
}

export async function sendCampaignMessage(
  campaign,
  contactOrEmail,
  recipientOverride,
  smtpCredentials,
  transportKey,
) {
  const contact = typeof contactOrEmail === 'string' ? null : contactOrEmail
  const recipient = recipientOverride ||
    (typeof contactOrEmail === 'string' ? contactOrEmail : contact.email)
  const fields = ['subject', 'body', 'previewText']
    .map((field) => [field, renderPersonalization(campaign[field] || '', contact, campaign.fallbackValues)])
  const unresolved = fields.flatMap(([field, result]) => result.unresolved.map((name) => `${field}: {{${name}}}`))
  if (unresolved.length) {
    throw new Error(`Unresolved personalization fields: ${[...new Set(unresolved)].join(', ')}`)
  }
  const rendered = Object.fromEntries(fields.map(([field, result]) => [field, result.rendered]))
  const preheader = rendered.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(rendered.previewText)}</div>`
    : ''
  const html = `${preheader}<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(rendered.body)}</div>`
  const credentials = validateSmtpCredentials(smtpCredentials)
  const info = await getTransport(credentials, transportKey).sendMail({
    from: {
      name: campaign.senderName,
      address: getSenderAddress(credentials),
    },
    to: recipient,
    cc: campaign.cc.length ? campaign.cc.join(', ') : undefined,
    bcc: campaign.bcc.length ? campaign.bcc.join(', ') : undefined,
    replyTo: campaign.replyTo || undefined,
    subject: rendered.subject,
    text: rendered.body,
    html,
  })
  const accepted = Array.isArray(info.accepted) &&
    info.accepted.some((address) => String(address.address || address).toLowerCase() === recipient.toLowerCase())
  if (!accepted) throw new Error('The email provider did not accept this recipient.')
  return { accepted, providerMessageId: info.messageId || '', providerResponse: info.response || '' }
}
