import mongoose from 'mongoose'

export function validateDatabaseUri(uri, environment = process.env.NODE_ENV) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('Set MONGODB_URI in server/.env to your MongoDB connection string')
  }
  if (uri.includes('replace-with-your-mongodb-connection-string')) {
    throw new Error('Set MONGODB_URI in server/.env to your MongoDB connection string')
  }

  const match = uri.trim().match(/^(mongodb(?:\+srv)?:\/\/[^/?#]+)(?:\/[^?#]*)?(?:\?([^#]*))?$/i)
  if (!match) {
    throw new Error('MONGODB_URI is not a valid MongoDB connection string')
  }
  const protocol = match[1].toLowerCase().startsWith('mongodb+srv:')
    ? 'mongodb+srv:'
    : 'mongodb:'
  const searchParams = new URLSearchParams(match[2] || '')
  const mongoOptions = new Map(
    [...searchParams].map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]),
  )
  if (['tlsallowinvalidcertificates', 'tlsallowinvalidhostnames', 'tlsinsecure']
    .some((key) => ['true', '1'].includes(mongoOptions.get(key)))) {
    throw new Error('MongoDB TLS certificate and hostname validation cannot be disabled')
  }
  if (environment === 'production') {
    const tlsEnabled = mongoOptions.get('tls') === 'true' || mongoOptions.get('ssl') === 'true'
    const tlsDisabled = mongoOptions.get('tls') === 'false' || mongoOptions.get('ssl') === 'false'
    if (tlsDisabled || (protocol !== 'mongodb+srv:' && !tlsEnabled)) {
      throw new Error('Production MongoDB connections must enable TLS with tls=true')
    }
  }

  return { protocol, searchParams }
}

export default async function connectDatabase(uri = process.env.MONGODB_URI) {
  validateDatabaseUri(uri)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
  })
}
