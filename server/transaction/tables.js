// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const protos = require('../blockchain/protos')
const {
  awaitServerPubkey,
  getTxnCreator,
  submitTxns,
  encodeTimestampedPayload
} = require('../system/submit_utils')

let createTxn = null

const create = params => {
  console.log(params)
  return protos.compile()
  .then(awaitServerPubkey)
  .then(batcherPublicKey => {
    const txnCreators = {}
    createTxn = (privateKey, payload) => {
      if (!txnCreators[privateKey]) {
        txnCreators[privateKey] = getTxnCreator(privateKey, batcherPublicKey)
      }
      return txnCreators[privateKey](payload)
    }
  })

  .then(() => {
    console.log('Create Tables . . .')
    const tableTxns = params.data.map(param => {
      return createTxn(params.privateKey, encodeTimestampedPayload({
        action: protos.PayloadDGC.Action.CREATE_TABLE,
        createTable: protos.CreateTableAction.create({
          name: param.name,
          properties: param.properties.map(prop => {
            return protos.PropertySchema.create(prop)
          })
        })
      }))
    })
    return submitTxns(tableTxns)
  })
  .then(res => console.log('Tables submitted:\n', JSON.parse(res)))
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

module.exports = {
  create
}
