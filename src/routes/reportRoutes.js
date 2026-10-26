import { Router } from 'express'
import { getReports } from '../controllers/reportController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
router.use(requireAuth)

router.get('/', asyncHandler(getReports))

export default router