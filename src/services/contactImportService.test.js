import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from '@e965/xlsx'
import {
  mapContactRow,
  normalizeHeader,
  parseContactCsv,
  parseContactFile,
} from './contactImportService.js'

test('parses CSV headers and rows with common contact column aliases', async () => {
  const rows = await parseContactCsv(
    Buffer.from(
      '\uFEFFFull Name,Email Address,Company Name,Status\nAlex Morgan,ALEX@example.com,Example Co,subscribed\n',
    ),
  )

  assert.deepEqual(rows, [
    {
      name: 'Alex Morgan',
      email: 'ALEX@example.com',
      company: 'Example Co',
      status: 'subscribed',
    },
  ])
})

test('requires name and email CSV columns', async () => {
  await assert.rejects(
    parseContactCsv(Buffer.from('name,company\nAlex,Example Co\n')),
    { statusCode: 400, message: 'CSV files must include name and email columns.' },
  )
})

test('normalizes common and alternate headers for manual column mapping', () => {
  assert.equal(normalizeHeader('Email Address'), 'email')
  assert.equal(normalizeHeader('Company Name'), 'company')
  assert.equal(normalizeHeader('Industry Sector'), 'industrysector')
})

test('maps unknown spreadsheet headings and keeps remaining columns as custom fields', () => {
  const mapped = mapContactRow(
    { 'full legal name': 'Jordan Lee', 'work email': 'JORDAN@example.com', industry: 'Retail' },
    ['full legal name', 'work email', 'industry'],
    { name: 'full legal name', email: 'work email' },
  )
  assert.deepEqual(mapped, {
    name: 'Jordan Lee',
    email: 'JORDAN@example.com',
    customFields: { industry: 'Retail' },
  })
})

test('parses Excel rows and retains additional dynamic columns', async () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet([
    { 'Full Name': 'Taylor', 'Email Address': 'TAYLOR@example.com', Industry: 'Design' },
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  const parsed = await parseContactFile(buffer, 'contacts.xlsx')
  assert.deepEqual(parsed.headers, ['name', 'email', 'industry'])
  assert.deepEqual(parsed.rows, [{
    name: 'Taylor',
    email: 'TAYLOR@example.com',
    industry: 'Design',
  }])
})

test('parses legacy XLS workbooks', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Name', 'Email'], ['Casey', 'casey@example.com']]),
    'Contacts',
  )
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' })
  const parsed = await parseContactFile(buffer, 'contacts.xls')
  assert.deepEqual(parsed.headers, ['name', 'email'])
  assert.equal(parsed.rows[0].email, 'casey@example.com')
})
