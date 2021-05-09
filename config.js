'use strict';

const config = {
    database: 'db.sqlite',               // Database file path
    mnemonic: '',                        // Use create_mnemonic script to generate new mnemonic and then set it here
    rpchost: '127.0.0.1',                // Proxy listening IP
    rpcport: 3002,                       // Proxy listening port
    endpointURI: 'http://10.8.0.1:8080'  // WRT JSON-RPC server endpoint. Don't use public nodes here because it will expose your private keys
};

// Export settings
module.exports = config;
