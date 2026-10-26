import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, required: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, required: true, unique: true },
    password: { type: String, required: true, select: false },
    databaseName: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      immutable: true,
      select: false,
    },
    tokenVersion: { type: Number, default: 0, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    company: { type: String, trim: true, maxlength: 160, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    timezone: { type: String, trim: true, maxlength: 100, default: 'Asia/Dhaka' },
    avatarUrl: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true },
)

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  const salt = await bcrypt.genSalt(12)
  this.password = await bcrypt.hash(this.password, salt)
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Transform output (hide password)
userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  const legacyAvatarPrefix = `/uploads/avatars/${this._id}-`
  if (obj.avatarUrl?.startsWith(legacyAvatarPrefix)) {
    const filename = obj.avatarUrl.slice('/uploads/avatars/'.length)
    obj.avatarUrl = `/api/auth/avatar/${encodeURIComponent(filename)}`
  }
  delete obj.password
  delete obj.databaseName
  delete obj.tokenVersion
  delete obj.__v
  return obj
}

export default mongoose.models.User || mongoose.model('User', userSchema)
