import { Router } from 'express'
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  getCampaignReadiness,
  getCampaignReport,
  previewCampaign,
  getCampaigns,
  cancelCampaign,
  sendCampaign,
  sendCampaignTest,
  updateCampaign,
} from '../controllers/campaignController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendLimiter } from '../middleware/rateLimiter.js'

const router = Router()
router.use(requireAuth)

router.get('/readiness', asyncHandler(getCampaignReadiness))
router.get('/', asyncHandler(getCampaigns))
router.post('/', asyncHandler(createCampaign))
router.get('/:id', asyncHandler(getCampaign))
router.get('/:id/preview', asyncHandler(previewCampaign))
router.get('/:id/report', asyncHandler(getCampaignReport))
router.patch('/:id', asyncHandler(updateCampaign))
router.delete('/:id', asyncHandler(deleteCampaign))
router.post('/:id/test', sendLimiter, asyncHandler(sendCampaignTest))
router.post('/:id/send', sendLimiter, asyncHandler(sendCampaign))
router.post('/:id/cancel', asyncHandler(cancelCampaign))

export default router