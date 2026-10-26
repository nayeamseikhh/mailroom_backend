import test from 'node:test'
import assert from 'node:assert/strict'
import { getReports } from './reportController.js'

test('getReports returns date-bounded message counts grouped by campaign', async () => {
  const campaignId = 'campaign-1'
  const today = new Date().toISOString().slice(0, 10)
  const acceptedAt = new Date()
  let response
  const req = {
    query: { days: '7' },
    user: { _id: 'owner-1' },
    models: {
      Campaign: {
        async distinct(field, filter) {
          assert.equal(field, '_id')
          assert.deepEqual(filter, { owner: 'owner-1' })
          return [campaignId]
        },
        find(filter) {
          assert.deepEqual(filter, {
            _id: { $in: [campaignId] },
            owner: 'owner-1',
          })
          return {
            select(fields) {
              assert.equal(fields, 'name subject')
              return {
                async lean() {
                  return [{ _id: campaignId, name: 'Welcome', subject: 'Hello' }]
                },
              }
            },
          }
        },
      },
      EmailLog: {
        async aggregate(pipeline) {
          assert.deepEqual(pipeline[0].$match.campaignId, { $in: [campaignId] })
          return [
            {
              _id: { campaignId, status: 'accepted', date: today },
              count: 4,
              lastActivityAt: acceptedAt,
            },
            {
              _id: { campaignId, status: 'failed', date: today },
              count: 1,
              lastActivityAt: new Date(acceptedAt.getTime() + 1000),
            },
          ]
        },
      },
    },
  }
  const res = {
    json(value) {
      response = value
    },
  }

  await getReports(req, res)

  assert.equal(response.period.days, 7)
  assert.equal(response.daily.length, 7)
  assert.equal(response.daily.at(-1).date, today)
  assert.equal(response.daily.at(-1).accepted, 4)
  assert.deepEqual(response.summary, {
    accepted: 4,
    failed: 1,
    attempted: 5,
    campaigns: 1,
    acceptanceRate: 80,
  })
  assert.equal(response.campaigns[0].name, 'Welcome')
  assert.equal(response.campaigns[0].acceptanceRate, 80)
  assert.equal(response.campaigns[0].lastActivityAt.toISOString(), new Date(acceptedAt.getTime() + 1000).toISOString())
})
