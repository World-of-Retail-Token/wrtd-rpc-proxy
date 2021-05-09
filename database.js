'use strict';

const fs = require('fs');
const path = require('path');
const hdwallet = require('./hdwallet');

const config = require('./config');
const db = require('better-sqlite3')(config.database, {});

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

// Init schema
db.exec(schema);

module.exports = {
    ismine : (address) => {
        return 0 != db.prepare('SELECT COUNT(rowid) as cnt FROM addresses WHERE address = @address').get({address : address}).cnt;
    },

    getnewaddress : () => {
        // Get top index
        const {top_idx} = db.prepare('SELECT COALESCE(MAX(rowid), 0) as top_idx FROM addresses').get();
        
        // Derive new address
        const new_addr = hdwallet(top_idx + 1);

        // Save address record
        db.prepare('INSERT INTO addresses (address) VALUES (@address)').run({address : new_addr});

        // Return new top address
        return new_addr;
    },

    listaddresses : () => {
        return db.prepare(`SELECT rowid as idx, address, COALESCE(balance, '0') AS balance FROM addresses`).all();
    },

    saveBalances : balances => {
        const update = db.prepare('UPDATE addresses SET balance = @balance WHERE address = @address');

        const updateMany = db.transaction((records) => {
            for (const addr of records) update.run(addr);
        });

        return updateMany(balances);
    },

    readTx : (limit) => {
        return db.prepare(`SELECT txn.*, COALESCE(cmt.comment, '') AS comment, COALESCE(cmt.comment_to, '') AS comment_to FROM transactions txn LEFT JOIN comment cmt ON txn.txid = cmt.txid ORDER BY txn.blockheight DESC LIMIT ?`).all(limit || 1000);
    },

    readTxn : (txid) => {
        return db.prepare(`SELECT txn.*, COALESCE(cmt.comment, '') AS comment, COALESCE(cmt.comment_to, '') AS comment_to FROM transactions txn LEFT JOIN comment cmt ON txn.txid = cmt.txid WHERE txn.txid = ?`).get(txid)
    },

    setComment : (txid, comment, comment_to) => {
        return db.prepare('INSERT OR REPLACE INTO comment(txid, comment, comment_to) VALUES(@txid, @comment, @comment_to)').run({txid : txid, comment : comment, comment_to : comment_to});
    },

    saveTx : transactions => {
        const insert = db.prepare('INSERT OR REPLACE INTO transactions (txid, addressIn, addressOut, amount, blockhash, blockheight, blocktime) VALUES (@txid, @addressIn, @addressOut, @amount, @blockhash, @blockheight, @blocktime)');

        const insertMany = db.transaction((records) => {
            for (const tx of records) insert.run(tx);
        });
        
        return insertMany(transactions);
    }
}
