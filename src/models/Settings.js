import mongoose from 'mongoose'

const profileSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    company: { type: String, trim: true, maxlength: 160, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    timezone: { type: String, trim: true, maxlength: 100, default: 'Asia/Dhaka' },
  },
  { _id: false },
)

const notificationsSchema = new mongoose.Schema(
  {
    campaignUpdates: { type: Boolean, default: true },
    weeklyReports: { type: Boolean, default: true },
    productUpdates: { type: Boolean, default: false },
    securityAlerts: { type: Boolean, default: true },
  },
  { _id: false },
)

const sendingSchema = new mongoose.Schema(
  {
    senderName: { type: String, trim: true, maxlength: 120, default: '' },
    senderEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    replyToEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  },
  { _id: false },
)

export const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'workspace' },
    profile: { type: profileSchema, default: () => ({}) },
    notifications: { type: notificationsSchema, default: () => ({}) },
    sending: { type: sendingSchema, default: () => ({}) },
    smtpCredentialsEncrypted: { type: String, select: false },
    imapCredentialsEncrypted: { type: String, select: false },
    smtpLegacyMigrationDone: { type: Boolean, default: false, select: false },
  },
  { timestamps: true },
)

export default mongoose.models.Settings ||
  mongoose.model('Settings', settingsSchema)
