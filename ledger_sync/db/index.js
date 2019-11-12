// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const r = require('rethinkdb')
const config = require('../system/config')

const HOST = config.DB_HOST
const PORT = config.DB_PORT
const NAME = config.DB_NAME
const RETRY_WAIT = config.RETRY_WAIT
const AWAIT_TABLE = 'blocks'

// Connection to db for query methods, run connect before querying
let connection = null

const promisedTimeout = (fn, wait) => {
  return new Promise(resolve => setTimeout(resolve, wait)).then(fn);
}

const awaitDatabase = () => {
  return r.tableList().run(connection)
    .then(tableNames => {
      if (!tableNames.includes(AWAIT_TABLE)) {
        throw new Error()
      }
      console.log('Successfully connected to database:', NAME)
    })
    .catch(() => {
      console.warn('Database not initialized:', NAME)
      console.warn(`Retrying database in ${RETRY_WAIT / 1000} seconds...`)
      return promisedTimeout(awaitDatabase, RETRY_WAIT)
    })
}

const connect = () => {
  return r.connect({host: HOST, port: PORT, db: NAME})
    .then(conn => {
      connection = conn
      return awaitDatabase()
    })
    .catch(err => {
      if (err instanceof r.Error.ReqlDriverError) {
        console.warn('Unable to connect to RethinkDB')
        console.warn(`Retrying in ${RETRY_WAIT / 1000} seconds...`)
        return promisedTimeout(connect, RETRY_WAIT)
      }
      throw err
    })
}

// Runs a specified query against a database table
const queryTable = (table, query, removeCursor = true) => {
  return query(r.table(table))
    .run(connection)
    .then(cursor => removeCursor ? cursor.toArray() : cursor)
    .catch(err => {
      console.error(`Unable to query "${table}" table!`)
      console.error(err.message)
      throw new Error(err.message)
    })
}

// Use for queries that modify a table, turns error messages into errors
const modifyTable = (table, query) => {
  return queryTable(table, query, false)
    .then(results => {
      if (!results) {
        throw new Error(`Unknown error while attempting to modify "${table}"`)
      }
      if (results.errors > 0) {
        throw new Error(results.first_error)
      }
      return results
    })
}

module.exports = {
  connect,
  queryTable,
  modifyTable
}
