/**
 * Factory module for messages used in the synchronization protocol
 */
define(function(require, exports, module){

  /**
   * Factory module for messages used in the synchronization protocol
   *
   * @author ldoblies
   */ 
  var MessageFactory = exports.MessageFactory = {

    MSGTYPE: {
      CHECKOUT: 0,
      DATA: 1,
      UPDATE_SERVER: 2,
      UPDATE_CLIENT: 3,
      UPDATEREPLY: 4
    },

    msgTypeToString: function(type){
      if (typeof type == 'object'){
        type = type.type;
        if (type == undefined){
          type = -1;
        }
      }
      switch (type){
        case 0:
          return "checkout";
        case 1:
          return "data";
        case 2: 
          return "update_server";
        case 3:
          return "update_client";
        case 4:
          return "updatereply";
        default:
          return "ERRORTYPE";
      }
    },

    msg_checkout: function(uri,version){
      var msg = { type: this.MSGTYPE.CHECKOUT, uri: uri };
      if (version !== undefined){
        msg.version = version;
      }
      return msg;
    },

    msg_data: function(uri,version,data,error){
      var msg = {type: this.MSGTYPE.DATA,
        uri: uri, version: version, data: data};
      if (error !== undefined){
        msg.error = error;
      }
      return msg;
    },

    msg_updateServer: function(uri,fromVersion,update,toVersion){
      var msg = {type: this.MSGTYPE.UPDATE_SERVER,
        uri: uri, fromVersion: fromVersion, update: update};
      if (toVersion !== undefined){
        msg.toVersion = toVersion;
      }
      return msg;
    },

    msg_updateClient: function(uri,fromVersion,update){
      var msg = {type: this.MSGTYPE.UPDATE_CLIENT,
        uri: uri, fromVersion: fromVersion, update: update};
      return msg;
    },

    msg_updateReply: function(uri,newVersion, conflict, update, error){
      var msg = {type: this.MSGTYPE.UPDATE_SERVER,
        uri: uri};
      if (newVersion !== undefined){
        msg.newVersion = newVersion;
      }
      if (conflict !== undefined){
        msg.conflict = conflict;
      }
      if (update !== undefined){
        msg.update = update;
      }
      if (error !== undefined){
        msg.error = error;
      }
      return msg;
    }
  };
});

