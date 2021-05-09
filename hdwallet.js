'use strict';

const config = require('./config');
const bip39 = require('bip39');
const hdkey = require('hdkey');
const bs58check = require('bs58check');
var createHash = require('create-hash');

// Init HD state
const seed = bip39.mnemonicToSeedSync(config.mnemonic);
const root = hdkey.fromMasterSeed(seed);

module.exports = (index, priv = false) => {
    const addrNode = root.derive("m/44'/0'/0'/0/" + (index || 0));

    if (priv) {
        return addrNode._privateKey.toString('hex');
    }

    // console.log('addrnodePublicKey: ', addrNode._publicKey)

    const step1 = addrNode._publicKey;
    const step2 = createHash('sha256').update(step1).digest();
    const step3 = createHash('rmd160').update(step2).digest();

    const step4 = Buffer.allocUnsafe(21);
    step4.writeUInt8(0x00, 0);
    step3.copy(step4, 1);

    return bs58check.encode(step4);
};
