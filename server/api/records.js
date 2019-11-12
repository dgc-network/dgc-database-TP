// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const db = require('../db/records')
const transaction = require('../transaction/records')

const FILTER_KEYS = ['recordId', 'table']

const fetchProperty = ({recordId, propertyName}) => {
  return db.fetchProperty(recordId, propertyName)
}

const fetchRecord = ({recordId, authedKey}) => {
  return db.fetchRecord(recordId, authedKey)
}

const listRecords = params => {
  return db.listRecords(params.authedKey, _.pick(params, FILTER_KEYS))
}

// dgc-REST-api
const createRecord = params => {
  return transaction.createRecord(params)
}

const retrieveRecords = params => {
  return db.retrieveRecords(params)
}

const updateRecords = params => {
  return transaction.updateRecords(params)
}

const deleteRecords = params => {
  return transaction.deleteRecords(params)
}

module.exports = {
  fetchProperty,
  fetchRecord,
  listRecords,
  createRecord,
  updateRecords,
  retrieveRecords,
  deleteRecords
}
