// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const r = require('rethinkdb')

const db = require('./')

const hasCurrentBlock = currentBlock => obj => {
  return r.and(
    obj('startBlockNum').le(currentBlock),
    obj('endBlockNum').gt(currentBlock)
  )
}

const getAttribute = attr => obj => obj(attr)
const getRecordId = getAttribute('recordId')
const getPublicKey = getAttribute('publicKey')
const getName = getAttribute('name')
const getReporters = getAttribute('reporters')
const getAuthorized = getAttribute('authorized')

const hasPublicKey = key => obj => {
  return r.eq(
    key,
    getPublicKey(obj)
  )
}

const getAssociatedParticipantId = role => record => record(role).nth(-1)('participantId')
const getOwnerId = getAssociatedParticipantId('owners')
const getCustodianId = getAssociatedParticipantId('custodians')

const isAssociatedWithRecord = association => participant => record => {
  return r.eq(
    association(record),
    getPublicKey(participant)
  )
}

const isRecordOwner = isAssociatedWithRecord(getOwnerId)
const isRecordCustodian = isAssociatedWithRecord(getCustodianId)

const isReporter = participant => property => {
  return getReporters(property)
    .filter(hasPublicKey(getPublicKey(participant)))
    .do(seq => r.branch(
      seq.isEmpty(),
      false,
      getAuthorized(seq.nth(0))
    ))
}

const getTable = (tableName, block) =>
      r.table(tableName).filter(hasCurrentBlock(block))

const retrieveQuery = params => block => {
  //console.log(params)
  return getTable('proposals', block)
  .filter(params.query)
  .coerceTo('array')
}

const listQuery = filterQuery => block => {
  return getTable('proposals', block)
  .coerceTo('array')
  return getTable('proposals', block)
    .filter(filterQuery)
    .map(participant => r.expr({
      'name': getName(participant),
      'key': getPublicKey(participant),
      'owns': getTable('records', block)
        .filter(isRecordOwner(participant))
        .map(getRecordId)
        .distinct(),
      'custodian': getTable('records', block)
        .filter(isRecordCustodian(participant))
        .map(getRecordId)
        .distinct(),
      'reports': getTable('properties', block)
        .filter(isReporter(participant))
        .map(getRecordId)
        .distinct()
    }))
    .coerceTo('array')
}

const fetchQuery = (publicKey, auth) => block => {
  return getTable('participants', block)
    .filter(hasPublicKey(publicKey))
    .pluck('name', 'publicKey', 'dg_coin_balance')
    .nth(0)
    .do(
      participant => {
        return r.branch(
          auth,
          participant.merge(fetchUser(publicKey)),
          participant)
      })
}

const fetchUser = publicKey => {
  return r.table('users')
    .filter(hasPublicKey(publicKey))
    .pluck('username', 'email', 'encryptedKey')
    .nth(0)
}

const list = filterQuery => db.queryWithCurrentBlock(listQuery(filterQuery))

const fetch = (publicKey, auth) => db.queryWithCurrentBlock(fetchQuery(publicKey, auth))

const retrieve = params => db.queryWithCurrentBlock(retrieveQuery(params))

module.exports = {
  list,
  fetch,
  retrieve
}
