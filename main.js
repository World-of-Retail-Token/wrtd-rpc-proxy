'use strict';

const http = require('http')
const { JSONRPCServer } = require("json-rpc-2.0");

const { rpcport, rpchost } = require('./config');
const handlers = require('./handlers');

// JSON-RPC implementation
const server = new JSONRPCServer();

// Set handlers
server.addMethod('getbalance', handlers.getbalance);
server.addMethod('gettransaction', handlers.gettransaction);
server.addMethod('getnewaddress', handlers.getnewaddress);
server.addMethod('listaddresses', handlers.listaddresses);
server.addMethod('listtransactions', handlers.listtransactions);
server.addMethod('sendtoaddress', handlers.sendtoaddress);

// Stubs
server.addMethod('encryptwallet', () => "");
server.addMethod('walletpassphrase', () => null);

const app = http.createServer(function (request, response) {
    if (request.method == 'POST') {
        var body = '';
        request.on('data', function (data) {
            body += data;
        });
        request.on('end', function () {

            try {
                const jsonRPCRequest = JSON.parse(body);

                // Workaround for request parser
                jsonRPCRequest.jsonrpc = "2.0";

                // server.receive takes a JSON-RPC request and returns a promise of a JSON-RPC response.
                // Alternatively, you can use server.receiveJSON, which takes JSON string as is (in this case req.body).
                server.receive(jsonRPCRequest).then((jsonRPCResponse) => {
                    if (jsonRPCResponse) {
                        response.writeHead(200, { 'Content-Type': 'application/json' });
                        response.end(JSON.stringify(jsonRPCResponse));
                    } else {
                        // If response is absent, it was a JSON-RPC notification method.
                        // Respond with no content status (204).
                        response.sendStatus(204);
                    }
                });

            } catch (e) {
                response.writeHead(500, { 'Content-Type': 'application/json' });
                response.end();
            }
        });
    } else {
        var json = `{}`;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(json);
    }
});

app.listen(rpcport, rpchost);
