// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const r = require('rethinkdb')
const db = require('./')


const valueNames = {
  BYTES: 'bytesValue',
  BOOLEAN: 'booleanValue',
  NUMBER: 'numberValue',
  STRING: 'stringValue',
  ENUM: 'enumValue',
  LOCATION: 'locationValue'
}

const xformStruct = properties => {
  return _.fromPairs(properties.map(property => {
    const value = property.dataType === 'STRUCT'
      ? xformStruct(property.structValues)
      : property[ valueNames[property.dataType] ]
    return [property.name, value]
  }))
}

const addBlockState = (tableName, indexName, indexValue, doc, blockNum) => {
  return db.modifyTable(tableName, table => {
    return table
      .getAll(indexValue, { index: indexName })
      .filter({ endBlockNum: Number.MAX_SAFE_INTEGER })
      .coerceTo('array')
      .do(oldDocs => {
        return oldDocs
          .filter({ startBlockNum: blockNum })
          .coerceTo('array')
          .do(duplicates => {
            return r.branch(
              // If there are duplicates, do nothing
              duplicates.count().gt(0),
              duplicates,

              // Otherwise, update the end block on any old docs,
              // and insert the new one
              table
                .getAll(indexValue, { index: indexName })
                .update({ endBlockNum: blockNum })
                .do(() => {
                  return table.insert(_.assign({}, doc, {
                    startBlockNum: blockNum,
                    endBlockNum: Number.MAX_SAFE_INTEGER
                  }))
                })
            )
          })
      })
  })
}

const addParticipant = (participant, blockNum) => {
  return addBlockState('participants', 'publicKey', participant.publicKey, participant, blockNum)
}

const addRecord = (record, blockNum) => {
  return addBlockState('records', 'recordId', record.recordId, record, blockNum)
}

const addTable = (table, blockNum) => {
  return addBlockState('tables', 'name', table.name, table, blockNum)
}

const addProperty = (property, blockNum) => {
  return addBlockState('properties', 'attributes',
    ['name', 'recordId'].map(k => property[k]),
    property, blockNum)
}

const addPropertyPage = (page, blockNum) => {
  return db.queryTable('properties', properties => {
    return properties
      .getAll([page.name, page.recordId], { index: 'attributes' })
      .filter({ endBlockNum: Number.MAX_SAFE_INTEGER })
  })
    .then(properties => {
      if (properties.length === 0) {
        const attrs = `${page.name}, ${page.recordId}`
        return console.warn("WARNING! Unable to find page's Property:", attrs)
      }

      const property = properties[0]

      // Convert enum indexes into names, or empty strings if not an enum
      if (property.dataType === 'ENUM') {
        page.reportedValues.forEach(reported => {
          reported.enumValue = property.enumOptions[reported.enumValue]
        })
      } else {
        page.reportedValues.forEach(reported => {
          reported.enumValue = ''
        })
      }

      // Convert `structValues` array into `structValue` object
      if (property.dataType === 'STRUCT') {
        page.reportedValues.forEach(reported => {
          reported.structValue = xformStruct(reported.structValues)
          delete reported.structValues
        })
      } else {
        page.reportedValues.forEach(reported => {
          reported.structValue = {}
          delete reported.structValues
        })
      }

    })
    .then(() => {
      return addBlockState('propertyPages', 'attributes',
        ['name', 'recordId', 'pageNum'].map(k => page[k]),
        page, blockNum)
    })
}

const addProposal = (proposal, blockNum) => {
  return addBlockState('proposals', 'proposalId', proposal.proposalId, proposal, blockNum)
}
/*
const addExchange = (exchange, blockNum) => {
  return addBlockState('exchanges', 'timestamp', exchange.timestamp, exchange, blockNum)
}
*/
const addExchange = (exchange, blockNum) => {
  return addBlockState('exchanges', 'attributes',
    ['buyProposalId', 'sellProposalId'].map(k => exchange[k]),
    exchange, blockNum)
}

module.exports = {
  addParticipant,
  addRecord,
  addTable,
  addProperty,
  addPropertyPage,
  addProposal,
  addExchange
}
