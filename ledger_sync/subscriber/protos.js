// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const path = require('path')
const _ = require('lodash')
const protobuf = require('protobufjs')

const protos = {}

const loadProtos = (filename, protoNames) => {
  const protoPath = path.resolve(__dirname, '../../protos', filename)
  return protobuf.load(protoPath)
    .then(root => {
      protoNames.forEach(name => {
        protos[name] = root.lookupType(name)
      })
    })
}

const compile = () => {
  return Promise.all([
    loadProtos('participant.proto', [
      'Participant',
      'ParticipantContainer'
    ]),
    loadProtos('property.proto', [
      'Property',
      'PropertyContainer',
      'PropertyPage',
      'PropertyPageContainer',
      'PropertySchema',
      'PropertyValue',
      'Location'
    ]),
    loadProtos('proposal.proto', [
      'Exchange',
      'ExchangeContainer',
      'Proposal',
      'ProposalContainer'
    ]),
    loadProtos('record.proto', [
      'Record',
      'RecordContainer',
      'Table',
      'TableContainer'
    ]),
    loadProtos('payload.proto', [
      'PayloadDGC',
      'CreateParticipantAction',
      'FinalizeRecordAction',
      'CreateRecordAction',
      'CreateTableAction',
      'UpdatePropertiesAction',
      'CreateProposalAction',
      'AnswerProposalAction',
      'RevokeReporterAction'
    ])
  ])
}

module.exports = _.assign(protos, { compile })
