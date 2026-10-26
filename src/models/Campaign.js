import mongoose from 'mongoose'

export const campaignSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, trim: true, maxlength: 200, default: '' },
    senderName: { type: String, trim: true, maxlength: 120, default: '' },
    senderEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    recipients: { type: [String], default: [] },
    contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    replyTo: { type: String, trim: true, lowercase: true, default: '' },
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    previewText: { type: String, trim: true, maxlength: 250, default: '' },
    body: { type: String, maxlength: 100000, default: '' },
    audienceListId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContactList',
      default: null,
    },
    audienceListIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContactList',
    }],
    fallbackValues: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ name: 'there' }),
    },
    status: {
      type: String,
      enum: ['draft', 'queued', 'sending', 'sent', 'partial', 'failed', 'canceled'],
      default: 'draft',
      index: true,
    },
    recipientCount: { type: Number, default: 0 },
    eligibleCount: { type: Number, default: 0 },
    queuedCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

campaignSchema.index({ owner: 1, updatedAt: -1 })

export default mongoose.models.Campaign ||
  mongoose.model('Campaign', campaignSchema)