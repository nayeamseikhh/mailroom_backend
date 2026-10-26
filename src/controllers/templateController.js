import HttpError from '../utils/httpError.js'

const TEMPLATE_FIELDS = [
  'name',
  'category',
  'color',
  'accent',
  'subject',
  'previewText',
  'body',
  'blocks',
]

function templateInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Template data must be an object.')
  }

  const input = {}
  for (const field of TEMPLATE_FIELDS) {
    if (body[field] !== undefined) input[field] = body[field]
  }
  if (!partial && !String(input.name || '').trim()) {
    throw new HttpError(400, 'A template name is required.')
  }
  if (input.blocks !== undefined && (
    !Array.isArray(input.blocks) ||
    input.blocks.some((block) => typeof block !== 'string')
  )) {
    throw new HttpError(400, 'Template blocks must be a list of strings.')
  }
  return input
}

export async function getTemplates(req, res) {
  const templates = await req.models.Template.find({ owner: req.user._id })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean()
  res.json({ templates })
}

export async function createTemplate(req, res) {
  const template = await req.models.Template.create({
    ...templateInput(req.body),
    owner: req.user._id,
  })
  res.status(201).json({ template })
}

export async function updateTemplate(req, res) {
  const template = await req.models.Template.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { $set: templateInput(req.body, { partial: true }) },
    { returnDocument: 'after', runValidators: true },
  )
  if (!template) throw new HttpError(404, 'Template not found.')
  res.json({ template })
}

export async function deleteTemplate(req, res) {
  const template = await req.models.Template.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id,
  })
  if (!template) throw new HttpError(404, 'Template not found.')
  res.status(204).end()
}