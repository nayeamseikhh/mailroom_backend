import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import User from './User.js'

test('does not expose password hashes or tenant database names in user JSON', () => {
  const user = new User({
    name: 'Taylor',
    email: 'taylor@example.com',
    password: '$2a$12$hash',
    databaseName: 'mailroom_user_507f1f77bcf86cd799439011',
  })
  const output = user.toJSON()

  assert.equal(Object.hasOwn(output, 'password'), false)
  assert.equal(Object.hasOwn(output, 'databaseName'), false)
  assert.equal(Object.hasOwn(output, 'tokenVersion'), false)
})

test('returns legacy avatar paths through the authenticated avatar endpoint', () => {
  const userId = new mongoose.Types.ObjectId()
  const user = new User({
    _id: userId,
    name: 'Taylor',
    email: 'taylor@example.com',
    password: '$2a$12$hash',
    avatarUrl: `/uploads/avatars/${userId}-1700000000000.jpg`,
  })
  const output = user.toJSON()

  assert.match(output.avatarUrl, /^\/api\/auth\/avatar\//)
})
