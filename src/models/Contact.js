import mongoose from 'mongoose'

export const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      unique: true,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
      default: '',
    },
    status: {
      type: String,
      enum: ['Subscribed', 'Unsubscribed', 'Bounced', 'Suppressed'],
      default: 'Subscribed',
    },
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContactList',
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags) => tags.length <= 30 && tags.every((tag) => tag.length <= 40),
        message: 'A contact can have at most 30 tags, each 40 characters or fewer.',
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    source: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Manual',
    },
  },
  { timestamps: true },
)

// Indexes for the filters and sorting the contacts page actually uses.
contactSchema.index({ status: 1 })
contactSchema.index({ listId: 1 })
contactSchema.index({ createdAt: -1 })
contactSchema.index({ listId: 1, status: 1 })
contactSchema.index({ name: 1 })
contactSchema.index({ company: 1 })

export default mongoose.models.Contact ||
  mongoose.model('Contact', contactSchema)
