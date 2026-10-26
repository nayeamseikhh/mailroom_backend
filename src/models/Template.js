import mongoose from 'mongoose'

export const templateSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, trim: true, maxlength: 80, default: 'General' },
    color: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: '#E4E8FF' },
    accent: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: '#4F6DFF' },
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    previewText: { type: String, trim: true, maxlength: 250, default: '' },
    body: { type: String, maxlength: 100000, default: '' },
    blocks: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: ['text', 'button'],
    },
  },
  { timestamps: true },
)

templateSchema.index({ owner: 1, updatedAt: -1 })

export default mongoose.models.Template ||
  mongoose.model('Template', templateSchema)