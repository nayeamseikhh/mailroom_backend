import { Router } from 'express'
import {
  createTemplate,
  deleteTemplate,
  getTemplates,
  updateTemplate,
} from '../controllers/templateController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
router.use(requireAuth)

router.get('/', asyncHandler(getTemplates))
router.post('/', asyncHandler(createTemplate))
router.patch('/:id', asyncHandler(updateTemplate))
router.delete('/:id', asyncHandler(deleteTemplate))

export default router