import { Router } from 'express'
import {
  createList,
  deleteList,
  getLists,
  updateList,
} from '../controllers/listController.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import asyncHandler from '../utils/asyncHandler.js'

const router = Router()
router.use(requireAuth)

router.get('/', asyncHandler(getLists))
router.post('/', asyncHandler(createList))
router.patch('/:id', asyncHandler(updateList))
router.delete('/:id', asyncHandler(deleteList))

export default router
