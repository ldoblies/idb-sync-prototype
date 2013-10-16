define(function(require, exports, module){

  var SyncReg = exports.SyncReg = {
    _reg: function(socket, syncimpl, msg){
      if (typeof syncimpl["handle_"+msg] == 'function'){
        socket.on(msg, function(data){
          syncimpl["handle_"+msg](data, socket);
        });
      }
    },

    register: function(socket, syncimpl){
      this._reg(socket, syncimpl, 'checkout');
      this._reg(socket, syncimpl, 'data');
      this._reg(socket, syncimpl, 'update_server');
      this._reg(socket, syncimpl, 'update_client');
      this._reg(socket, syncimpl, 'updatereply');
    }
  };

});

