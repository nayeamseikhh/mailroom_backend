const DAY_MS = 24 * 60 * 60 * 1000
const PERIOD_DAYS = new Set([7, 30, 90])

export async function getReports(req, res) {
  const requestedDays = Number.parseInt(req.query.days, 10) || 30
  const days = PERIOD_DAYS.has(requestedDays) ? requestedDays : 30
  const now = new Date()
  const endDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ))
  const startDate = new Date(endDate.getTime() - days * DAY_MS)
  const { Campaign, EmailLog } = req.models
  const campaignIds = await Campaign.distinct('_id', { owner: req.user._id })

  const logs = campaignIds.length
    ? await EmailLog.aggregate([
      {
        $match: {
          campaignId: { $in: campaignIds },
          $or: [
            { status: 'accepted', acceptedAt: { $gte: startDate, $lt: endDate } },
            { status: 'failed', updatedAt: { $gte: startDate, $lt: endDate } },
          ],
        },
      },
      {
        $project: {
          campaignId: 1,
          status: 1,
          activityDate: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $cond: [{ $eq: ['$status', 'accepted'] }, '$acceptedAt', '$updatedAt'] },
              timezone: 'UTC',
            },
          },
          activityAt: {
            $cond: [{ $eq: ['$status', 'accepted'] }, '$acceptedAt', '$updatedAt'],
          },
        },
      },
      {
        $group: {
          _id: { campaignId: '$campaignId', status: '$status', date: '$activityDate' },
          count: { $sum: 1 },
          lastActivityAt: { $max: '$activityAt' },
        },
      },
    ])
    : []

  const campaignsById = new Map()
  const acceptedByDate = new Map()
  let accepted = 0
  let failed = 0
  for (const { _id, count, lastActivityAt } of logs) {
    const id = String(_id.campaignId)
    const campaign = campaignsById.get(id) || {
      accepted: 0,
      failed: 0,
      lastActivityAt: null,
    }
    campaign[_id.status] += count
    if (!campaign.lastActivityAt || lastActivityAt > campaign.lastActivityAt) {
      campaign.lastActivityAt = lastActivityAt
    }
    campaignsById.set(id, campaign)
    if (_id.status === 'accepted') {
      accepted += count
      acceptedByDate.set(
        _id.date,
        (acceptedByDate.get(_id.date) || 0) + count,
      )
    } else {
      failed += count
    }
  }

  const campaignDocuments = campaignsById.size
    ? await Campaign.find({
      _id: { $in: [...campaignsById.keys()] },
      owner: req.user._id,
    })
      .select('name subject')
      .lean()
    : []
  const campaigns = campaignDocuments.map((campaign) => {
    const counts = campaignsById.get(String(campaign._id))
    const attempted = counts.accepted + counts.failed
    return {
      _id: campaign._id,
      name: campaign.name || campaign.subject || 'Untitled campaign',
      accepted: counts.accepted,
      failed: counts.failed,
      lastActivityAt: counts.lastActivityAt,
      acceptanceRate: attempted ? Math.round((counts.accepted / attempted) * 1000) / 10 : 0,
    }
  }).sort((a, b) => new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0))

  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate.getTime() + index * DAY_MS)
      .toISOString()
      .slice(0, 10)
    return { date, accepted: acceptedByDate.get(date) || 0 }
  })
  const attempted = accepted + failed

  res.json({
    period: { days, startDate: startDate.toISOString(), endDate: now.toISOString() },
    summary: {
      accepted,
      failed,
      attempted,
      campaigns: campaigns.length,
      acceptanceRate: attempted ? Math.round((accepted / attempted) * 1000) / 10 : 0,
    },
    daily,
    campaigns,
  })
}