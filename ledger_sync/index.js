// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const db = require('./db')
const subscriber = require('./subscriber')
const protos = require('./subscriber/protos')

Promise.all([
  db.connect(),
  protos.compile()
])
  .then(subscriber.start)
  .catch(err => console.error(err.message))
