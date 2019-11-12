// Copyright (c) The dgc.network
// SPDX-License-Identifier: Apache-2.0

'use strict'

const r = require('rethinkdb')
const config = require('./config')

const HOST = config.DB_HOST
const PORT = config.DB_PORT
const NAME = config.DB_NAME

r.connect({host: HOST, port: PORT})
  .then(conn => {
    console.log(`Creating "${NAME}" database...`)
    r.dbList().contains(NAME).run(conn)
      .then(dbExists => {
        if (dbExists) throw new Error(`"${NAME}" already exists`)
        return r.dbCreate(NAME).run(conn)
      })
      .then(() => {
        console.log('Creating "users" table...')
        return r.db(NAME).tableCreate('users', {
          primaryKey: 'publicKey'
        }).run(conn)
      })
      .then(() => {
        // The usernames table is used to quickly ensure unique usernames
        console.log('Creating "usernames" table...')
        return r.db(NAME).tableCreate('usernames', {
          primaryKey: 'username'
        }).run(conn)
      })
      .then(() => {
        // The emails table is used to quickly ensure unique emails
        console.log('Creating "emails" table...')
        return r.db(NAME).tableCreate('emails', {
          primaryKey: 'email'
        }).run(conn)
      })
      .then(() => {
        console.log('Creating "participants" table...')
        return r.db(NAME).tableCreate('participants').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('participants').indexCreate('publicKey').run(conn)
      })
      .then(() => {
        console.log('Creating "records" table...')
        return r.db(NAME).tableCreate('records').run(conn)
      })
      .then(() => {
        r.db(NAME).table('records').indexCreate('recordId').run(conn)
      })
      .then(() => {
        console.log('Creating "tables" table...')
        return r.db(NAME).tableCreate('tables').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('tables').indexCreate('name').run(conn)
      })
      .then(() => {
        console.log('Creating "properties" table...')
        return r.db(NAME).tableCreate('properties').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('properties').indexCreate('attributes', [
          r.row('name'),
          r.row('recordId')
        ]).run(conn)
      })
      .then(() => {
        console.log('Creating "propertyPages" table...')
        return r.db(NAME).tableCreate('propertyPages').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('propertyPages').indexCreate('attributes', [
          r.row('name'),
          r.row('recordId'),
          r.row('pageNum')
        ]).run(conn)
      })
      .then(() => {
        console.log('Creating "proposals" table...')
        return r.db(NAME).tableCreate('proposals').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('proposals').indexCreate('proposalId').run(conn)
      })
/*      
      .then(() => {
        console.log('Creating "exchanges" table...')
        return r.db(NAME).tableCreate('exchanges').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('exchanges').indexCreate('timestamp').run(conn)
      })
*/      
      .then(() => {
        console.log('Creating "exchanges" table...')
        return r.db(NAME).tableCreate('exchanges').run(conn)
      })
      .then(() => {
        return r.db(NAME).table('exchanges').indexCreate('attributes', [
          r.row('buyProposalId'),
          r.row('sellProposalId')
        ]).run(conn)
      })
      .then(() => {
        console.log('Creating "blocks" table...')
        return r.db(NAME).tableCreate('blocks', {
          primaryKey: 'blockNum'
        }).run(conn)
      })
      .then(() => {
        console.log('Bootstrapping complete, closing connection.')
        return conn.close()
      })
      .catch(err => {
        console.log(`Unable to bootstrap "${NAME}" db: ${err.message}`)
        return conn.close()
      })
  })
  .catch(err => {
    console.log(`Unable to connect to db at ${HOST}:${PORT}: ${err.message}`)
  })
