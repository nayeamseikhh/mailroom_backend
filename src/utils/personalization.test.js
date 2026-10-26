import test from 'node:test'
import assert from 'node:assert/strict'
import { renderPersonalization } from './personalization.js'
import { escapeHtml } from '../services/emailService.js'

test('resolves standard and custom fields for each contact independently', () => {
  const first = renderPersonalization(
    'Hello {{name}} at {{companyName}} ({{customFields.industry}})',
    { name: 'Ari', company: 'Northwind', customFields: { industry: 'Energy' } },
  )
  const second = renderPersonalization(
    'Hello {{name}} at {{companyName}} ({{customFields.industry}})',
    { name: 'Jo', company: 'Contoso', customFields: { industry: 'Health' } },
  )

  assert.equal(first.rendered, 'Hello Ari at Northwind (Energy)')
  assert.equal(second.rendered, 'Hello Jo at Contoso (Health)')
  assert.deepEqual(first.unresolved, [])
})

test('uses the configured fallback and reports unresolved values', () => {
  const result = renderPersonalization(
    'Hello {{name}} from {{companyName}}',
    { name: '', company: '' },
    { name: 'friend' },
  )

  assert.equal(result.rendered, 'Hello friend from {{companyName}}')
  assert.deepEqual(result.unresolved, ['companyName'])
})

test('flags malformed template tokens instead of leaving them silently in copy', () => {
  const result = renderPersonalization('Hello {{company-name}}')
  assert.equal(result.rendered, 'Hello {{company-name}}')
  assert.deepEqual(result.unresolved, ['company-name'])
})

test('HTML-escapes values before using them in a formatted email', () => {
  const rendered = renderPersonalization(
    'Hello {{name}}',
    { name: '<img src=x onerror=alert(1)>' },
  )

  assert.equal(
    escapeHtml(rendered.rendered),
    'Hello &lt;img src=x onerror=alert(1)&gt;',
  )
})
