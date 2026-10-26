import HttpError from '../utils/httpError.js'
import { validateListInput } from '../utils/contactValidation.js'

export async function getLists(req, res) {
  const { Contact, ContactList } = req.models
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : ''
  const filter = search
    ? { name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    : {}

  const lists = await ContactList.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: Contact.collection.name,
        localField: '_id',
        foreignField: 'listId',
        as: 'contacts',
      },
    },
    {
      $project: {
        name: 1,
        folder: 1,
        description: 1,
        createdAt: 1,
        updatedAt: 1,
        contactCount: { $size: '$contacts' },
      },
    },
  ])

  res.json({ lists, folders: [...new Set(lists.map((list) => list.folder).filter(Boolean))].sort() })
}

export async function createList(req, res) {
  const { ContactList } = req.models
  const input = validateListInput(req.body)
  const list = await ContactList.create(input)
  res.status(201).json({ list: { ...list.toObject(), contactCount: 0 } })
}

export async function updateList(req, res) {
  const { Contact, ContactList } = req.models
  const input = validateListInput(req.body, { partial: true })
  const list = await ContactList.findByIdAndUpdate(req.params.id, input, {
    returnDocument: 'after',
    runValidators: true,
  }).lean()
  if (!list) throw new HttpError(404, 'Contact list not found.')
  const contactCount = await Contact.countDocuments({ listId: list._id })
  res.json({ list: { ...list, contactCount } })
}

export async function deleteList(req, res) {
  const { Contact, ContactList } = req.models
  const list = await ContactList.findByIdAndDelete(req.params.id)
  if (!list) throw new HttpError(404, 'Contact list not found.')
  await Contact.updateMany({ listId: list._id }, { $set: { listId: null } })
  res.status(204).end()
}
