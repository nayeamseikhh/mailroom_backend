import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import HttpError from '../utils/httpError.js'

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const avatarDirectory = path.join(serverDirectory, 'uploads/avatars')
fs.mkdirSync(avatarDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, avatarDirectory),
  filename: (req, file, callback) => {
    const extension = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    }[file.mimetype]
    callback(null, `${req.user._id}-${Date.now()}${extension}`)
  },
})

const imageFilter = (_req, file, callback) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    callback(new HttpError(400, 'Upload a JPG, PNG, or WebP image.'))
    return
  }
  callback(null, true)
}

const avatarUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
})

export const uploadAvatar = avatarUpload.single('avatar')
