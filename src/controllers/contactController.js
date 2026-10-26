import HttpError from '../utils/httpError.js'
import { validateContactInput } from '../utils/contactValidation.js'
import {
  importContactFiles,
  previewContactImport,
} from '../services/contactImportService.js'

const CONTACT_STATUSES = new Set(['Subscribed', 'Unsubscribed', 'Bounced', 'Suppressed'])

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function getContacts(req, res) {
  const { Contact } = req.models
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50))
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt'
  const sortOrder = typeof req.query.sortOrder === 'string' ? req.query.sortOrder : 'desc'
  if (!['name', 'email', 'company', 'createdAt'].includes(sortBy) ||
    !['asc', 'desc'].includes(sortOrder)) {
    throw new HttpError(400, 'Contact sort parameters are invalid.')
  }
  const filter = {}

  if (req.query.status) {
    if (!CONTACT_STATUSES.has(req.query.status)) {
      throw new HttpError(400, 'Contact status filter is invalid.')
    }
    filter.status = req.query.status
  }
  if (req.query.listId) {
    if (!/^[a-f\d]{24}$/i.test(req.query.listId)) {
      throw new HttpError(400, 'List ID is invalid.')
    }
    filter.listId = req.query.listId
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const search = new RegExp(escapeRegex(req.query.search.trim().slice(0, 100)), 'i')
    filter.$or = [{ name: search }, { email: search }, { company: search }]
  }

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .populate('listId', 'name folder')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Contact.countDocuments(filter),
  ])

  res.json({ contacts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
}

export async function getContactStats(req, res) {
  const { Contact } = req.models
  // One database query instead of four.
  const rows = await Contact.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]))

  const subscribed = counts.Subscribed || 0
  const unsubscribed = counts.Unsubscribed || 0
  const bounced = counts.Bounced || 0
  const suppressed = counts.Suppressed || 0

  res.json({ total: subscribed + unsubscribed + bounced + suppressed, subscribed, unsubscribed, bounced, suppressed })
}

export async function createContact(req, res) {
  const { Contact, ContactList } = req.models
  const input = validateContactInput(req.body)
  if (input.listId && !(await ContactList.exists({ _id: input.listId }))) {
    throw new HttpError(400, 'Selected list does not exist.')
  }

  const contact = await Contact.create(input)
  const result = await Contact.findById(contact._id).populate('listId', 'name folder').lean()
  res.status(201).json({ contact: result })
}

export async function importContacts(req, res) {
  const { ContactList } = req.models
  const listId = req.body.listId
  if (!/^[a-f\d]{24}$/i.test(listId || '')) {
    throw new HttpError(400, 'A valid contact folder is required.')
  }
  if (!(await ContactList.exists({ _id: listId }))) {
    throw new HttpError(404, 'Selected contact folder does not exist.')
  }
  if (!req.files?.length) {
    throw new HttpError(400, 'Select at least one CSV file to import.')
  }

  const mapping = parseImportMapping(req.body.mapping)
  const result = await importContactFiles(req.files, listId, mapping, req.models.Contact)
  res.status(201).json(result)
}

export async function previewContactsImport(req, res) {
  if (!req.files?.length) {
    throw new HttpError(400, 'Select at least one contact file to preview.')
  }
  const mapping = parseImportMapping(req.body.mapping)
  const preview = await previewContactImport(req.files, mapping, req.models.Contact)
  res.json(preview)
}

function parseImportMapping(value) {
  if (!value) return {}
  try {
    const mapping = JSON.parse(value)
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new Error('mapping must be an object')
    }
    return mapping
  } catch {
    throw new HttpError(400, 'Column mapping is invalid.')
  }
}

export async function updateContact(req, res) {
  const { Contact, ContactList } = req.models
  const input = validateContactInput(req.body, { partial: true })
  if (input.listId && !(await ContactList.exists({ _id: input.listId }))) {
    throw new HttpError(400, 'Selected list does not exist.')
  }

  const contact = await Contact.findByIdAndUpdate(req.params.id, input, {
    returnDocument: 'after',
    runValidators: true,
  })
    .populate('listId', 'name folder')
    .lean()
  if (!contact) throw new HttpError(404, 'Contact not found.')
  res.json({ contact })
}

export async function deleteContact(req, res) {
  const { Contact } = req.models
  const contact = await Contact.findByIdAndDelete(req.params.id)
  if (!contact) throw new HttpError(404, 'Contact not found.')
  res.status(204).end()
}
