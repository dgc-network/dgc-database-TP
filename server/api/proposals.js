// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const db = require('../db/proposals')
const transaction = require('../transaction/proposals')

const FILTER_KEYS = ['recordId', 'table']

const fetchProperty = ({recordId, propertyName}) => {
  return db.fetchProperty(recordId, propertyName)
}

const fetchRecord = ({recordId, authedKey}) => {
  return db.fetchRecord(recordId, authedKey)
}

const retrieveProposals = params => {
  return db.retrieve(params)
}

const applyDGCoinCredit = params => {
  return transaction.applyDGCoinCredit(params)
}

const buyDGCoinProposal = params => {
  return transaction.buyDGCoinProposal(params)
}

const sellDGCoinProposal = params => {
  return transaction.sellDGCoinProposal(params)
}

const transferDGCoinProposal = params => {
  return transaction.transferDGCoinProposal(params)
}

const answerDGCoinTransfer = params => {
  return transaction.answerDGCoinTransfer(params)
}

const transferCustodianshipProposal = params => {
  return transaction.transferCustodianshipProposal(params)
}

const list = params => db.list(params)

module.exports = {
  list,
  retrieveProposals,
  applyDGCoinCredit,
  buyDGCoinProposal,
  sellDGCoinProposal,
  transferDGCoinProposal,
  answerDGCoinTransfer,
  transferCustodianshipProposal
}
