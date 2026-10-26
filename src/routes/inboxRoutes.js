import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import {
  actOnInboxMessage,
  actOnInboxMessages,
  getInboxMessage,
  getInboxMessages,
} from '../controllers/inboxController.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
router.use(requireAuth)

router.get('/', asyncHandler(getInboxMessages))
router.get('/:uid', asyncHandler(getInboxMessage))
router.post('/:uid/action', asyncHandler(actOnInboxMessage))
router.post('/actions', asyncHandler(actOnInboxMessages))

export default router
