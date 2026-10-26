import mongoose from 'mongoose'

export const contactListSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    nameKey: {
      type: String,
      required: true,
    },
    folder: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    folderKey: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { timestamps: true },
)

contactListSchema.index({ nameKey: 1, folderKey: 1 }, { unique: true })

export default mongoose.models.ContactList ||
  mongoose.model('ContactList', contactListSchema)
