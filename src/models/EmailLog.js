import mongoose from 'mongoose'

export const emailLogSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    recipient: { type: String, required: true, lowercase: true, trim: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    status: {
      type: String,
      enum: ['queued', 'processing', 'accepted', 'failed', 'skipped', 'canceled'],
      default: 'queued',
    },
    error: { type: String, default: '' },
    retryCount: { type: Number, default: 0 },
    providerMessageId: { type: String, default: '' },
    providerResponse: { type: String, maxlength: 1000, default: '' },
    acceptedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
)

emailLogSchema.index({ campaignId: 1, recipient: 1 }, { unique: true })
emailLogSchema.index({ campaignId: 1, status: 1 })
emailLogSchema.index({ campaignId: 1, contactId: 1 })

export default mongoose.models.EmailLog ||
  mongoose.model('EmailLog', emailLogSchema)