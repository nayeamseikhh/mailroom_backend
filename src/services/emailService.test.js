import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSenderAddress,
  isSmtpConfigured,
  sendCampaignMessage,
  setTransportForTesting,
} from './emailService.js'

const smtpCredentials = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  username: 'account-user',
  password: 'private-app-password',
  senderEmail: 'sender@example.com',
}

function allowTestSmtpHost() {
  const previous = process.env.SMTP_ALLOWED_HOSTS
  process.env.SMTP_ALLOWED_HOSTS = 'smtp.example.com'
  return () => {
    if (previous === undefined) delete process.env.SMTP_ALLOWED_HOSTS
    else process.env.SMTP_ALLOWED_HOSTS = previous
  }
}

test('uses the sender address and SMTP configuration from the account', () => {
  const restoreHost = allowTestSmtpHost()
  try {
    assert.equal(getSenderAddress(smtpCredentials), 'sender@example.com')
    assert.equal(isSmtpConfigured(smtpCredentials), true)
    assert.equal(isSmtpConfigured(null), false)
  } finally {
    restoreHost()
  }
})

test('personalizes each send and records provider acceptance using a mocked transport', async () => {
  const restoreHost = allowTestSmtpHost()
  let captured
  const restoreTransport = setTransportForTesting({
    sendMail: async (message) => {
      captured = message
      return {
        accepted: [message.to],
        messageId: 'provider-message-id',
        response: '250 accepted',
      }
    },
  })
  try {
    const result = await sendCampaignMessage(
      {
        senderName: 'Mailroom',
        subject: 'A question for {{companyName}}',
        body: 'Hello {{name}},\n{{customFields.industry}}',
        previewText: '',
        fallbackValues: { name: 'there' },
        cc: [],
        bcc: [],
      },
      {
        name: '<Casey>',
        email: 'casey@example.com',
        company: 'Example Co',
        customFields: { industry: 'Retail' },
      },
      undefined,
      smtpCredentials,
      'tenant-one',
    )
    assert.equal(result.accepted, true)
    assert.equal(result.providerMessageId, 'provider-message-id')
    assert.equal(captured.from.address, 'sender@example.com')
    assert.equal(captured.subject, 'A question for Example Co')
    assert.equal(captured.text, 'Hello <Casey>,\nRetail')
    assert.match(captured.html, /&lt;Casey&gt;/)
  } finally {
    restoreTransport()
    restoreHost()
  }
})

test('does not report a provider response without recipient acceptance', async () => {
  const restoreHost = allowTestSmtpHost()
  const restoreTransport = setTransportForTesting({
    sendMail: async () => ({ accepted: [], messageId: 'not-accepted' }),
  })
  try {
    await assert.rejects(
      sendCampaignMessage(
        {
          senderName: 'Mailroom',
          subject: 'Hello',
          body: 'World',
          cc: [],
          bcc: [],
        },
        'person@example.com',
        undefined,
        smtpCredentials,
        'tenant-one',
      ),
      /did not accept/,
    )
  } finally {
    restoreTransport()
    restoreHost()
  }
})
