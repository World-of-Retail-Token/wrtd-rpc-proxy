# wrtd-rpc-proxy
Naive implementation of bitcoin-like JSON-RPC emulator on top of WRT daemon API. Manages a set of created WRT accounts internally without a need to care about such irrelevant things. Allows you to generate multiple WRT accounts and use them simultaneously. All incoming transactions are redirected to root account which is then used for outgoing transactions.

### Supported RPC methods

Only a limited subset of bitcoin RPC methods is actupported.

* getnewaddress - Generate new WRT account address. Account entry is then saved into database and its state is checked via upstream RPC via polling functionality.

* getbalance - Calculates the balance as a sum of balances for all managed WRT accounts.

* listtransactions - Returns a list of transactions that were seen on all managed accounts.

* sendtoaddress - Provides a possibility to send specified amount of WRT to specified address. Note that, unlike original bitcoin methid, this implementation doesn't allow you to send funds to addresses which are owned by current wallet. This means that you can't send funds to yourself and you're only able to use external WRT account as a recipient.

### Getting internal details

There is a possibility to get a list of all WRT accounts which are managed by current proxy instance.

* listaddresses - Returns list of account entries. Each of them contains address, HD key index and account balance. Note that root account is not included in the set.
