const DEFAULT_FALLBACKS = { name: 'there' }

function readValue(contact, path) {
  if (path === 'companyName') return contact?.company || contact?.companyName || ''
  if (path === 'company') return contact?.company || contact?.companyName || ''
  if (path === 'customFields') return ''
  const [root, ...parts] = path.split('.')
  if (root === 'customFields') {
    const key = parts.join('.')
    return Object.hasOwn(contact?.customFields || {}, key)
      ? contact.customFields[key]
      : ''
  }
  if (parts.length || !['name', 'email'].includes(root)) return ''
  return contact?.[root] ?? ''
}

export function renderPersonalization(template, contact, fallbacks = {}) {
  const values = { ...DEFAULT_FALLBACKS, ...fallbacks }
  const unresolved = new Set()
  const rendered = String(template).replace(/{{([^{}]*)}}/g, (placeholder, rawField) => {
    const field = rawField.trim()
    if (!/^[A-Za-z][\w.]*$/.test(field)) {
      unresolved.add(field || 'invalid placeholder')
      return placeholder
    }
    let value = readValue(contact, field)
    if (value === null || value === undefined || String(value).trim() === '') {
      value = Object.hasOwn(values, field) ? values[field] : ''
    }
    if (value === null || value === undefined || String(value).trim() === '') {
      unresolved.add(field)
      return placeholder
    }
    return String(value).replace(/[\r\n]+/g, ' ').trim()
  })
  return { rendered, unresolved: [...unresolved] }
}

export function findPersonalizationFields(...templates) {
  const fields = new Set()
  for (const template of templates) {
    for (const match of String(template || '').matchAll(/{{\s*([A-Za-z][\w.]*)\s*}}/g)) {
      fields.add(match[1])
    }
  }
  return [...fields]
}
