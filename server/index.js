// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const express = require('express')
const db = require('./db')
const blockchain = require('./blockchain')
const protos = require('./blockchain/protos')
const api = require('./api')
const config = require('./system/config')

const PORT = config.PORT
const app = express()

Promise.all([
  db.connect(),
  protos.compile(),
  blockchain.connect()
])
  .then(() => {
    app.use('/', api)
    app.listen(PORT, () => {
      console.log(`dgc-REST-api Server listening on port ${PORT}`)
    })
  })
  .catch(err => console.error(err.message))
