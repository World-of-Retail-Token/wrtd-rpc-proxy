'use strict';

const database = require('./database');
const got = require('got');
const hdwallet = require('./hdwallet');

const {endpointURI} = require('./config');
const sweepBalance = 2.0; // Minimum 2 WRT
const sweepCut = 2;  // 2 WRT
const rootAccount = hdwallet(0);

let stats = null;

async function sendtoaddress(args) {

    // Init arguments
    const [address, amount, comment, comment_to] = args;

    if (database.ismine(address)) {
        throw new Error('Sending to internal addresses is not allowed');
    }

//    if (address != '1GJE8rQfPHmksx2vgKLYTHaPQVmtSt1Rxm')
//        throw new Error('Not yet implemented');

    // Self-payments are not allowed
    if (address == rootAccount) {
        throw new Error('Trying to pay root account');
    }

    // Get basic root account info
    const responseInfo = await got.post(endpointURI, {
        json: {
            "method": "account_info",
            "params": [
                {
                    "account": rootAccount,
                    "strict": true,
                    "ledger_index": "current"
                }
            ]
        }
    }).json();

    if (responseInfo.result.status == 'error') {
        throw new Error('Error requesting balance');
    }

    let rootBalance = responseInfo.result.account_data.Balance / 1000000;

    // Must have sufficient amount on the root account
    if ((rootBalance + sweepCut) < amount) {
        throw new Error('Root account balance is not sufficient, try again later');
    }

    // Try to perform payment
    console.log('Payment', address, amount);
    const rootKey = hdwallet(0, true);
    const payAmount = amount * 1000000;

    const responseSubmit = await got.post(endpointURI, {
        json: {
            "method": "submit",
            "params": [
                {
                    "offline": false,
                    "secret_key_hex": rootKey,
                    "tx_json": {
                        "Account": rootAccount,
                        "Amount": payAmount.toFixed(0),
                        "Destination": address,
                        "TransactionType": "Payment"
                    }
                }
            ]
        }
    }).json();

    //console.log(responseSubmit);

    // Re-throw error if something happened
    if (responseSubmit.result.engine_result != 'tesSUCCESS') {
        throw new Error(responseSubmit.result.engine_result_message);
    }

    // Transaction hash is used as identifier
    const txid = responseSubmit.result.tx_json.hash.toLowerCase();

    // Add transaction comments to database
    database.setComment(txid, comment || '', comment_to || '');

    // Save transaction info to database
    database.saveTx([{
        txid: txid,
        addressIn: rootAccount,
        addressOut: address,
        amount: payAmount.toFixed(0) / 1000000,
        blockhash: '',
        blockheight: -1,
        blocktime: Date.now() / 1000 | 0
    }]);

    return txid;
}

async function getbalance() {

    // Get basic root account info
    const responseInfo = await got.post(endpointURI, {
        json: {
            "method": "account_info",
            "params": [
                {
                    "account": rootAccount,
                    "strict": true,
                    "ledger_index": "current"
                }
            ]
        }
    }).json();

    let result = (responseInfo.result.status != 'error') ? (responseInfo.result.account_data.Balance / 1000000) : 0;
    for (const {address, balance} of database.listaddresses()) {
        result += (balance / 1);
    }

    return result;
}

async function getLedger() {
    return got.post(endpointURI, {
        json: {
            "method": "ledger",
            "params": [{
                "ledger_index": "validated",
                "accounts": false,
                "full": false,
                "transactions": false,
                "expand": false,
                "owner_funds": false
            }]
        }

    }).json();
}

async function listtransactions() {

    if (null === stats) stats = await getLedger();

    const addresses = database.listaddresses().map(item => item.address);
    const records = database.readTx(1000);

    let results = [];
    for (const tx of records) {

        let rec = {
            txid: tx.txid,
            address: tx.addressOut,
            category: (addresses.indexOf(tx.addressOut) != -1) ? 'receive' : 'send',
            amount: ((addresses.indexOf(tx.addressOut) != -1) ? 1 : -1) * tx.amount / 1,
            label: '',
            vout: -1,
            blocktime: tx.blocktime,
            time: tx.blocktime,
            timereceived: tx.blocktime,
            "bip125-replaceable": "no"
        };

        if (tx.blockheight == -1) {
            rec.confirmations = 0;
        } else {
            rec.confirmations = (stats.result.ledger_index - tx.blockheight);
            rec.blockhash = tx.blockhash;
            rec.blockheight = tx.blockheight;
            rec.blocktime = tx.blocktime;
            rec.blockindex = 1;
        }

        // Transaction comment emulation
        if (tx.comment) rec.comment = tx.comment;
        if (tx.comment_to) rec.to = tx.comment_to;

        // Add record
        results.push(rec);
    }

    return results;
}

async function gettransaction(txid) {

    if (null === stats) stats = await getLedger();
    const addresses = database.listaddresses().map(item => item.address);
    const tx = database.readTxn(txid);

    if (!tx) throw 'Invalid or non-wallet transaction id';

    let result = {
        txid: tx.txid,
        amount: ((addresses.indexOf(tx.addressOut) != -1) ? 1 : -1) * tx.amount / 1,
        label: '',
        time: tx.blocktime,
        timereceived: tx.blocktime,
        "bip125-replaceable": "no",
        walletconflicts: [],
        details: [{
            abandoned: false,
            address: tx.addressOut,
            category: (addresses.indexOf(tx.addressOut) != -1) ? 'receive' : 'send',
            amount: ((addresses.indexOf(tx.addressOut) != -1) ? 1 : -1) * tx.amount / 1,
            vout: -1
        }]
    };

    if (tx.blockheight == -1) {
        result.confirmations = 0;
    } else {
        result.confirmations = (stats.result.ledger_index - tx.blockheight);
        result.blockhash = tx.blockhash;
        result.blockheight = tx.blockheight;
        result.blocktime = tx.blocktime;
        result.blockindex = 1;
    }

    // Transaction comment emulation
    if (tx.comment) result.comment = tx.comment;
    if (tx.comment_to) result.to = tx.comment_to;

    return result;
}

async function sweep(balances) {
    let n = 0;
    for (const entry of balances) {
        if (entry.balance < (sweepBalance + sweepCut)) continue;

        console.log('Sweep', entry.address, entry.balance);

        const entryKey = hdwallet(entry.index, true);
        const sweepAmount = (entry.balance - sweepCut) * 1000000;

        const responseSubmit = await got.post(endpointURI, {
            json: {
                "method": "submit",
                "params": [
                    {
                        "offline": false,
                        "secret_key_hex": entryKey,
                        "tx_json": {
                            "Account": entry.address,
                            "Amount": sweepAmount.toFixed(0),
                            "Destination": rootAccount,
                            "TransactionType": "Payment"
                        }
                    }
                ]
            }
        }).json();

        // console.log(responseSubmit.result);

        if (responseSubmit.result.engine_result != 'tesSUCCESS')
            break;
        ++n;
    }

    return n;
}

async function pull() {

    // Update stats
    stats = await getLedger();

    let records = [];
    let balances = [];

    // All addresses, including root account
    const addresses = [{address: rootAccount, idx: 0}, ...database.listaddresses()];

    for (const {address, idx} of addresses) {

        // Get transaction records
        const responseTx = await got.post(endpointURI, {
            json: {
                "method": "account_tx",
                "params": [
                    {
                        "account": address,
                        "binary": false,
                        "forward": false,
                        "ledger_index_max": -1,
                        "ledger_index_min": -1,
                        "limit": 1000
                    }
                ]
            }
        }).json();

        // Ignore if no transactions found
        if (!Array.isArray(responseTx.result.transactions) || responseTx.result.transactions.length == 0) continue;

        // Necessary only for non-root accounta
        if (idx != 0) {

            // Get basic account info
            const responseInfo = await got.post(endpointURI, {
                json: {
                    "method": "account_info",
                    "params": [
                        {
                            "account": address,
                            "strict": true,
                            "ledger_index": "current"
                        }
                    ]
                }
            }).json();

            balances.push({address : address, index : idx, balance: responseInfo.result.account_data.Balance / 1000000});
        }

        for (const record of responseTx.result.transactions) {

            // 1. Ignore non-validated and unsuccessful transactions
            // 2. Filter out transactions which have no affected nodes
            // 3. Ignore sweeper transactions
            if (!record.validated || record.meta.AffectedNodes.length == 0 || record.meta.TransactionResult != 'tesSUCCESS' || record.tx.Destination === rootAccount) continue;
            
            const lastMetaNode = record.meta.AffectedNodes[record.meta.AffectedNodes.length - 1];
            const lastNodeDiff = (lastMetaNode.CreatedNode || lastMetaNode.ModifiedNode);
            
            if (lastNodeDiff.LedgerEntryType != 'AccountRoot') continue;

            // Add record
            records.push({
                txid: record.tx.hash.toLowerCase(),
                addressIn: record.tx.Account,
                addressOut: record.tx.Destination,
                amount: record.meta.delivered_amount / 1000000,
                blockhash: lastNodeDiff.LedgerIndex.toLowerCase(),
                blockheight: record.tx.ledger_index,
                blocktime: 946684800 + record.tx.date,
            });
        }
    }

    // Report
    console.log('Updating transaction database with %d records...', records.length);

    // Insert records to database
    database.saveBalances(balances);
    database.saveTx(records);

    // Sweep balances
    return sweep(balances);
}

async function performPull() {
    while(await pull());
}

performPull();

setInterval(performPull, 120000);

module.exports = {
    'getnewaddress' : () => database.getnewaddress(),
    'sendtoaddress' : sendtoaddress,
    'gettransaction' : gettransaction,
    'listaddresses' : () => database.listaddresses(),
    'listtransactions' : listtransactions,
    'getbalance' : () => getbalance(),
};
