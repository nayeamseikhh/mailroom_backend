import { Readable } from 'node:stream'
import csv from 'csv-parser'
import XLSX from '@e965/xlsx'
import HttpError from '../utils/httpError.js'
import { validateContactInput } from '../utils/contactValidation.js'

const MAX_IMPORT_ROWS = 10000
const PREVIEW_LIMIT = 100
const HEADER_ALIASES = new Map([
  ['full name', 'name'],
  ['contact name', 'name'],
  ['email address', 'email'],
  ['emailaddress', 'email'],
  ['e mail', 'email'],
  ['e-mail', 'email'],
  ['company name', 'company'],
  ['companyname', 'company'],
])
const STANDARD_FIELDS = new Set([
  'name', 'email', 'company', 'phone', 'status', 'tags', 'notes', 'source',
])

function normalizeHeader(header) {
  const normalized = String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
  return HEADER_ALIASES.get(normalized) || normalized.replace(/\s/g, '')
}

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const rows = []
    let headers = []
    const parser = csv({
      mapHeaders: ({ header }) => normalizeHeader(header),
    })

    parser.on('headers', (parsedHeaders) => {
      headers = parsedHeaders
    })
    parser.on('data', (row) => {
      rows.push(row)
      if (rows.length > MAX_IMPORT_ROWS) {
        parser.destroy(new HttpError(400, `An import cannot contain more than ${MAX_IMPORT_ROWS} rows.`))
      }
    })
    parser.on('error', reject)
    parser.on('end', () => resolve({ headers, rows }))
    Readable.from([buffer]).pipe(parser)
  })
}

export async function parseContactCsv(buffer) {
  const parsed = await parseCsv(buffer)
  if (!parsed.headers.includes('name') || !parsed.headers.includes('email')) {
    throw new HttpError(400, 'CSV files must include name and email columns.')
  }
  return parsed.rows
}

export async function parseContactFile(buffer, originalname) {
  const extension = originalname.toLowerCase().split('.').pop()
  if (extension === 'csv') return parseCsv(buffer)
  if (!['xls', 'xlsx'].includes(extension)) {
    throw new HttpError(400, 'Only .csv, .xls, and .xlsx contact files can be imported.')
  }

  let workbook
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      dense: true,
      sheetRows: MAX_IMPORT_ROWS + 1,
    })
  } catch {
    throw new HttpError(400, `Could not parse ${originalname} as an Excel workbook.`)
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new HttpError(400, `${originalname} does not contain a worksheet.`)
  const records = XLSX.utils.sheet_to_json(firstSheet, {
    defval: '',
    raw: false,
    blankrows: true,
  })
  if (records.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, `A file cannot contain more than ${MAX_IMPORT_ROWS} rows.`)
  }
  const sourceHeaders = Object.keys(records[0] || {})
  const headers = sourceHeaders.map(normalizeHeader)
  const rows = records.map((record) => {
    const row = {}
    sourceHeaders.forEach((header, index) => {
      row[headers[index]] = record[header]
    })
    return row
  })
  return { headers, rows }
}

export function mapContactRow(row, headers, mapping) {
  const canonical = {}
  const usedHeaders = new Set()
  if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
    for (const field of STANDARD_FIELDS) {
      const selectedHeader = mapping[field]
      if (typeof selectedHeader === 'string' && headers.includes(selectedHeader)) {
        canonical[field] = row[selectedHeader]
        usedHeaders.add(selectedHeader)
      }
    }
  }

  for (const header of headers) {
    const field = normalizeHeader(header)
    if (!usedHeaders.has(header) && STANDARD_FIELDS.has(field) && canonical[field] === undefined) {
      canonical[field] = row[header]
      usedHeaders.add(header)
    }
  }

  const customFields = {}
  for (const header of headers) {
    if (usedHeaders.has(header)) continue
    const name = String(header).trim().slice(0, 80)
    const value = String(row[header] ?? '').trim().slice(0, 1000)
    if (name && value) customFields[name] = value
  }
  if (Object.keys(customFields).length) canonical.customFields = customFields
  return canonical
}

async function analyzeFiles(files, mapping = {}, Contact) {
  const classifications = {
    valid: [],
    invalid: [],
    duplicate: [],
    skipped: [],
  }
  const seenEmails = new Set()
  const allHeaders = new Set()
  let totalRows = 0

  for (const file of files) {
    const { headers, rows } = await parseContactFile(file.buffer, file.originalname)
    headers.forEach((header) => allHeaders.add(header))
    totalRows += rows.length
    if (totalRows > MAX_IMPORT_ROWS) {
      throw new HttpError(400, `An import cannot contain more than ${MAX_IMPORT_ROWS} rows.`)
    }

    for (const [index, row] of rows.entries()) {
      const raw = mapContactRow(row, headers, mapping)
      const item = { file: file.originalname, row: index + 2, email: String(raw.email ?? '').trim() }
      if (!Object.values(row).some((value) => String(value ?? '').trim())) {
        classifications.skipped.push({ ...item, reason: 'Empty row.' })
        continue
      }

      try {
        const status = raw.status
          ? String(raw.status).trim().toLowerCase().replace(/^./, (character) => character.toUpperCase())
          : 'Subscribed'
        const normalized = validateContactInput({ ...raw, status })
        item.email = normalized.email
        if (seenEmails.has(normalized.email)) {
          classifications.duplicate.push({ ...item, reason: 'Email is duplicated in the uploaded files.' })
          continue
        }
        seenEmails.add(normalized.email)
        classifications.valid.push({ ...item, contact: { ...normalized, listId: undefined } })
      } catch (error) {
        classifications.invalid.push({ ...item, reason: error.message })
      }
    }
  }

  const emails = classifications.valid.map((item) => item.email)
  const existingEmails = new Set(
    (await Contact.find({ email: { $in: emails } }, { email: 1 }).lean())
      .map((contact) => contact.email),
  )
  classifications.valid = classifications.valid.filter((item) => {
    if (!existingEmails.has(item.email)) return true
    classifications.duplicate.push({ ...item, contact: undefined, reason: 'A contact with this email already exists.' })
    return false
  })

  return { classifications, headers: [...allHeaders] }
}

export async function previewContactImport(files, mapping, Contact) {
  const { classifications: result, headers } = await analyzeFiles(files, mapping, Contact)
  const preview = Object.fromEntries(
    Object.entries(result).map(([status, rows]) => [
      status,
      rows.slice(0, PREVIEW_LIMIT).map(({ contact, ...row }) => ({
        ...row,
        ...(contact ? { contact } : {}),
      })),
    ]),
  )
  return {
    counts: Object.fromEntries(Object.entries(result).map(([status, rows]) => [status, rows.length])),
    preview,
    headers,
    rejectedRows: [...result.invalid, ...result.duplicate, ...result.skipped],
  }
}

export async function importContactFiles(files, listId, mapping, Contact) {
  const { classifications: result } = await analyzeFiles(files, mapping, Contact)
  const contacts = result.valid.map(({ contact }) => ({ ...contact, listId }))
  let imported = 0
  if (contacts.length) {
    try {
      const inserted = await Contact.insertMany(contacts, { ordered: false })
      imported = inserted.length
    } catch (error) {
      const writeErrors = error.writeErrors || error.result?.getWriteErrors?.() || []
      if (!writeErrors.length || writeErrors.some((item) => item.code !== 11000)) throw error
      imported = Math.max(0, contacts.length - writeErrors.length)
      for (const writeError of writeErrors) {
        const item = result.valid[writeError.index]
        if (item) result.duplicate.push({
          file: item.file,
          row: item.row,
          email: item.email,
          reason: 'A contact with this email already exists.',
        })
      }
    }
  }
  const skipped = result.invalid.length + result.duplicate.length + result.skipped.length
  return {
    imported,
    skipped,
    counts: {
      invalid: result.invalid.length,
      duplicate: result.duplicate.length,
      skipped: result.skipped.length,
    },
    invalid: result.invalid,
    duplicate: result.duplicate,
    skippedRows: result.skipped,
    errors: [...result.invalid, ...result.duplicate, ...result.skipped].slice(0, PREVIEW_LIMIT),
  }
}

export { MAX_IMPORT_ROWS, normalizeHeader }
