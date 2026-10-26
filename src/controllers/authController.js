import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import User from '../models/User.js'
import HttpError from '../utils/httpError.js'
import { generateToken } from '../utils/generateToken.js'
import { getPasswordPolicyError } from '../utils/passwordPolicy.js'
import { getTenantModels, tenantDatabaseName } from '../models/tenantModels.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const COOKIE_OPTIONS = (remember) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : undefined,
  path: '/',
})

function validateRegistration({ name, email, password }) {
  const errors = {}

  const cleanName = typeof name === 'string' ? name.trim() : ''
  if (cleanName.length < 2) errors.name = 'Enter your full name.'
  if (cleanName.length > 120) errors.name = 'Name must be 120 characters or fewer.'

  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = 'Enter a valid email address.'

  const cleanPassword = typeof password === 'string' ? password : ''
  const passwordError = getPasswordPolicyError(cleanPassword)
  if (passwordError) errors.password = passwordError

  if (Object.keys(errors).length > 0) {
    const error = new HttpError(400, Object.values(errors)[0])
    error.fields = errors
    throw error
  }

  return { name: cleanName, email: cleanEmail, password: cleanPassword }
}

function validateLogin({ email, password }) {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const cleanPassword = typeof password === 'string' ? password : ''

  if (!cleanEmail || !cleanPassword) {
    throw new HttpError(400, 'Enter your email and password.')
  }

  return { email: cleanEmail, password: cleanPassword }
}

// POST /api/auth/register
export async function register(req, res) {
  const { name, email, password } = validateRegistration(req.body || {})

  const existing = await User.findOne({ email })
  if (existing) {
    const error = new HttpError(409, 'An account with this email already exists.')
    error.fields = { email: 'An account with this email already exists.' }
    throw error
  }

  const user = new User({ name, email, password })
  user.databaseName = tenantDatabaseName(user._id)
  await user.save()
  await getTenantModels(user)

  const token = generateToken(user._id)
  res.cookie('token', token, COOKIE_OPTIONS(true))
  res.status(201).json({
    message: 'Account created successfully.',
    token,
    user: user.toJSON(),
  })
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = validateLogin(req.body || {})
  const remember = Boolean(req.body?.remember)

  const user = await User.findOne({ email }).select('+password +databaseName +tokenVersion')
  // Same message for both cases so the endpoint can't be used to discover registered emails.
  if (!user || !(await user.comparePassword(password))) {
    throw new HttpError(401, 'Incorrect email or password.')
  }
  if (!user.isActive) {
    throw new HttpError(403, 'This account has been deactivated.')
  }

  user.lastLogin = new Date()
  await user.save({ validateBeforeSave: false })
  await getTenantModels(user)

  const token = generateToken(user._id, remember ? '30d' : '12h', user.tokenVersion)
  res.cookie('token', token, COOKIE_OPTIONS(remember))
  res.json({
    message: 'Logged in successfully.',
    token,
    user: user.toJSON(),
  })
}

// GET /api/auth/me
export async function me(req, res) {
  res.json({ user: req.user.toJSON() })
}

// PUT /api/auth/me — update the signed-in user's own details.
export async function updateMe(req, res) {
  const body = req.body || {}
  const updates = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (name.length < 2) throw new HttpError(400, 'Enter your full name.')
    if (name.length > 120) throw new HttpError(400, 'Name must be 120 characters or fewer.')
    updates.name = name
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    const taken = await User.findOne({ email, _id: { $ne: req.user._id } })
    if (taken) throw new HttpError(409, 'An account with this email already exists.')
    updates.email = email
  }

  if (body.company !== undefined) {
    updates.company = String(body.company).trim().slice(0, 160)
  }
  if (body.phone !== undefined) {
    updates.phone = String(body.phone).trim().slice(0, 40)
  }
  if (body.timezone !== undefined) {
    updates.timezone = String(body.timezone).trim().slice(0, 100) || 'Asia/Dhaka'
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  })

  res.json({ message: 'Profile updated successfully.', user: user.toJSON() })
}

// PUT /api/auth/avatar — save the signed-in user's uploaded avatar path.
export async function updateAvatar(req, res) {
  if (!req.file) throw new HttpError(400, 'Choose an image to upload.')

  const avatarUrl = `/api/auth/avatar/${encodeURIComponent(req.file.filename)}`
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatarUrl },
    { new: true, runValidators: true },
  )

  res.json({ message: 'Profile photo updated successfully.', user: user.toJSON() })
}

export async function getAvatar(req, res) {
  const filename = req.params.filename
  const expectedPrefix = `${req.user._id}-`
  if (
    !filename.startsWith(expectedPrefix) ||
    !/^\d+\.(?:jpg|jpeg|png|webp)$/.test(filename.slice(expectedPrefix.length))
  ) {
    throw new HttpError(404, 'Profile photo not found.')
  }

  let image
  try {
    image = await readFile(path.join(serverDirectory, 'uploads', 'avatars', filename))
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'Profile photo not found.')
    throw error
  }

  res.set('Cache-Control', 'private, no-store')
  res.type(path.extname(filename))
  res.send(image)
}

// PUT /api/auth/password — change password while staying signed in.
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {}

  if (typeof currentPassword !== 'string' || !currentPassword ||
    typeof newPassword !== 'string' || !newPassword) {
    throw new HttpError(400, 'Enter your current and new password.')
  }
  const passwordError = getPasswordPolicyError(newPassword)
  if (passwordError) throw new HttpError(400, passwordError)
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'Choose a password different from your current one.')
  }

  const user = await User.findById(req.user._id).select('+password +tokenVersion')
  if (!(await user.comparePassword(currentPassword))) {
    throw new HttpError(400, 'Your current password is incorrect.')
  }

  user.password = newPassword
  user.tokenVersion = (user.tokenVersion || 0) + 1
  await user.save()

  const token = generateToken(user._id, '7d', user.tokenVersion)
  res.cookie('token', token, COOKIE_OPTIONS(true))
  res.json({ message: 'Password changed successfully.' })
}

// POST /api/auth/logout
export async function logout(_req, res) {
  res.clearCookie('token', { path: '/' })
  res.json({ message: 'Logged out successfully.' })
}
