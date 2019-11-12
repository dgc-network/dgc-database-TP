// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const request = require('request-promise-native')
const protos = require('../blockchain/protos')
const {
  awaitServerPubkey,
  getTxnCreator,
  submitTxns,
  encodeTimestampedPayload
} = require('../system/submit_utils')

const SERVER = process.env.SERVER || 'http://localhost:3000'

let createTxn = null

const create =  params  => {
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

  // Create Participant
  .then(() => {
    const participantPayload = encodeTimestampedPayload({
      action: protos.PayloadDGC.Action.CREATE_PARTICIPANT,
      createParticipant: protos.CreateParticipantAction.create({ 
        name: params.data.name 
      })
    })
    const participantTxns = [ createTxn(params.privateKey, participantPayload) ]
    return submitTxns(participantTxns)
  })

  // Create User
  .then(() => {
    console.log('Creating User . . .')
    const user = _.omit(params.data, 'name', 'privateKey', 'hashedPassword')
    user.password = params.data.hashedPassword
    return request({
      method: 'POST',
      url: `${SERVER}/users`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    })
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

module.exports = {
  create
}
