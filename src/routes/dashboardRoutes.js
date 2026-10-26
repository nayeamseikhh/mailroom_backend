import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware.js'
import asyncHandler from '../utils/asyncHandler.js'
import { getDashboard, getDashboardUsage } from '../controllers/dashboardController.js'

const router = Router()

router.use(requireAuth)
router.get('/usage', asyncHandler(getDashboardUsage))
router.get('/', asyncHandler(getDashboard))

export default router
