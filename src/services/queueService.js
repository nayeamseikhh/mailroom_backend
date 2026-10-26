import User from "../models/User.js";
import { getTenantModels } from "../models/tenantModels.js";
import { sendCampaignMessage, verifySmtpConnection } from "./emailService.js";
import { getSmtpCredentials } from "./smtpCredentials.js";

const activeCampaigns = new Set();
let workerTimer;
const MAX_RETRIES = 3;
const hasUnknownOutcome = (log) => /outcome unknown/i.test(log?.error || "");

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryable(error) {
  return error.responseCode >= 400 && error.responseCode < 500;
}

export async function getCampaignRecipients(campaign, models) {
  const { Contact, ContactList } = models;
  const listIds = campaign.audienceListIds?.length
    ? campaign.audienceListIds
    : campaign.audienceListId
      ? [campaign.audienceListId]
      : [];
  if (
    listIds.length &&
    (await ContactList.countDocuments({ _id: { $in: listIds } })) !==
      listIds.length
  ) {
    throw new Error("One or more selected contact lists no longer exist.");
  }

  const explicitIds = campaign.contactIds || [];
  const manualEmails = campaign.recipients || [];
  const conditions = [];
  if (listIds.length) conditions.push({ listId: { $in: listIds } });
  if (explicitIds.length) conditions.push({ _id: { $in: explicitIds } });
  if (manualEmails.length) conditions.push({ email: { $in: manualEmails } });

  const contacts = conditions.length
    ? await Contact.find({ $or: conditions })
        .select("_id email status name company customFields listId")
        .limit(10001)
        .lean()
    : [];
  if (contacts.length > 10000) {
    throw new Error("Campaign audience exceeds the 10,000-recipient limit.");
  }
  const byEmail = new Map(
    contacts.map((contact) => [contact.email.toLowerCase(), contact]),
  );
  const selectedEmails = new Set([
    ...manualEmails.map((email) => email.toLowerCase()),
    ...contacts
      .filter(
        (contact) =>
          listIds.some((id) => String(contact.listId) === String(id)) ||
          explicitIds.some((id) => String(contact._id) === String(id)),
      )
      .map((contact) => contact.email.toLowerCase()),
  ]);

  if (selectedEmails.size > 10000) {
    throw new Error("Campaign audience exceeds the 10,000-recipient limit.");
  }

  const eligible = [];
  const skipped = [];
  for (const email of selectedEmails) {
    const contact = byEmail.get(email);
    if (!contact) {
      skipped.push({
        email,
        contactId: null,
        reason: "Contact does not exist in this account.",
      });
    } else if (contact.status !== "Subscribed") {
      skipped.push({
        email,
        contactId: contact._id,
        reason: `Contact status is ${contact.status}.`,
      });
    } else {
      eligible.push({ email, contactId: contact._id, contact });
    }
  }
  return { eligible, skipped };
}

async function refreshCampaignCounts(campaign, models) {
  const { EmailLog } = models;
  const counts = await EmailLog.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(
    counts.map(({ _id, count }) => [_id, count]),
  );
  campaign.recipientCount = counts.reduce((sum, item) => sum + item.count, 0);
  campaign.eligibleCount = [
    "queued",
    "processing",
    "accepted",
    "failed",
  ].reduce((sum, status) => sum + (byStatus[status] || 0), 0);
  campaign.queuedCount = byStatus.queued || 0;
  campaign.sentCount = byStatus.accepted || 0;
  campaign.failedCount = byStatus.failed || 0;
  campaign.skippedCount = byStatus.skipped || 0;
  await campaign.save();
}

async function processCampaign(campaignId, models) {
  const { Campaign, EmailLog } = models;
  const key = `${models.databaseName}:${campaignId}`;
  if (activeCampaigns.has(key)) return;
  activeCampaigns.add(key);

  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: campaignId, status: "queued" },
      {
        $set: {
          status: "sending",
          startedAt: new Date(),
          completedAt: null,
          lastError: "",
        },
      },
      { returnDocument: "after" },
    );
    if (!campaign) return;

    try {
      const { eligible, skipped } = await getCampaignRecipients(campaign, models);
      if (eligible.length + skipped.length > 10000) {
        throw new Error(
          "Campaign audience exceeds the 10,000-recipient limit.",
        );
      }
      for (const recipient of eligible) {
        const existing = await EmailLog.findOne({
          campaignId: campaign._id,
          recipient: recipient.email,
        });
        if (existing?.status === "accepted") continue;
        if (hasUnknownOutcome(existing)) continue;

        await EmailLog.findOneAndUpdate(
          { campaignId: campaign._id, recipient: recipient.email },
          {
            $set: {
              contactId: recipient.contactId,
              status: "queued",
              error: "",
            },
            $setOnInsert: { retryCount: 0 },
          },
          { upsert: true, setDefaultsOnInsert: true },
        );
      }
      for (const recipient of skipped) {
        await EmailLog.findOneAndUpdate(
          { campaignId: campaign._id, recipient: recipient.email },
          {
            $set: {
              contactId: recipient.contactId,
              status: "skipped",
              error: recipient.reason,
            },
            $setOnInsert: { retryCount: 0 },
          },
          { upsert: true, setDefaultsOnInsert: true },
        );
      }
      await refreshCampaignCounts(campaign, models);
      if (!eligible.length)
        throw new Error("The campaign has no eligible subscribed contacts.");
      const smtpCredentials = await getSmtpCredentials(
        models.Settings,
        models.userId,
        models.userEmail,
      );
      if (!smtpCredentials) throw new Error("Account SMTP is not configured.");
      await verifySmtpConnection(smtpCredentials, models.databaseName);

      for (const [index, recipient] of eligible.entries()) {
        const state = await Campaign.findById(campaign._id)
          .select("status")
          .lean();
        if (!state || state.status === "canceled") break;

        const log = await EmailLog.findOne({
          campaignId: campaign._id,
          recipient: recipient.email,
        });
        if (!log || log.status === "accepted" || hasUnknownOutcome(log))
          continue;

        log.status = "processing";
        log.error = "";
        await log.save();
        let delivered = false;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
          let result;
          try {
            result = await sendCampaignMessage(
              campaign,
              recipient.contact,
              undefined,
              smtpCredentials,
              models.databaseName,
            );
          } catch (error) {
            if (attempt < MAX_RETRIES && retryable(error)) {
              log.retryCount += 1;
              await log.save();
              await wait(500 * 2 ** attempt);
              continue;
            }
            log.status = "failed";
            log.error = error.message.startsWith(
              "Unresolved personalization fields:",
            )
              ? error.message.slice(0, 500)
              : `Provider send failed (${error.code || error.name || "unknown error"}).`;
            if (["ETIMEDOUT", "ECONNRESET", "ESOCKET"].includes(error.code)) {
              log.error =
                "Provider outcome unknown; not retried to avoid duplicate delivery.";
            }
            await log.save();
            console.error(
              `Campaign ${campaign._id} delivery failed:`,
              error.code || error.name,
            );
            break;
          }

          try {
            log.status = "accepted";
            log.providerMessageId = result.providerMessageId;
            log.providerResponse = String(result.providerResponse).slice(
              0,
              1000,
            );
            log.acceptedAt = new Date();
            log.sentAt = log.acceptedAt;
            log.error = "";
            await log.save();
            delivered = true;
            break;
          } catch (error) {
            log.status = "failed";
            log.error =
              "Provider outcome unknown; acceptance may have occurred. Verify before retrying.";
            await log.save().catch((saveError) => {
              console.error(
                `Campaign ${campaign._id} accepted-message result could not be recorded:`,
                saveError.code || saveError.name,
              );
            });
            console.error(
              `Campaign ${campaign._id} accepted-message result could not be recorded:`,
              error.code || error.name,
            );
            break;
          }
        }
        if (delivered) await wait(1000);
        if ((index + 1) % 10 === 0 || index === eligible.length - 1) {
          await refreshCampaignCounts(campaign, models);
        }
      }

      await refreshCampaignCounts(campaign, models);
      const canceled =
        (await Campaign.findById(campaign._id).select("status").lean())
          ?.status === "canceled";
      const unknownResults = await EmailLog.countDocuments({
        campaignId: campaign._id,
        status: "processing",
      });
      if (canceled) {
        await EmailLog.updateMany(
          { campaignId: campaign._id, status: "queued" },
          { $set: { status: "canceled" } },
        );
        campaign.status = "canceled";
        await refreshCampaignCounts(campaign, models);
      } else {
        campaign.status =
          campaign.failedCount || unknownResults
            ? campaign.sentCount
              ? "partial"
              : "failed"
            : "sent";
        if (unknownResults)
          campaign.lastError =
            "Some provider outcomes could not be recorded. Verify them before retrying.";
        campaign.sentAt = campaign.sentCount ? new Date() : null;
      }
      campaign.completedAt = new Date();
      await campaign.save();
    } catch (error) {
      campaign.status = "failed";
      campaign.lastError = error.message;
      campaign.completedAt = new Date();
      await campaign.save();
      console.error(
        `Campaign ${campaign._id} could not be processed:`,
        error.code || error.name,
      );
    }
  } finally {
    activeCampaigns.delete(key);
  }
}

async function processNextCampaign() {
  const users = await User.find({ databaseName: { $type: "string" } })
    .select("email _id +databaseName")
    .lean();
  for (const user of users) {
    const models = await getTenantModels(user);
    const campaign = await models.Campaign.findOne({ status: "queued" })
      .sort({ createdAt: 1 })
      .select("_id")
      .lean();
    if (campaign) {
      await processCampaign(campaign._id, models);
      return;
    }
  }
}

export async function enqueueCampaign(campaignId, models) {
  void processCampaign(campaignId, models).catch((error) => {
    console.error(
      `Campaign ${campaignId} could not be queued:`,
      error.code || error.name,
    );
  });
}

export async function startCampaignQueue() {
  const users = await User.find({ databaseName: { $type: "string" } })
    .select("email _id +databaseName")
    .lean();
  for (const user of users) {
    const { Campaign, EmailLog } = await getTenantModels(user);
    await EmailLog.updateMany(
      { status: "sent" },
      [
        {
          $set: {
            status: "accepted",
            acceptedAt: {
              $ifNull: ["$acceptedAt", "$sentAt"],
            },
          },
        },
      ],
      { updatePipeline: true },
    );
    await EmailLog.updateMany(
      { status: "pending" },
      {
        $set: {
          status: "failed",
          error:
            "Legacy delivery outcome unknown; not retried to avoid duplicate delivery.",
        },
      },
    );
    await EmailLog.updateMany(
      { status: "processing" },
      {
        $set: {
          status: "failed",
          error:
            "Provider outcome unknown; not retried to avoid duplicate delivery.",
        },
      },
    );
    await Campaign.updateMany(
      { status: "sending" },
      {
        $set: {
          status: "failed",
          lastError:
            "Worker stopped during delivery. Check recipient results before retrying.",
          completedAt: new Date(),
        },
      },
    );
  }
  if (workerTimer) return;

  workerTimer = setInterval(() => {
    void processNextCampaign().catch((error) => {
      console.error("Campaign queue worker failed:", error.code || error.name);
    });
  }, 1000);
  workerTimer.unref();
  void processNextCampaign().catch((error) => {
    console.error("Campaign queue worker failed:", error.code || error.name);
  });
}
