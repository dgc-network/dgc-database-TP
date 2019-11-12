// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const { NotFound } = require('./errors')
const db = require('../db/tables')
const transaction = require('../transaction/tables')

const FILTER_KEYS = ['name']

const fetch = ({ name }) => {
  return db.fetch(name)
    .then(table => {
      if (!table) {
        throw new NotFound(`No table with name: ${name}`)
      }
      return table
    })
}

const list = params => db.list(_.pick(params, FILTER_KEYS))

const create = params => transaction.create(params)

module.exports = {
  fetch,
  list,
  create
}
