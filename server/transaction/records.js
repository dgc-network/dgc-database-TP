// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const _ = require('lodash')
const protos = require('../blockchain/protos')
const {
  awaitServerPubkey,
  getTxnCreator,
  submitTxns,
  encodeTimestampedPayload
} = require('../system/submit_utils')
const tables = require('../db/tables')
const db = require('../db/records')

let createTxn = null

/**
 * Update the FINAL flag instead of the DELETE
 */
const final = (records) => {
  console.log(records)
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
    console.log('Finalize Records . . .')
    const txns = records.map(record => {
      return createTxn(record.privateKey, encodeTimestampedPayload({
        action: protos.PayloadDGC.Action.FINALIZE_RECORD,
        finalizeRecord: protos.FinalizeRecordAction.create({
          recordId: record.recordId
        })
      }))
    })
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

/**
 * Formatting the records for FINAL
 */
const deleteRecords = params => {
  //console.log(params)
  return Promise.resolve()
  .then(() => {
    let records= []
    db.retrieveRecords(params).map(param => {
        let record = {}
        record.privateKey = params['privateKey']
        record.recordId = param['recordId']
        records.push(record)
    })
    return final(records)
  })
}

/**
 * Update the property value. 
 * Actually, it is create a value by new timestamp
 */
const createUpdate = (privateKey, recordId, property) => {
console.log('createUpdate:property:', property)
  return createTxn(privateKey, encodeTimestampedPayload({
    action: protos.PayloadDGC.Action.UPDATE_PROPERTIES,
    updateProperties: protos.UpdatePropertiesAction.create({
      recordId, properties: [protos.PropertyValue.create(property)]
    })
  }))
}

const update = (records) => {
  console.log(records)
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
    console.log(`Update records . . .`)
    let updateTxns = []
    records.map(record => {
      updateTxns.push(createUpdate(record.privateKey, record.recordId, record.update))
    })
    return submitTxns(updateTxns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

/**
 * Formatting the records for UPDATE
 */
const updateRecords = params => {
  //console.log(params)
  return Promise.resolve()
  .then(() => {
    // check if the record is empty
    db.retrieveRecords(params).map(param => {
      let records= []
      Object.keys(params.data).map(propertyName => {
        let record = {}
        let property = {}
        tables.fetch(params.table).then(table => {
          Object.keys(table.properties).map(key => {
            if (key == propertyName) {
              let dataType = table.properties[key].dataType
              if (dataType == 'BYTES') {
                property.name = propertyName
                property.dataType = 1
                property.bytesValue = params.data[propertyName]
              } else if (dataType == 'BOOLEAN') {
                property.name = propertyName
                property.dataType = 2
                property.booleanValue = params.data[propertyName]
              } else if (dataType == 'NUMBER') {
                property.name = propertyName
                property.dataType = 3
                property.numberValue = params.data[propertyName]
              } else if (dataType == 'STRING') {
                property.name = propertyName
                property.dataType = 4
                property.stringValue = params.data[propertyName]
              } else if (dataType == 'ENUM') {
                property.name = propertyName
                property.dataType = 5
                property.enumValue = params.data[propertyName]
              } else if (dataType == 'STRUCT') {
                property.name = propertyName
                property.dataType = 6
                property.structValue = params.data[propertyName]
              } else if (dataType == 'LOCATION') {
                property.name = propertyName
                property.dataType = 7
                property.locationValue = params.data[propertyName]
              } else {
                property.name = propertyName
                property.dataType = 0
                property.bytesValue = params.data[propertyName]
              }
            }
          })
        })
        record.update = property
        record.privateKey = params['privateKey']
        record.recordId = param['recordId']
        records.push(record)
      })
      return update(records)
    })
  })
}

/**
 * Create the record
 */
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
    console.log('Creating Record . . .')
    const properties = params.properties.map(property => {
      if (property.dataType === protos.PropertySchema.DataType.LOCATION) {
        property.locationValue = protos.Location.create(property.locationValue)
      }
      return protos.PropertyValue.create(property)
    })

    const recordPayload = encodeTimestampedPayload({
      action: protos.PayloadDGC.Action.CREATE_RECORD,
      createRecord: protos.CreateRecordAction.create({
        recordId: params.recordId,
        table: params.table,
        properties
      })
    })
    const txns = [ createTxn(params.privateKey, recordPayload) ]
    return submitTxns(txns)
  })
  .then(res => console.log('Record submitted:\n', JSON.parse(res)))
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

// dgcAPI
const makeRecords = (params, properties) => {
  console.log('Making Records . . .')
  const dateTime = Date.now()
  const timestamp = Math.floor(dateTime / 1000)
  const recordId = params.table.concat(timestamp)
  const record = {}
  record.recordId   = recordId
  record.table  = params.table
  record.privateKey = params.privateKey
  record.properties = properties
  const records = []
  records.push(record)
  return create(records)
}

/**
 * Formatting the records for CREATE
 */
const createRecord = params => {
  return Promise.resolve()
  .then(() => {
    let properties = []
    Object.keys(params.data).map(propertyName => {
      let property = {}
      tables.fetch(params.table).then(table => {
        Object.keys(table.properties).map(key => {
          if (key == propertyName) {
            let dataType = table.properties[key].dataType
            if (dataType == 'BYTES') {
              property.name = propertyName
              property.dataType = 1
              property.bytesValue = params.data[propertyName]
              properties.push(property)
             } else if (dataType == 'BOOLEAN') {
              property.name = propertyName
              property.dataType = 2
              property.booleanValue = params.data[propertyName]
              properties.push(property)
            } else if (dataType == 'NUMBER') {
              property.name = propertyName
              property.dataType = 3
              property.numberValue = params.data[propertyName]
              properties.push(property)
            } else if (dataType == 'STRING') {
              property.name = propertyName
              property.dataType = 4
              property.stringValue = params.data[propertyName]
              properties.push(property)
            } else if (dataType == 'ENUM') {
              property.name = propertyName
              property.dataType = 5
              property.enumValue = params.data[propertyName]
              properties.push(property)
            } else if (dataType == 'STRUCT') {
              property.name = propertyName
              property.dataType = 6
              property.structValue = params.data[propertyName]
              properties.push(property)
            } else if (dataType == 'LOCATION') {
              property.name = propertyName
              property.dataType = 7
              property.locationValue = params.data[propertyName]
              properties.push(property)
            } else {
              property.name = propertyName
              property.dataType = 0
              property.bytesValue = params.data[propertyName]
              properties.push(property)
            }
          }
        })
      })
    })
    //return makeRecords(params, properties)
    const dateTime = Date.now()
    const timestamp = Math.floor(dateTime / 1000)
    const recordId = params.table.concat(timestamp)
    const record = {}
    record.privateKey = params.privateKey
    record.recordId   = recordId
    record.table  = params.table
    record.properties = properties
    return create(record)
    const records = []
    records.push(record)
    return create(records)
  })
  .catch(err => {
    console.error(err.toString())
  })
}

module.exports = {
  createRecord,
  updateRecords,
  deleteRecords
}
