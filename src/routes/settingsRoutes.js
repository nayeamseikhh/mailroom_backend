import { Router } from 'express'
import {
  deleteImapSettings,
  deleteSmtpSettings,
  getSettings,
  testImapSettings,
  testSmtpSettings,
  updateNotifications,
  updateProfile,
  updateImapSettings,
  updateSmtpSettings,
  updateSending,
} from '../controllers/settingsController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { sendLimiter } from '../middleware/rateLimiter.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
router.use(requireAuth)

router.get('/', asyncHandler(getSettings))
router.patch('/profile', asyncHandler(updateProfile))
router.patch('/notifications', asyncHandler(updateNotifications))
router.patch('/sending', asyncHandler(updateSending))
router.put('/smtp', asyncHandler(updateSmtpSettings))
router.post('/smtp/test', sendLimiter, asyncHandler(testSmtpSettings))
router.delete('/smtp', asyncHandler(deleteSmtpSettings))
router.put('/imap', asyncHandler(updateImapSettings))
router.post('/imap/test', sendLimiter, asyncHandler(testImapSettings))
router.delete('/imap', asyncHandler(deleteImapSettings))

export default router
