import mongoose from 'mongoose'
import { campaignSchema } from './Campaign.js'
import { contactSchema } from './Contact.js'
import { contactListSchema } from './ContactList.js'
import { emailLogSchema } from './EmailLog.js'
import { settingsSchema } from './Settings.js'
import { templateSchema } from './Template.js'

const provisionedDatabaseNamesByConnection = new WeakMap()

function modelFor(connection, name, schema) {
  return connection.models[name] || connection.model(name, schema)
}

export function tenantModelsForConnection(connection, databaseName) {
  return {
    Campaign: modelFor(connection, 'Campaign', campaignSchema),
    Contact: modelFor(connection, 'Contact', contactSchema),
    ContactList: modelFor(connection, 'ContactList', contactListSchema),
    EmailLog: modelFor(connection, 'EmailLog', emailLogSchema),
    Settings: modelFor(connection, 'Settings', settingsSchema),
    Template: modelFor(connection, 'Template', templateSchema),
    connection,
    databaseName,
  }
}

export function tenantDatabaseName(userId) {
  return `mailroom_user_${String(userId)}`
}

export async function ensureTenantDatabaseMapping(user, expectedName) {
  if (user.databaseName === expectedName) return expectedName

  const mappingFilter = { _id: user._id }
  if (typeof user.databaseName === 'string') {
    mappingFilter.databaseName = user.databaseName
  } else {
    mappingFilter.databaseName = { $exists: false }
  }

  await user.collection.updateOne(mappingFilter, {
    $set: { databaseName: expectedName },
  })
  const account = await user.collection.findOne(
    { _id: user._id },
    { projection: { databaseName: 1 } },
  )
  if (account?.databaseName !== expectedName) {
    throw new Error('The account database mapping could not be repaired safely.')
  }
  return expectedName
}

export async function getTenantModels(user, baseConnection = mongoose.connection) {
  const expectedName = tenantDatabaseName(user._id)
  const databaseName = await ensureTenantDatabaseMapping(user, expectedName)

  const connection = baseConnection.useDb(databaseName, { useCache: true })
  const models = tenantModelsForConnection(connection, databaseName)
  models.userId = user._id
  models.userEmail = user.email

  let provisionedDatabaseNames = provisionedDatabaseNamesByConnection.get(baseConnection)
  if (!provisionedDatabaseNames) {
    provisionedDatabaseNames = new Set()
    provisionedDatabaseNamesByConnection.set(baseConnection, provisionedDatabaseNames)
  }
  if (!provisionedDatabaseNames.has(databaseName)) {
    const tenantCollection = connection.db.collection('_tenant')
    try {
      await tenantCollection.updateOne(
        { _id: 'owner' },
        { $setOnInsert: { userId: user._id, createdAt: new Date() } },
        { upsert: true },
      )
    } catch (error) {
      if (error.code !== 11000) throw error
    }
    const metadata = await tenantCollection.findOne({ _id: 'owner' })
    if (!metadata?.userId?.equals(user._id)) {
      throw new Error('The account database owner does not match the signed-in user.')
    }
    provisionedDatabaseNames.add(databaseName)
  }

  return models
}
