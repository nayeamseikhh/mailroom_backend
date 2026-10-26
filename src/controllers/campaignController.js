import HttpError from '../utils/httpError.js'
import { validateCampaignInput } from '../utils/campaignValidation.js'
import { renderPersonalization } from '../utils/personalization.js'
import {
  getSenderAddress,
  isSmtpConfigured,
  verifySmtpConnection,
  sendCampaignMessage,
} from '../services/emailService.js'
import { enqueueCampaign, getCampaignRecipients } from '../services/queueService.js'
import { getSmtpCredentials } from '../services/smtpCredentials.js'

function campaignForOwner(Campaign, id, owner) {
  return Campaign.findOne({ _id: id, owner })
}

async function ensureCampaignListsExist(ContactList, input) {
  const listIds = input.audienceListIds ||
    (input.audienceListId ? [input.audienceListId] : [])
  if (listIds.length && (await ContactList.countDocuments({ _id: { $in: listIds } })) !== listIds.length) {
    throw new HttpError(400, 'One or more selected contact lists do not exist.')
  }
}

function normalizeCampaignLists(input) {
  if (input.audienceListIds !== undefined) {
    input.audienceListId = input.audienceListIds[0] || null
  } else if (input.audienceListId !== undefined) {
    input.audienceListIds = input.audienceListId ? [input.audienceListId] : []
  }
}

export async function getCampaigns(req, res) {
  const { Campaign } = req.models
  const campaigns = await Campaign.aggregate([
    { $match: { owner: req.user._id } },
    { $sort: { updatedAt: -1 } },
    { $limit: 100 },
    {
      $project: {
        name: 1,
        subject: 1,
        status: 1,
        recipientCount: 1,
        manualRecipientCount: { $size: { $ifNull: ['$recipients', []] } },
        sentCount: 1,
        failedCount: 1,
        eligibleCount: 1,
        queuedCount: 1,
        skippedCount: 1,
        startedAt: 1,
        completedAt: 1,
        lastError: 1,
        sentAt: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ])
  res.json({ campaigns })
}

export async function getCampaign(req, res) {
  const campaign = await campaignForOwner(req.models.Campaign, req.params.id, req.user._id).lean()
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  res.json({ campaign })
}

export async function getCampaignReadiness(req, res) {
  const smtpCredentials = await getSmtpCredentials(
    req.models.Settings,
    req.user._id,
    req.user.email,
  )
  const smtpConfigured = isSmtpConfigured(smtpCredentials)
  if (!smtpConfigured) {
    res.json({
      smtpConfigured: false,
      smtpConnected: false,
      verifiedSender: '',
    })
    return
  }

  try {
    await verifySmtpConnection(smtpCredentials, req.models.databaseName)
    res.json({
      smtpConfigured: true,
      smtpConnected: true,
      verifiedSender: getSenderAddress(smtpCredentials),
    })
  } catch (error) {
    console.error('SMTP readiness check failed:', error.code || error.name, error.message)
    const authenticationFailure =
      error.code === 'EAUTH' ||
      error.responseCode === 535 ||
      /5\.7\.[0-9]+/.test(error.response || '')
    const reason = authenticationFailure
      ? smtpCredentials.host === 'smtp.gmail.com'
        ? 'Gmail rejected the SMTP login. For Gmail, use your full email address as username and create a 16-character Google App Password (with 2-Step Verification enabled).'
        : 'The SMTP server rejected your username or password. Check your credentials in Settings > Sending.'
      : error.code === 'ESOCKET'
        ? 'The SMTP server closed the secure connection. Check your port and TLS setting (Port 587 with TLS off, or Port 465 with TLS on).'
        : ['ETIMEDOUT', 'ECONNECTION', 'EDNS'].includes(error.code)
          ? `Could not reach ${smtpCredentials.host}:${smtpCredentials.port}. Check host, port, or network access.`
          : (error.message || 'Could not verify the SMTP connection.')

    res.json({
      smtpConfigured: true,
      smtpConnected: false,
      verifiedSender: getSenderAddress(smtpCredentials),
      error: reason,
    })
  }
}

export async function createCampaign(req, res) {
  const { Campaign, ContactList } = req.models
  const input = validateCampaignInput(req.body)
  normalizeCampaignLists(input)
  await ensureCampaignListsExist(ContactList, input)

  const campaign = await Campaign.create({
    ...input,
    owner: req.user._id,
    name: input.name || input.subject || 'Untitled campaign',
  })
  res.status(201).json({ campaign })
}

export async function updateCampaign(req, res) {
  const { Campaign, ContactList } = req.models
  const input = validateCampaignInput(req.body, { partial: true })
  normalizeCampaignLists(input)
  await ensureCampaignListsExist(ContactList, input)

  if (input.subject !== undefined && input.name === undefined) {
    input.name = input.subject || 'Untitled campaign'
  }
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, status: 'draft' },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  )
  if (!campaign) {
    const exists = await Campaign.exists({ _id: req.params.id, owner: req.user._id })
    if (!exists) throw new HttpError(404, 'Campaign not found.')
    throw new HttpError(409, 'Only draft campaigns can be edited.')
  }
  res.json({ campaign })
}

export async function deleteCampaign(req, res) {
  const { Campaign } = req.models
  const campaign = await Campaign.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id,
    status: 'draft',
  })
  if (!campaign) {
    const exists = await Campaign.exists({ _id: req.params.id, owner: req.user._id })
    if (!exists) throw new HttpError(404, 'Campaign not found.')
    throw new HttpError(409, 'Only draft campaigns can be deleted.')
  }
  res.status(204).end()
}

export async function sendCampaign(req, res) {
  const { Campaign } = req.models
  const smtpCredentials = await getSmtpCredentials(
    req.models.Settings,
    req.user._id,
    req.user.email,
  )
  if (!isSmtpConfigured(smtpCredentials)) {
    throw new HttpError(503, 'Email delivery is not configured. Add your account SMTP settings first.')
  }

  const campaign = await campaignForOwner(Campaign, req.params.id, req.user._id)
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  if (campaign.status !== 'draft' && campaign.status !== 'failed') {
    throw new HttpError(409, 'This campaign has already been queued or sent.')
  }
  if (!campaign.subject.trim() || !campaign.body.trim()) {
    throw new HttpError(400, 'A subject line and email content are required before sending.')
  }
  if (
    !campaign.senderName.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campaign.senderEmail)
  ) {
    throw new HttpError(400, 'A valid sender name and email address are required before sending.')
  }
  if (campaign.senderEmail.toLowerCase() !== getSenderAddress(smtpCredentials)) {
    throw new HttpError(400, 'Sender email must match the sender address configured in your SMTP settings.')
  }
  if (!campaign.contactIds.length && !campaign.recipients.length &&
    !campaign.audienceListId && !campaign.audienceListIds.length) {
    throw new HttpError(400, 'Select a contact list or individual contacts before sending.')
  }

  const { eligible, skipped } = await getCampaignRecipients(campaign, req.models)
  if (eligible.length + skipped.length > 10000) {
    throw new HttpError(400, 'Campaign audiences are limited to 10,000 contacts.')
  }
  if (!eligible.length) {
    throw new HttpError(400, 'The selected audience has no subscribed contacts.')
  }
  const unresolved = new Set()
  for (const { contact } of eligible) {
    for (const field of ['subject', 'body', 'previewText']) {
      const result = renderPersonalization(campaign[field] || '', contact, campaign.fallbackValues)
      result.unresolved.forEach((name) => unresolved.add(`{{${name}}}`))
    }
  }
  if (unresolved.size) {
    throw new HttpError(400, `Resolve missing personalization values before sending: ${[...unresolved].join(', ')}.`)
  }

  const queuedCampaign = await Campaign.findOneAndUpdate(
    {
      _id: campaign._id,
      owner: req.user._id,
      status: { $in: ['draft', 'failed'] },
    },
    {
      $set: {
        status: 'queued',
        sentCount: 0,
        failedCount: 0,
        recipientCount: 0,
        eligibleCount: 0,
        queuedCount: 0,
        sentAt: null,
        startedAt: null,
        completedAt: null,
        lastError: '',
      },
    },
    { returnDocument: 'after' },
  )
  if (!queuedCampaign) {
    throw new HttpError(409, 'This campaign has already been queued or sent.')
  }

  await enqueueCampaign(queuedCampaign._id, req.models)
  res.status(202).json({ campaign: queuedCampaign, message: 'Campaign queued for delivery.' })
}

export async function previewCampaign(req, res) {
  const campaign = await campaignForOwner(req.models.Campaign, req.params.id, req.user._id).lean()
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  const { eligible, skipped } = await getCampaignRecipients(campaign, req.models)
  const unresolved = new Set()
  for (const { contact } of eligible) {
    for (const field of ['subject', 'body', 'previewText']) {
      renderPersonalization(campaign[field] || '', contact, campaign.fallbackValues)
        .unresolved.forEach((name) => unresolved.add(`{{${name}}}`))
    }
  }
  const sampleContact = eligible[0]?.contact || null
  const sample = Object.fromEntries(['subject', 'body', 'previewText'].map((field) => [
    field,
    renderPersonalization(campaign[field] || '', sampleContact, campaign.fallbackValues).rendered,
  ]))
  res.json({
    selectedCount: eligible.length + skipped.length,
    eligibleCount: eligible.length,
    skippedCount: skipped.length,
    skippedReasons: Object.fromEntries(
      [...new Set(skipped.map(({ reason }) => reason))]
        .map((reason) => [reason, skipped.filter((item) => item.reason === reason).length]),
    ),
    unresolved: [...unresolved],
    sample,
  })
}

export async function getCampaignReport(req, res) {
  const { Campaign, EmailLog } = req.models
  const campaign = await campaignForOwner(Campaign, req.params.id, req.user._id).lean()
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50))
  const [logs, total, grouped] = await Promise.all([
    EmailLog.find({ campaignId: campaign._id })
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('recipient status error retryCount providerMessageId acceptedAt sentAt updatedAt')
      .lean(),
    EmailLog.countDocuments({ campaignId: campaign._id }),
    EmailLog.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ])
  res.json({
    campaign,
    counts: Object.fromEntries(grouped.map(({ _id, count }) => [_id, count])),
    recipients: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}

export async function cancelCampaign(req, res) {
  const { Campaign, EmailLog } = req.models
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, status: { $in: ['queued', 'sending'] } },
    { $set: { status: 'canceled', completedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!campaign) {
    const exists = await Campaign.exists({ _id: req.params.id, owner: req.user._id })
    if (!exists) throw new HttpError(404, 'Campaign not found.')
    throw new HttpError(409, 'This campaign can no longer be canceled.')
  }
  await EmailLog.updateMany(
    { campaignId: campaign._id, status: 'queued' },
    { $set: { status: 'canceled' } },
  )
  res.json({ campaign })
}

export async function sendCampaignTest(req, res) {
  const { Campaign, Contact } = req.models
  const campaign = await campaignForOwner(Campaign, req.params.id, req.user._id)
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  const smtpCredentials = await getSmtpCredentials(
    req.models.Settings,
    req.user._id,
    req.user.email,
  )
  if (!isSmtpConfigured(smtpCredentials)) {
    throw new HttpError(503, 'Email delivery is not configured. Add your account SMTP settings first.')
  }
  const to = typeof req.body?.to === 'string' ? req.body.to.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new HttpError(400, 'Enter a valid test email address.')
  }
  if (!campaign.senderName.trim() || !campaign.subject.trim() || !campaign.body.trim()) {
    throw new HttpError(400, 'Add a sender name, subject, and email content before sending a test.')
  }
  let sampleContact = null
  if (req.body.contactId) {
    if (!/^[a-f\d]{24}$/i.test(req.body.contactId)) throw new HttpError(400, 'Sample contact ID is invalid.')
    sampleContact = await Contact.findById(req.body.contactId).lean()
    if (!sampleContact) throw new HttpError(404, 'Sample contact not found.')
  }
  if (campaign.senderEmail.toLowerCase() !== getSenderAddress(smtpCredentials)) {
    throw new HttpError(400, 'Sender email must match the sender address configured in your SMTP settings.')
  }
  await verifySmtpConnection(smtpCredentials, req.models.databaseName)
  const result = await sendCampaignMessage(
    campaign,
    sampleContact || to,
    to,
    smtpCredentials,
    req.models.databaseName,
  )
  res.json({ accepted: result.accepted, providerMessageId: result.providerMessageId })
}