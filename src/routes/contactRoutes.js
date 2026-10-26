import { Router } from 'express'
import multer from 'multer'
import asyncHandler from '../utils/asyncHandler.js'
import { requireAuth } from '../middleware/authMiddleware.js'
import { importLimiter } from '../middleware/rateLimiter.js'
import HttpError from '../utils/httpError.js'
import {
  createContact,
  deleteContact,
  getContactStats,
  getContacts,
  importContacts,
  previewContactsImport,
  updateContact,
} from '../controllers/contactController.js'

const router = Router()
const uploadCsvFiles = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fieldSize: 64 * 1024,
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!/\.(csv|xls|xlsx)$/i.test(file.originalname)) {
      callback(new HttpError(400, 'Only .csv, .xls, and .xlsx files can be imported.'))
      return
    }
    callback(null, true)
  },
}).array('files', 10)

router.use(requireAuth)
router.get('/stats', asyncHandler(getContactStats))
router.get('/', asyncHandler(getContacts))
router.post('/import/preview', importLimiter, uploadCsvFiles, asyncHandler(previewContactsImport))
router.post('/import', importLimiter, uploadCsvFiles, asyncHandler(importContacts))
router.post('/', asyncHandler(createContact))
router.patch('/:id', asyncHandler(updateContact))
router.delete('/:id', asyncHandler(deleteContact))

export default router
