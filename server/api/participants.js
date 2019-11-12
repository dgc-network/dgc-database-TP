// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const db = require('../db/participants')
const transaction = require('../transaction/participants')

const FILTER_KEYS = ['name', 'publicKey']

const list = params => db.list(_.pick(params, FILTER_KEYS))

const fetch = ({ publicKey, authedKey }) => db.fetch(publicKey, publicKey === authedKey)

const create = params => transaction.create(params)

//const update = params => transaction.update(params)

module.exports = {
  list,
  fetch,
//  update,
  create
}
