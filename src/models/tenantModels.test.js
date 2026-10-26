import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  ensureTenantDatabaseMapping,
  tenantDatabaseName,
  tenantModelsForConnection,
} from './tenantModels.js'

test('derives a tenant database name from the immutable user ID', () => {
  assert.equal(
    tenantDatabaseName('507f1f77bcf86cd799439011'),
    'mailroom_user_507f1f77bcf86cd799439011',
  )
})

test('repairs a stale tenant database mapping using the authenticated user ID', async () => {
  const userId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
  const expectedName = tenantDatabaseName(userId)
  let storedName = 'old_or_invalid_database'
  let updateFilter
  const user = {
    _id: userId,
    databaseName: storedName,
    collection: {
      async updateOne(filter, update) {
        updateFilter = filter
        if (storedName === filter.databaseName) {
          storedName = update.$set.databaseName
        }
      },
      async findOne() {
        return { databaseName: storedName }
      },
    },
  }

  const mappedName = await ensureTenantDatabaseMapping(user, expectedName)

  assert.equal(updateFilter.databaseName, 'old_or_invalid_database')
  assert.equal(storedName, expectedName)
  assert.equal(mappedName, expectedName)
})

test('repairs accounts that do not yet have a persisted tenant database mapping', async () => {
  const userId = new mongoose.Types.ObjectId()
  const expectedName = tenantDatabaseName(userId)
  let storedName
  const user = {
    _id: userId,
    databaseName: undefined,
    collection: {
      async updateOne(filter, update) {
        assert.deepEqual(filter.databaseName, { $exists: false })
        storedName = update.$set.databaseName
      },
      async findOne() {
        return { databaseName: storedName }
      },
    },
  }

  const mappedName = await ensureTenantDatabaseMapping(user, expectedName)

  assert.equal(storedName, expectedName)
  assert.equal(mappedName, expectedName)
})

test('does not continue if a tenant mapping cannot be safely repaired', async () => {
  const userId = new mongoose.Types.ObjectId()
  const user = {
    _id: userId,
    databaseName: 'old_or_invalid_database',
    collection: {
      async updateOne() {},
      async findOne() {
        return { databaseName: 'a_different_database' }
      },
    },
  }

  await assert.rejects(
    ensureTenantDatabaseMapping(user, tenantDatabaseName(userId)),
    /could not be repaired safely/,
  )
})

test('binds the same tenant collections to separate MongoDB databases', () => {
  const suffix = `${process.pid}_${Date.now()}`
  const alphaConnection = mongoose.connection.useDb(`tenant_alpha_${suffix}`, { useCache: false })
  const betaConnection = mongoose.connection.useDb(`tenant_beta_${suffix}`, { useCache: false })
  const alpha = tenantModelsForConnection(alphaConnection, alphaConnection.name)
  const beta = tenantModelsForConnection(betaConnection, betaConnection.name)

  assert.notEqual(alpha.Contact, beta.Contact)
  assert.notEqual(alpha.Campaign, beta.Campaign)
  assert.notEqual(alpha.Template, beta.Template)
  assert.notEqual(alpha.Contact.db.name, beta.Contact.db.name)
  assert.notEqual(alpha.Template.db.name, beta.Template.db.name)
  assert.equal(alpha.Contact.db, alpha.connection)
  assert.equal(beta.Contact.db, beta.connection)
})
