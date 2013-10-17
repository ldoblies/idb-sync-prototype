if (typeof process !== "undefined") {
  require("amd-loader");
}

// Socket.io server listens to our app
var io = require('socket.io').listen(3000);

var SyncImplServer = require('./syncimpl_server.js').SyncImplServer;
var SyncReg = require('./syncreg.js').SyncReg;
var syncImpl = new SyncImplServer();

// Register server side of the synchronization protocol on each connected client
io.sockets.on('connection', function(socket) {
  SyncReg.register(socket, syncImpl);
});
