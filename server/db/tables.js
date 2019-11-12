// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const r = require('rethinkdb')
const db = require('./')

// Returns true if a resource is included in the block with the passed number
const fromBlock = blockNum => resource => {
  return r.and(
    resource('startBlockNum').le(blockNum),
    resource('endBlockNum').gt(blockNum))
}

// Transforms an array of resources with a "name" property
// to an object where names are the keys
const arrayToObject = namedResources => {
  return r.object(r.args(namedResources.concatMap(resource => {
    return [ resource('name'), resource.without('name') ]
  })))
}

// Transforms raw table entity into the publishable form the API expects
const publishTable = table => {
  return r.expr({
    name: table('name'),
    properties: arrayToObject(table('properties'))
  })
}

const fetchQuery = name => currentBlock => {
  return r.table('tables')
    .getAll(name, { index: 'name' })
    .filter(fromBlock(currentBlock))
    .map(publishTable)
    .nth(0)
    .default(null)
}

const listQuery = filterQuery => currentBlock => {
  return r.table('tables')
    .filter(fromBlock(currentBlock))
    .filter(filterQuery)
    .map(publishTable)
    .coerceTo('array')
}

const fetch = name => db.queryWithCurrentBlock(fetchQuery(name))

const list = filterQuery => db.queryWithCurrentBlock(listQuery(filterQuery))

module.exports = {
  fetch,
  list
}
