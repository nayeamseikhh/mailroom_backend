import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {
  getTenantModels,
  tenantDatabaseName,
} from './tenantModels.js'

const testUri = process.env.MONGODB_TEST_URI

test("MongoDB tenant databases do not expose each other's contacts", {
  skip: !testUri,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Live tenant tests must not use production mode.')
  const databaseName = new URL(testUri).pathname.slice(1).split('/')[0]
  assert.match(databaseName, /test$/i, 'MONGODB_TEST_URI must select a database ending in "test".')

  const connection = await mongoose.createConnection(testUri, {
    serverSelectionTimeoutMS: 10000,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
  }).asPromise()
  const alphaId = new mongoose.Types.ObjectId()
  const betaId = new mongoose.Types.ObjectId()
  const tenantNames = [tenantDatabaseName(alphaId), tenantDatabaseName(betaId)]

  try {
    const alpha = await getTenantModels({
      _id: alphaId,
      databaseName: tenantNames[0],
    }, connection)
    const beta = await getTenantModels({
      _id: betaId,
      databaseName: tenantNames[1],
    }, connection)

    await alpha.Contact.create({
      name: 'Tenant Alpha',
      email: `alpha-${alphaId}@example.test`,
    })
    await beta.Contact.create({
      name: 'Tenant Beta',
      email: `beta-${betaId}@example.test`,
    })

    assert.equal(await alpha.Contact.countDocuments(), 1)
    assert.equal(await beta.Contact.countDocuments(), 1)
    assert.equal(
      await alpha.Contact.exists({ email: `beta-${betaId}@example.test` }),
      null,
    )
    assert.equal(
      await beta.Contact.exists({ email: `alpha-${alphaId}@example.test` }),
      null,
    )
  } finally {
    try {
      for (const name of tenantNames) {
        const tenantConnection = connection.useDb(name)
        const collections = await tenantConnection.db
          .listCollections({}, { nameOnly: true })
          .toArray()
        for (const collection of collections) {
          await tenantConnection.db.collection(collection.name).drop()
        }
      }
    } finally {
      await connection.close()
    }
  }
})
