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
const db = require('../db/records')
const proposals = require('../db/proposals')

let createTxn = null

const createProposal = (privateKey, action) => {
  return createTxn(privateKey, encodeTimestampedPayload({
    action: protos.PayloadDGC.Action.CREATE_PROPOSAL,
    createProposal: protos.CreateProposalAction.create(action)
  }))
}

const answerProposal = (privateKey, action) => {
  return createTxn(privateKey, encodeTimestampedPayload({
    action: protos.PayloadDGC.Action.ANSWER_PROPOSAL,
    answerProposal: protos.AnswerProposalAction.create(action)
  }))
}

/**
 * Appply the DGC Credit
 */
const answerDGCoinCredit = param => {
  console.log('************ answerDGCoinCredit ************')
  console.log(param)
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
    console.log('Answer the DGC Credit Apply . . .')
    const txns = [answerProposal(param.privateKey, {
      response: protos.AnswerProposalAction.Response.ACCEPT,
      role: protos.Proposal.Role.creditDGC,
      proposalId: param.proposalId,
      receivingParticipant: param.receivingParticipant,
      dgCoinAmount: param.dgCoinAmount,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const creditDGCoin = param => {
  console.log('************ creditDGCoin ************')
  console.log(param)
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
    console.log('Apply DGC Credit Proposal . . .')
    const txns = [createProposal(param.privateKey, {
      //status: protos.Proposal.Status.OPEN,
      role: protos.Proposal.Role.creditDGC,
      proposalId: param.proposalId,
      receivingParticipant: param.receivingParticipant,
      dgCoinAmount: param.dgCoinAmount,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const applyDGCoinCredit = params => {
  const dateTime = Date.now()
  const timestamp = Math.floor(dateTime / 1000)
  const proposalId = 'creditDGC'.concat(timestamp)

  return Promise.resolve()
  .then(() => {
    let proposal = {}
    proposal.privateKey = params['privateKey']
    proposal.proposalId = proposalId
    Object.keys(params['data']).map(key => {
      if (key == 'DGC') {
        proposal.dgCoinAmount = params['data']['DGC']
      }
      if (key == 'receivingKey') {
        proposal.receivingParticipant = params['data']['receivingKey']
      }
    })
    return creditDGCoin(proposal)
  })
  .then(() => {
    // Here is the Auto response for the answer
    // Assume the receiving_participant = issuing_participant for the testing
    // Eventually, should remove the below code one the system in production
    let retrieveQuery = {}
    let query = {}
    query.proposalId = proposalId
    retrieveQuery.query = query
    proposals.retrieve(retrieveQuery).map(proposal => {
      proposal.privateKey = params['privateKey']
      proposal.receivingParticipant = proposal.issuingParticipant
      proposal.dgCoinAmount = proposal.dgCoinAmount
      return answerDGCoinCredit(proposal)
    })
  })
}

/**
 * Sell the DGC Proposal
 */
const sellDGCoinCloseAutoAnswer = param => {
  console.log('************ sellDGCoinCloseAutoAnswer ************')
  console.log(param)
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
    console.log('Answer sell DGC Proposal . . .')
    const txns = [answerProposal(param.privateKey, {
      response: protos.AnswerProposalAction.Response.autoCLOSE,
      role: protos.Proposal.Role.sellDGC,
      proposalId: param.proposalId,
      dgCoinAmount: param.dgCoinAmount,
      //dgCoinExchanged: param.dgCoinExchanged,
      exchanges: param.exchanges,
      //receivingParticipant: param.receivingParticipant,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const sellDGCoinOpenAutoAnswer = param => {
  console.log('************ sellDGCoinOpenAutoAnswer ************')
  console.log(param)
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
    console.log('Answer sell DGC Proposal . . .')
    const txns = [answerProposal(param.privateKey, {
      response: protos.AnswerProposalAction.Response.autoOPEN,
      role: protos.Proposal.Role.sellDGC,
      proposalId: param.proposalId,
      dgCoinAmount: param.dgCoinAmount,
      //dgCoinExchanged: param.dgCoinExchanged,
      //receivingParticipant: param.receivingParticipant,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const sellDGCoin = param => {
  console.log('************ sellDGCoin ************')
  console.log(param)
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
    console.log('Create sell DGC Proposal . . .')
    const txns = [createProposal(param.privateKey, {
      role: protos.Proposal.Role.sellDGC,
      proposalId: param.proposalId,
      dgCoinAmount: param.dgCoinAmount,
      currencyIsoCodes: param.currencyIsoCodes,
      currencyQuoteAmount: param.currencyQuoteAmount,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const sellDGCoinProposal = params => {
  let sell_proposal = {}
  const dateTime = Date.now()
  const timestamp = Math.floor(dateTime / 1000)
  const proposalId = 'sellDGC'.concat(timestamp)

  return Promise.resolve()
  .then(() => {
    sell_proposal.proposalId = proposalId
    sell_proposal.privateKey = params['privateKey']
    Object.keys(params['data']).map(key => {
      if (key == 'DGC') {
        sell_proposal.dgCoinAmount = params['data']['DGC']
      } else {
        sell_proposal.currencyIsoCodes = key
        sell_proposal.currencyQuoteAmount = params['data'][key]
        }
    })
    return sellDGCoin(sell_proposal)
  })
  .then(() => {
    // Looking for the current proposal and get the issuingParticipant
    let sellDGCoinQuery = {}
    let query = {}
    query.proposalId = proposalId
    sellDGCoinQuery.query = query
    proposals.retrieve(sellDGCoinQuery).map(proposal => {
      //sell_proposal.issuingParticipant = proposal.issuingParticipant
      sell_proposal.exchangeRate = proposal.currencyQuoteAmount/proposal.dgCoinAmount
      sell_proposal.balance = proposal.dgCoinAmount-proposal.dgCoinExchanged
    })
  })
  .then(() => {
    // Auto response the answer
    // retrieve the role=buyDGC and status=OPEN proposals and same currency_iso_codes
    let buyDGCoinQuery = {}
    let query = {}
    query.role = 'buyDGC'
    query.status = 'OPEN'
    query.currencyIsoCodes = sell_proposal.currencyIsoCodes
    buyDGCoinQuery.query = query
    proposals.retrieve(buyDGCoinQuery).map(buy_proposal => {
      console.log('************ System Auto Response ************')
      console.log('System is looking for the OPEN proposal of buyDGC . . .')
      let exchanges = []
      let exchange = {}
      exchange.timestamp = timestamp
      exchange.buyProposalId = buy_proposal.proposalId
      exchange.sellProposalId = sell_proposal.proposalId
      exchange.currencyIsoCodes = buy_proposal.currencyIsoCodes
      buy_proposal.exchangeRate = buy_proposal.currencyQuoteAmount/buy_proposal.dgCoinAmount
      buy_proposal.privateKey = params['privateKey']
      //buy_proposal.receivingParticipant = sell_proposal.issuingParticipant
      buy_proposal.balance = buy_proposal.dgCoinAmount-buy_proposal.dgCoinExchanged
      //sell_proposal.receivingParticipant = buy_proposal.issuingParticipant
      if ((buy_proposal.exchangeRate >= sell_proposal.exchangeRate) && (sell_proposal.balance > 0)) {
        let exchangeRate = (buy_proposal.exchangeRate+sell_proposal.exchangeRate)/2
        if (sell_proposal.balance > buy_proposal.balance) {
          console.log('buy_proposal.status = CLOSED , sell_proposal.status = OPEN ')
          //buy_proposal.dgCoinExchanged = buy_proposal.dgCoinExchanged + buy_proposal.balance
          buy_proposal.dgCoinAmount = buy_proposal.balance
          exchange.lastDgcPrice = buy_proposal.balance
          exchange.lastCurrencyPrice = buy_proposal.balance * exchangeRate
          exchanges.push(exchange)
          buy_proposal.exchanges = exchanges
          return buyDGCoinCloseAutoAnswer(buy_proposal)
          .then(() => {
            //sell_proposal.dgCoinExchanged = sell_proposal.dgCoinExchanged + buy_proposal.balance
            sell_proposal.dgCoinAmount = buy_proposal.balance
            sell_proposal.balance = sell_proposal.balance - buy_proposal.balance
            return sellDGCoinOpenAutoAnswer(sell_proposal)
          })
        } else if (sell_proposal.balance < buy_proposal.balance) {
          console.log('buy_proposal.status = OPEN , sell_proposal.status = CLOSED ')
          //buy_proposal.dgCoinExchanged = buy_proposal.dgCoinExchanged + sell_proposal.balance
          buy_proposal.dgCoinAmount = sell_proposal.balance
          return buyDGCoinOpenAutoAnswer(buy_proposal)
          .then(() => {
            sell_proposal.dgCoinAmount = sell_proposal.balance
            //sell_proposal.dgCoinExchanged = sell_proposal.dgCoinExchanged + sell_proposal.balance
            exchange.lastDgcPrice = sell_proposal.balance
            exchange.lastCurrencyPrice = sell_proposal.balance * exchangeRate
            exchanges.push(exchange)
            sell_proposal.exchanges = exchanges
            sell_proposal.balance = 0
            return sellDGCoinCloseAutoAnswer(sell_proposal)
          })
        } else {
          console.log('buy_proposal.status = CLOSED , sell_proposal.status = CLOSED ')
          //buy_proposal.dgCoinExchanged = buy_proposal.dgCoinExchanged + sell_proposal.balance
          buy_proposal.dgCoinAmount = sell_proposal.balance
          exchange.lastDgcPrice = sell_proposal.balance
          exchange.lastCurrencyPrice = sell_proposal.balance * exchangeRate
          exchanges.push(exchange)
          buy_proposal.exchanges = exchanges
          return buyDGCoinCloseAutoAnswer(buy_proposal)
          .then(() => {
            //sell_proposal.dgCoinExchanged = sell_proposal.dgCoinExchanged + sell_proposal.balance
            sell_proposal.dgCoinAmount = sell_proposal.balance
            sell_proposal.balance = 0
            return sellDGCoinCloseAutoAnswer(sell_proposal)
          })
        }
      }
    })
  })
}

/**
 * Buy the DGC Proposal
 */
const buyDGCoinCloseAutoAnswer = param => {
  console.log('************ buyDGCoinCloseAutoAnswer ************')
  console.log(param)
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
    console.log('Answer buy DGC Proposal . . .')
    const txns = [answerProposal(param.privateKey, {
      response: protos.AnswerProposalAction.Response.autoCLOSE,
      role: protos.Proposal.Role.buyDGC,
      proposalId: param.proposalId,
      dgCoinAmount: param.dgCoinAmount,
      //dgCoinExchanged: param.dgCoinExchanged,
      exchanges: param.exchanges,
      //receivingParticipant: param.receivingParticipant,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const buyDGCoinOpenAutoAnswer = param => {
  console.log('************ buyDGCoinOpenAutoAnswer ************')
  console.log(param)
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
    console.log('Answer buy DGC Proposal . . .')
    const txns = [answerProposal(param.privateKey, {
      response: protos.AnswerProposalAction.Response.autoOPEN,
      role: protos.Proposal.Role.buyDGC,
      proposalId: param.proposalId,
      dgCoinAmount: param.dgCoinAmount,
      //dgCoinExchanged: param.dgCoinExchanged,
      //receivingParticipant: param.receivingParticipant,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const buyDGCoin = param => {
  console.log('************ buyDGCoin ************')
  console.log(param)
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
    console.log('Create buy DGC Proposal . . .')
    const txns = [createProposal(param.privateKey, {
      role: protos.Proposal.Role.buyDGC,
      proposalId: param.proposalId,
      dgCoinAmount: param.dgCoinAmount,
      currencyIsoCodes: param.currencyIsoCodes,
      currencyQuoteAmount: param.currencyQuoteAmount,
      //receivingParticipant: param.receivingParticipant,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const buyDGCoinProposal = params => {
  let buy_proposal = {}
  const dateTime = Date.now()
  const timestamp = Math.floor(dateTime / 1000)
  const proposalId = 'buyDGC'.concat(timestamp)

  return Promise.resolve()
  .then(() => {
    // Create the proposal
    buy_proposal.privateKey = params['privateKey']
    buy_proposal.proposalId = proposalId
    Object.keys(params['data']).map(key => {
      if (key == 'DGC') {
        buy_proposal.dgCoinAmount = params['data']['DGC']
      } else {
        buy_proposal.currencyIsoCodes = key
        buy_proposal.currencyQuoteAmount = params['data'][key]
        }
    })
    return buyDGCoin(buy_proposal)
  })
  .then(() => {
    // Looking for the current proposal and get the issuingParticipant
    let buyDGCoinQuery = {}
    let query = {}
    query.proposalId = proposalId
    buyDGCoinQuery.query = query
    proposals.retrieve(buyDGCoinQuery).map(proposal => {
      //buy_proposal.issuingParticipant = proposal.issuingParticipant
      buy_proposal.exchangeRate = proposal.currencyQuoteAmount/proposal.dgCoinAmount
      buy_proposal.balance = proposal.dgCoinAmount-proposal.dgCoinExchanged
    })
  })
  .then(() => {
    // Auto response the answer
    // retrieve the role=sellDGC and status=OPEN proposals and same currency_iso_codes
    let sellDGCoinQuery = {}
    let query = {}
    query.role = 'sellDGC'
    query.status = 'OPEN'
    query.currencyIsoCodes = buy_proposal.currencyIsoCodes
    sellDGCoinQuery.query = query
    proposals.retrieve(sellDGCoinQuery).map(sell_proposal => {
      console.log('************ System Auto Response ************')
      console.log('System is looking for the OPEN proposal of sellDGC')
      let exchanges = []
      let exchange = {}
      exchange.timestamp = timestamp
      exchange.sellProposalId = sell_proposal.proposalId
      exchange.buyProposalId = buy_proposal.proposalId
      exchange.currencyIsoCodes = sell_proposal.currencyIsoCodes
      sell_proposal.exchangeRate = sell_proposal.currencyQuoteAmount/sell_proposal.dgCoinAmount
      sell_proposal.privateKey = params['privateKey']
      sell_proposal.receivingParticipant = buy_proposal.issuingParticipant
      sell_proposal.balance = sell_proposal.dgCoinAmount-sell_proposal.dgCoinExchanged
      buy_proposal.receivingParticipant = sell_proposal.issuingParticipant
      if ((sell_proposal.exchangeRate <= buy_proposal.exchangeRate) && (buy_proposal.balance > 0)) {
        let exchangeRate = (sell_proposal.exchangeRate+buy_proposal.exchangeRate)/2
        if (buy_proposal.balance > sell_proposal.balance) {
          console.log('sell_proposal.status = CLOSED , buy_proposal.status = OPEN ')
          //sell_proposal.dgCoinExchanged = sell_proposal.dgCoinExchanged + sell_proposal.balance
          sell_proposal.dgCoinAmount = sell_proposal.balance
          exchange.lastDgcPrice = sell_proposal.balance
          exchange.lastCurrencyPrice = sell_proposal.balance * exchangeRate
          exchanges.push(exchange)
          sell_proposal.exchanges = exchanges
          return sellDGCoinCloseAutoAnswer(sell_proposal)
          .then(() => {
            //buy_proposal.dgCoinExchanged = buy_proposal.dgCoinExchanged + sell_proposal.balance
            buy_proposal.dgCoinAmount = sell_proposal.balance
            buy_proposal.balance = buy_proposal.balance - sell_proposal.balance
            return buyDGCoinOpenAutoAnswer(buy_proposal)
          })
        } else if (buy_proposal.balance < sell_proposal.balance) {
          console.log('sell_proposal.status = OPEN , buy_proposal.status = CLOSED ')
          //sell_proposal.dgCoinExchanged = sell_proposal.dgCoinExchanged + buy_proposal.balance
          sell_proposal.dgCoinAmount = buy_proposal.balance
          return sellDGCoinOpenAutoAnswer(sell_proposal)
          .then(() => {
            //buy_proposal.dgCoinExchanged = buy_proposal.dgCoinExchanged + buy_proposal.balance
            buy_proposal.dgCoinAmount = buy_proposal.balance
            exchange.lastDgcPrice = buy_proposal.balance
            exchange.lastCurrencyPrice = buy_proposal.balance * exchangeRate
            buy_proposal.balance = 0
            exchanges.push(exchange)
            buy_proposal.exchanges = exchanges
            return buyDGCoinCloseAutoAnswer(buy_proposal)
          })
        } else {
          console.log('sell_proposal.status = CLOSED , buy_proposal.status = CLOSED ')
          //sell_proposal.dgCoinExchanged = sell_proposal.dgCoinExchanged + buy_proposal.balance
          sell_proposal.dgCoinAmount = buy_proposal.balance
          exchange.lastDgcPrice = buy_proposal.balance
          exchange.lastCurrencyPrice = buy_proposal.balance * exchangeRate
          exchanges.push(exchange)
          sell_proposal.exchanges = exchanges
          return sellDGCoinCloseAutoAnswer(sell_proposal)
          .then(() => {
            //buy_proposal.dgCoinExchanged = buy_proposal.dgCoinExchanged + buy_proposal.balance
            buy_proposal.dgCoinAmount = buy_proposal.balance
            buy_proposal.balance = 0
            return buyDGCoinCloseAutoAnswer(buy_proposal)
          })
        }
      }
    })
  })
}

/**
 * Transfer the DGC
 */
const answerDGCoin = param => {
  console.log('************ answerDGCoin ************')
  console.log(param)
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
    console.log('Answer the dgc Transfer . . .')
    const txns = [answerProposal(param.privateKey, {
      response: protos.AnswerProposalAction.Response.ACCEPT,
      role: protos.Proposal.Role.transferDGC,
      proposalId: param.proposalId,
      //issuingParticipant: param.issuingParticipant,
      receivingParticipant: param.receivingParticipant,
      dgCoinAmount: param.dgCoinAmount,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const transferDGCoin = param => {
  console.log('************ transferDGCoin ************')
  console.log(param)
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
    console.log('Create Proposal for the dg Coin transfer. . .')
    const txns = [createProposal(param.privateKey, {
      role: protos.Proposal.Role.transferDGC,
      proposalId: param.proposalId,
      receivingParticipant: param.data.receivingKey,
      dgCoinAmount: param.data.DGC,
    })]
    return submitTxns(txns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const transferDGCoinProposal = params => {  
  const dateTime = Date.now()
  const timestamp = Math.floor(dateTime / 1000)
  params.proposalId = 'transferDGC'.concat(timestamp)

  return Promise.resolve()
  .then(() => {
    // Create the proposal
    return transferDGCoin(params)
  })
  .then(() => {
    // Auto answer the transfer proposal
    // look for the right proposal by proposalId
    let retrieveQuery = {}
    let query = {}
    query.proposalId = params.proposalId
    retrieveQuery.query = query
    proposals.retrieve(retrieveQuery).map(current_proposal => {
      console.log('************ System Auto Response ************')
      console.log('System is looking for the proposal of transferDGC . . .')
      let proposal = {}
      proposal.privateKey = params['privateKey']
      proposal.proposalId = current_proposal.proposalId
      proposal.dgCoinAmount = current_proposal.dgCoinAmount
      // Don't reverse the particpant since this is System Auto Response
      proposal.receivingParticipant = current_proposal.receivingParticipant 
      return answerDGCoin(proposal)
    })
  })
}

/**
 * Transfer Custodianship
 */
const transferCreate = (records) => {
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
    console.log('Create Proposal for Custodianship Transferring . . .')
    const custodianTxns = records.map(record => {
      return createProposal(record.privateKey, {
        role: protos.Proposal.Role.transferCustodianship,
        proposalId: record.proposalId,
        receivingParticipant: record.receivingKey,
        recordId: record.recordId,
      })
    })
    return submitTxns(custodianTxns)
  })  
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const transferAnswer = (records) => {
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
    console.log('Answer Proposal for Custodianship Transferring . . .')
    const custodianTxns = records.map(record => {
      return answerProposal(record.privateKey, {
        response: protos.AnswerProposalAction.Response.ACCEPT,
        role: protos.Proposal.Role.transferCustodianship,
        proposalId: record.proposalId,
        receivingParticipant: record.receivingKey,
        recordId: record.recordId,
      })
    })
    return submitTxns(custodianTxns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const transferCustodianshipProposal = params => {
  return Promise.resolve()
  .then(() => {
    let records= []
    db.retrieveRecords(params).map(param => {
      let record = {}
      const dateTime = Date.now()
      const timestamp = Math.floor(dateTime / 1000)
      record.proposalId = 'transferCustodianship'.concat(timestamp)
      record.privateKey = params['privateKey']
      record.receivingKey = params['receivingKey']
      record.recordId = param['recordId']
      records.push(record)
    })
    return transferCreate(records)
  })
}

/**
 * Authorizing New Reporters
 */
const authorizeCreate = (records) => {
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
    console.log('Create Proposal for Authorizing New Reporters . . .')
    const authorizeTxns = records.map(record => {
      return createProposal(record.privateKey, {
        role: protos.Proposal.Role.authorizeReporter,
        proposalId: record.proposalId,
        receivingParticipant: record.receivingKey,
        recordId: record.recordId,
        properties: record.reportableProperties
      })
    })
    return submitTxns(authorizeTxns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const authorizeAnswer = (records) => {
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
    console.log('Answer Proposal for Authorizing New Reporters . . .')
    const authorizeTxns = records.map(record => {
      return answerProposal(record.privateKey, {
        response: protos.AnswerProposalAction.Response.ACCEPT,
        role: protos.Proposal.Role.authorizeReporter,
        proposalId: record.proposalId,
        receivingParticipant: record.receivingKey,
        recordId: record.recordId,
        properties: record.reportableProperties,
      })
    })
    return submitTxns(authorizeTxns)
  })
  .catch(err => {
    console.error(err.toString())
    throw err
  })
}

const authorizeReporterProposal = params => {
  return Promise.resolve()
  .then(() => {
    let records= []
    db.retrieveRecords(params).map(param => {
      let record = {}
      const dateTime = Date.now()
      const timestamp = Math.floor(dateTime / 1000)
      record.proposalId = 'transferCustodianship'.concat(timestamp)
      record.privateKey = params['privateKey']
      record.receivingKey = params['receivingKey']
      record.recordId = param['recordId']
      records.push(record)
    })
    return authorizeCreate(records)
  })
}

/**
 * Formatting the proposals
 */

const answerCustodianshipTransfer = params => {
  return Promise.resolve()
  .then(() => {
    let records= []
    db.retrieveRecords(params).map(param => {
      let record = {}
      record.privateKey = params['privateKey']
      record.receivingKey = params['receivingKey']
      record.recordId = param['recordId']
      records.push(record)
    })
    return transferAnswer(records)
  })
}

const answerReporterAuthorize = params => {
  return Promise.resolve()
  .then(() => {
    let records= []
    db.retrieveRecords(params).map(param => {
      let record = {}
      record.privateKey = params['privateKey']
      record.receivingKey = params['receivingKey']
      record.recordId = param['recordId']
      records.push(record)
    })
    return authorizeAnswer(records)
  })
}

module.exports = {
  applyDGCoinCredit,
  buyDGCoinProposal,
  sellDGCoinProposal,
  transferDGCoinProposal,
  authorizeReporterProposal,
  answerReporterAuthorize,
  transferCustodianshipProposal,
  answerCustodianshipTransfer
}
