BEGIN;

CREATE TABLE IF NOT EXISTS addresses(
    address TEXT,
    balance TEXT
);

CREATE TABLE IF NOT EXISTS transactions(
    txid TEXT,
    addressIn TEXT,
    addressOut TEXT,
    amount TEXT,
    blockhash TEXT,
    blockheight INTEGER,
    blocktime INTEGER,
    PRIMARY KEY (txid)
);

CREATE TABLE IF NOT EXISTS comment(
    txid TEXT,
    comment TEXT,
    comment_to TEXT,
    PRIMARY KEY (txid)
);

COMMIT;
