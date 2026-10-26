const DAY_MS = 24 * 60 * 60 * 1000

export async function getDashboard(req, res) {
  const { Campaign, Contact, EmailLog } = req.models
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const startDate = new Date(today.getTime() - 29 * DAY_MS)

  const [contactRows, campaignRows, recentCampaigns, campaignIds] = await Promise.all([
    Contact.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Campaign.aggregate([
      { $match: { owner: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          accepted: { $sum: '$sentCount' },
          failed: { $sum: '$failedCount' },
        },
      },
    ]),
    Campaign.find({ owner: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('name subject status recipientCount eligibleCount queuedCount sentCount failedCount skippedCount sentAt updatedAt createdAt completedAt')
      .lean(),
    Campaign.distinct('_id', { owner: req.user._id }),
  ])

  const activityRows = campaignIds.length
    ? await EmailLog.aggregate([
      {
        $match: {
          campaignId: { $in: campaignIds },
          $or: [
            { status: 'accepted', acceptedAt: { $gte: startDate, $lte: now } },
            { status: 'failed', updatedAt: { $gte: startDate, $lte: now } },
          ],
        },
      },
      {
        $project: {
          status: 1,
          activityDate: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $cond: [{ $eq: ['$status', 'accepted'] }, '$acceptedAt', '$updatedAt'] },
              timezone: 'UTC',
            },
          },
        },
      },
      {
        $group: {
          _id: { date: '$activityDate', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ])
    : []

  const contactCounts = Object.fromEntries(contactRows.map(({ _id, count }) => [_id, count]))
  const campaignCounts = Object.fromEntries(campaignRows.map(({ _id, count }) => [_id, count]))
  const activityByDate = new Map()
  for (const { _id, count } of activityRows) {
    const day = activityByDate.get(_id.date) || { accepted: 0, failed: 0 }
    day[_id.status] = count
    activityByDate.set(_id.date, day)
  }

  const dailyActivity = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(startDate.getTime() + index * DAY_MS).toISOString().slice(0, 10)
    return { date, ...(activityByDate.get(date) || { accepted: 0, failed: 0 }) }
  })

  res.json({
    generatedAt: now.toISOString(),
    contacts: {
      total: Object.values(contactCounts).reduce((sum, count) => sum + count, 0),
      subscribed: contactCounts.Subscribed || 0,
      unsubscribed: contactCounts.Unsubscribed || 0,
      bounced: contactCounts.Bounced || 0,
      suppressed: contactCounts.Suppressed || 0,
    },
    campaigns: {
      total: campaignRows.reduce((sum, row) => sum + row.count, 0),
      active: (campaignCounts.queued || 0) + (campaignCounts.sending || 0),
      accepted: campaignRows.reduce((sum, row) => sum + row.accepted, 0),
      failed: campaignRows.reduce((sum, row) => sum + row.failed, 0),
      statuses: campaignCounts,
    },
    recentCampaigns,
    dailyActivity,
  })
}

export async function getDashboardUsage(req, res) {
  const { Campaign, EmailLog } = req.models
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const campaignIds = await Campaign.distinct('_id', { owner: req.user._id })
  const acceptedThisMonth = campaignIds.length
    ? await EmailLog.countDocuments({
      campaignId: { $in: campaignIds },
      status: 'accepted',
      acceptedAt: { $gte: monthStart, $lte: now },
    })
    : 0

  res.json({
    generatedAt: now.toISOString(),
    acceptedThisMonth,
    monthStart: monthStart.toISOString(),
  })
}
