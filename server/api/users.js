// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const db = require('../db/users')
const participants = require('../db/participants')
const auth = require('./auth')
const { BadRequest } = require('./errors')

const create = user => {
  return Promise.resolve()
    .then(() => {
      return participants.fetch(user.publicKey, null)
        .catch(() => {
          throw new BadRequest('Public key must match a Participant on blockchain')
        })
    })
    .then(() => auth.hashPassword(user.password))
    .then(hashed => {
      return db.insert(_.assign({}, user, {password: hashed}))
        .catch(err => { throw new BadRequest(err.message) })
    })
    .then(() => auth.createToken(user.publicKey))
    .then(token => ({
      authorization: token,
      encryptedKey: user.encryptedKey || null
    }))
}

const update = (changes, { authedKey }) => {
  return Promise.resolve()
    .then(() => {
      if (changes.password) {
        return auth.hashPassword(changes.password)
          .then(hashed => _.set(changes, 'password', hashed))
      }
      return changes
    })
    .then(finalChanges => db.update(authedKey, finalChanges))
    .then(updated => _.omit(updated, 'password'))
}

const retrieve = params => {
  console.log(params)
  return db.retrieve(params)
}

module.exports = {
  create,
  update,
  retrieve
}
