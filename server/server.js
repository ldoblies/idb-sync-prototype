if (typeof process !== "undefined") {
  require("amd-loader");
}

// Socket.io server listens to our app
var io = require('socket.io').listen(3000);

var SyncImplServer = require('./syncimpl_server.js').SyncImplServer;
var SyncReg = require('./syncreg.js').SyncReg;
var syncImpl = new SyncImplServer();

// Send current time to all connected clients
function sendTime() {
  io.sockets.emit('time', { time: new Date().toJSON() });
}

// Emit welcome message on connection
io.sockets.on('connection', function(socket) {
  SyncReg.register(socket, syncImpl);
  socket.broadcast.emit('user connected');
  socket.emit('welcome', { message: 'Welcome!' });

  socket.on('i am client', console.log);
});
