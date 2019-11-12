// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const r = require('rethinkdb')

const db = require('./')

/* Helpers */

const getAttribute = attr => obj => obj(attr)
const getRecordId = getAttribute('recordId')
const getProperties = getAttribute('properties')
const getName = getAttribute('name')
const getFinal = getAttribute('final')
const getPublicKey = getAttribute('publicKey')
const getDataType = getAttribute('dataType')
const getReporters = getAttribute('reporters')
const getAuthorization = getAttribute('authorized')
const getReportedValues = getAttribute('reportedValues')
const getStatus = getAttribute('status')

const getAssociatedParticipantId = role => record => record(role).nth(-1)('participantId')
const getOwnerId = getAssociatedParticipantId('owners')
const getCustodianId = getAssociatedParticipantId('custodians')

const getAssociatedParticipants = role => record => record(role).orderBy(r.desc('timestamp'))
const getOwners = getAssociatedParticipants('owners')
const getCustodians = getAssociatedParticipants('custodians')

const hasAttribute = getAttr => attr => obj => r.eq(attr, getAttr(obj))
const hasName = hasAttribute(getName)
const hasRecordId = hasAttribute(getRecordId)
const hasPublicKey = hasAttribute(getPublicKey)
const hasStatus = hasAttribute(getStatus)

const hasBlock = block => obj => {
  return r.and(
    obj('startBlockNum').le(block),
    obj('endBlockNum').gt(block)
  )
}

const getTable = (tableName, block) => {
  return r.table(tableName).filter(hasBlock(block))
}

const getProposals = recordId => receivingKey => block => {
  return getTable('proposals', block)
    .filter(hasRecordId(recordId))
    .filter(hasStatus('OPEN'))
    .pluck('receivingKey', 'issuingKey', 'role', 'properties')
    .coerceTo('array')
}

const findRecord = recordId => block => {
  return getTable('records', block)
    .filter(hasRecordId(recordId))
    .nth(0)
}

const findProperty = recordId => block => propertyName => {
  return getTable('properties', block)
    .filter(hasRecordId(recordId))
    .filter(hasName(propertyName))
    .nth(0)
}

const getReporter = publicKey => block => {
  return getTable('participants', block)
    .filter(hasPublicKey(publicKey))
    .pluck('name', 'publicKey')
    .coerceTo('array')
    .do(results => {
      return r.branch(
        results.isEmpty(),
        { name: 'BAD DATA', publicKey: 'BAD DATA' },
        results(0))
    })
}

const findReportedValues = recordId => propertyName => dataType => reporterKeys => block => {
  return getTable('propertyPages', block)
    .filter(hasRecordId(recordId))
    .filter(hasName(propertyName))
    .concatMap(getReportedValues)
    .map(getUpdate(dataType)(reporterKeys)(block))
    .orderBy(r.desc('timestamp'))
    .coerceTo('array')
}

const getValue = dataType => value => {
  return r.branch(
    r.eq(dataType, 'BOOLEAN'), value('booleanValue'),
    r.eq(dataType, 'NUMBER'), value('numberValue'),
    r.eq(dataType, 'STRING'), value('stringValue'),
    r.eq(dataType, 'BYTES'), value('bytesValue'),
    r.eq(dataType, 'LOCATION'), value('locationValue'),
    r.eq(dataType, 'ENUM'), value('enumValue'),
    r.eq(dataType, 'STRUCT'), value('structValue'),
    value('bytesValue') // if dataType is unknown, use bytesValue
  )
}

const getUpdate = dataType => reporterKeys => block => value => {
  return r.expr({
    'value': getValue(dataType)(value),
    'timestamp': value('timestamp'),
    'reporter': getReporter(reporterKeys.map(getPublicKey).nth(value('reporterIndex')))(block)
  })
}

const getTableProperties = record => block => {
  return getTable('tables', block)
    .filter(hasName(getName(record)))
    .map(getProperties)
    .map(getName)
    .nth(0)
    .map(findProperty(getRecordId(record))(block))
    .coerceTo('array')
}

const getPropertyValues = recordId => block => property => {
  return getReporters(property).do(reporterKeys => {
    return getDataType(property).do(dataType => {
      return r.expr({
        'name': getName(property),
        'dataType': dataType,
        fixed: property('fixed'),
        numberExponent: property('numberExponent'),
        unit: property('unit'),
        'reporterKeys': reporterKeys,
        'values': findReportedValues(recordId)(getName(property))(dataType)(reporterKeys)(block)
      })
    })
  })
}

const getCurrentValue = propertyValue => {
  return r.branch(
    propertyValue('values').count().eq(0),
    null,
    propertyValue('values').nth(0)
  )
}

const makePropertiesEntry = propertyValues => {
  return propertyValues
    .map(entry => {
      return r.object(
        getName(entry),
        entry('values').pluck('value', 'timestamp')
      )
    })
    .reduce((left, right) => left.merge(right))
    .default({})
}

const getAuthorizedReporterKeys = propertyValue => {
  return propertyValue('reporterKeys')
    .filter(getAuthorization)
    .map(getPublicKey)
    .coerceTo('array')
}

/* Queries */

const fetchPropertyQuery = (recordId, name) => block => {
  return findProperty(recordId)(block)(name).do(property => {
    return getPropertyValues(recordId)(block)(property).do(propertyValues => {
      return r.expr({
        'name': name,
        'recordId': recordId,
        'reporters': getAuthorizedReporterKeys(propertyValues),
        'dataType': propertyValues('dataType'),
        'value': getCurrentValue(propertyValues),
        'updates': propertyValues('values')
      })
    })
  })
}

const _loadRecord = (block, authedKey) => (record) => {
  let recordId = getRecordId(record)
  return getTableProperties(record)(block)
    .map(getPropertyValues(recordId)(block)).do(propertyValues => {
      return r.expr({
        'recordId': getRecordId(record),
        'owner': getOwnerId(record),
        'custodian': getCustodianId(record),
        'final': getFinal(record),
        'properties': propertyValues
          .map(propertyValue => r.expr({
            'name': getName(propertyValue),
            'type': getDataType(propertyValue),
            'value': getCurrentValue(propertyValue).do(
              value => r.branch(
                value,
                value('value'),
                value
              )
            ),
            'reporters': getAuthorizedReporterKeys(propertyValue),
          }).merge(r.branch(
            getDataType(propertyValue).eq('NUMBER'),
            { numberExponent: propertyValue('numberExponent') },
            {}
          )).merge(r.branch(
            propertyValue('fixed'),
            { fixed: propertyValue('fixed') },
            {}
          )).merge(r.branch(
            propertyValue('unit').ne(''),
            { unit: propertyValue('unit') },
            {}
          ))),
        'updates': r.expr({
          'owners': getOwners(record),
          'custodians': getCustodians(record),
          'properties': makePropertiesEntry(propertyValues)
        }),
        'proposals': getProposals(recordId)(authedKey)(block)
      })
    })
}

const fetchRecordQuery = (recordId, authedKey) => block => {
  return findRecord(recordId)(block).do(_loadRecord(block, authedKey))
}

const listRecordsQuery = (authedKey, filterQuery) => block => {
  return getTable('records', block)
  .coerceTo('array')
  return getTable('records', block)
    .filter(filterQuery)
    .map(_loadRecord(block, authedKey))
    .coerceTo('array')
}

/* Exported functions */

const fetchProperty = (recordId, propertyName) => {
  return db.queryWithCurrentBlock(fetchPropertyQuery(recordId, propertyName))
}

const fetchRecord = (recordId, authedKey) => {
  return db.queryWithCurrentBlock(fetchRecordQuery(recordId, authedKey))
}

const listRecords = (authedKey, filterQuery) => {
  return db.queryWithCurrentBlock(listRecordsQuery(authedKey, filterQuery))
}

// dgc API call
const getFieldValue = dataType => value => {
  return r.branch(
    r.eq(dataType, 'BOOLEAN').and(value('booleanValue').count().ge(1)), value('booleanValue').nth(-1),
    r.eq(dataType, 'NUMBER').and(value('numberValue').count().ge(1)), value('numberValue').nth(-1),
    r.eq(dataType, 'STRING').and(value('stringValue').count().ge(1)), value('stringValue').nth(-1),
    r.eq(dataType, 'BYTES').and(value('bytesValue').count().ge(1)), value('bytesValue').nth(-1),
    r.eq(dataType, 'LOCATION').and(value('locationValue').count().ge(1)), value('locationValue').nth(-1),
    r.eq(dataType, 'ENUM').and(value('enumValue').count().ge(1)), value('enumValue').nth(-1),
    r.eq(dataType, 'STRUCT').and(value('structValue').count().ge(1)), value('structValue').nth(-1),
    null
  )
}

const findPropertyValues = (recordId, block) => {
  return getTable('propertyPages', block)
    .filter(hasRecordId(recordId))
    .orderBy(r.desc('timestamp'))
    //.orderBy(r.asc('timestamp'))
    .coerceTo('array')
    .concatMap(property => {
      let propertyName = property('name')
      return getTable('properties', block)
        .filter(hasRecordId(recordId))
        .filter(hasName(propertyName))
        .nth(0).do(resource => {
          let dataType = resource('dataType')
          return [property('name'), getFieldValue(dataType)(property('reportedValues'))]
        })
    })
}

const _retrieveRecord = (recordId, block) => {
  return r.expr({
    'recordId': recordId,
    'properties': r.object(r.args(findPropertyValues(recordId, block)))
  })
}

const findRecordId = (params, block, recordId) => {
  return Object.keys(params.query).map(propertyName => {
    let propertyValue = params.query[propertyName]

    return getTable('propertyPages', block)
      .filter({recordId: recordId})
      .filter(hasName(propertyName))
      .coerceTo('array')
      .concatMap(property => {

        return property('reportedValues').concatMap(value => {
          return r.branch(r.eq(value('booleanValue'), propertyValue).or
            (r.eq(value('numberValue'), propertyValue).or
            (r.eq(value('stringValue'), propertyValue).or
            (r.eq(value('bytesValue'), propertyValue).or
            (r.eq(value('locationValue'), propertyValue).or
            (r.eq(value('enumValue'), propertyValue).or
            (r.eq(value('structValue'), propertyValue))))))),
            [property('recordId')],[])
        })
      })
  })
}

const retrieveRecordsQuery = params => block => {
  console.log(params)
  if (params.query.length === 0) {
    return getTable('records', block)
      .filter({table: params.table})
      .filter({final: false})
      .coerceTo("array")
      .map(record => {
        let recordId = record('recordId')
        return _retrieveRecord(recordId, block)
      })
  }

  return getTable('records', block)
    .filter({table: params.table})
    .filter({final: false})
    .coerceTo("array")
    .map(record => {
      let recordId = record('recordId')
      let result = []
      findRecordId(params, block, recordId).map(id => {
        result.push(r.branch(r.eq(id, []), 0 , 1))
      })
      return r.branch(r.add(r.args(result)).lt(result.length), {}, _retrieveRecord(recordId, block))
    })
}

const retrieveRecords = params => {
  return db.queryWithCurrentBlock(retrieveRecordsQuery(params))
}

module.exports = {
  fetchProperty,
  fetchRecord,
  listRecords,
  retrieveRecords
}
