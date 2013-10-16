define(function(require, exports, module){

  var MessageFactory = require('./messages.js').MessageFactory; 
  var PUL = require('./lib/pul.js').PendingUpdateList;
  var PULComposer = require('./lib/pulcomposer.js').PULComposer;
  var PULNormalizer = require('./lib/pulnormalizer.js').PULNormalizer;
  var _ = require('./lib/underscore') || window._;
  var Utils = require('./lib/utils.js').Utils;

  var SyncImplServer = exports.SyncImplServer = function() {
    // Some initial data for checkouts (in a real-life example 
    // this data would come from the server DB)
    this.initialData = [
      {id: 0, title: "Write Presentation", completed: 1},
      {id: 1, title: "Hold Presentation", completed: 0}
    ];

    // The oldest available version
    this.oldestVersion = 0;

    // The current version of the data on the server
    this.localVersion = 0;

    // The URI of the collection for which this SyncImpl is for.
    this.collectionURI = "todos";
   
    // The sequential list of PULs that were 'applied' on the
    // server DB. We omit storing version numbers because we 
    // store a new version number for each PUL in this example,
    // i.e. pulData[i] is the pul leading from version i to 
    // version i+1.
    this.pulData = [];

    this.checkURI = function(uri){
      if (uri !== this.collectionURI){                
        return "Invalid Collection URI: " + collectionURI;
      }
    };

    this.checkVersion = function(version){
      if (version < this.oldestVersion || version > this.localVersion){
        return "Invalid version: " + version;
      }
    };

    this.getPuls = function(fromVersion, toVersion){
      if (this.checkVersion(fromVersion) || this.checkVersion(toVersion)){
        return [];
      }
      var ret = [];
      for (var i = fromVersion; i < toVersion; i++){
        ret.push(this.pulData[i - this.oldestVersion]);
      }
      return ret;
    };

    // Get an Update from fromVersion to toVersion.
    // pul is a PUL to be applied after toVersion, but constructed from the view
    // of fromVersion. Remove any obsolete UPs from it.
    this.getUpdate = function(fromVersion, toVersion, pul){
      if (this.checkVersion(fromVersion) || this.checkVersion(toVersion)){
        return;
      }
      var puls = this.getPuls(fromVersion, toVersion);
      var composer = new PULComposer();
      return composer.composeMultiple(puls);
    };


    // pul is a PUL to be applied after toVersion, but constructed from the view
    // of fromVersion. Remove any obsolete UPs from it.
    // Return a conflict object in case there are any conflicts.
    this.checkConflict = function(fromVersion, pul){
      var puls = this.getPuls(fromVersion, this.localVersion);      
      var composed =  new PULComposer().composeMultiple(puls);
      if (composed.error){
        console.log("ERROR : composed PUL of pulData is invalid");
        return;
      }

      // Remove obsolete UPs (updates on deleted documents) 
      pul.del.forEach(function(curDel){
        curDel.params[0] = _.reject(curDel.params[0], function(id){
          return composed.getsDeleted(curDel.target.collection, id);
        });
      });

      pul.replace_in_object = _.reject(pul.replace_in_object, function(curRep){
        return composed.getsDeleted(curRep.target.collection, curRep.target.key);
      });

      pul = new PULNormalizer().normalize(pul);

      var pulUpdates = pul.computeUpdates();

      var composedUpdates = composed.computeUpdates();
      var ret = [];

      // Check for each update whether it exists in both puls and is
      // conflicting (different value)
      pulUpdates.forEach(function(curUp){
        var otherUp = _.find(composedUpdates, function(compUp){
          return compUp.target == curUp.target && 
            !(Utils.objsEqual(curUp.value, compUp.value));
        });
        if (otherUp){
          ret.push("Conflicting updates on key: " + curUp.target);
        }
      });


      if (ret.length){
        return ret;
      }
    };


    this.handle_checkout = function(data, socket){
      var composer = new PULComposer();
      console.log("Server handling checkout msg:");
      console.log(JSON.stringify(data));
      var err = this.checkURI(data.uri);
      if (data.version && this.checkVersion(data.version)){
        // Invalid version from client - treat like client has no data 
        // for that uri yet
        data.version = undefined;
      }
      var replyMsg;
      if (!err){
        if (data.version == undefined){
          // Send initialdata + all puls
          replyMsg = MessageFactory.msg_data(data.uri, 0, this.initialData);
          if (this.pulData.length){
            replyMsg.update = composer.composeMultiple(this.pulData);            
          }
        }else{
          // Only send delta
          var update;
          var toVersion;
          if (data.version < this.localVersion){
            // Client receives update
            var puls = this.getPuls(data.version, this.localVersion);
            update = composer.composeMultiple(puls);
            toVersion = this.localVersion;
          }
          replyMsg = MessageFactory.msg_updateServer(
            data.uri, data.version, update, toVersion);
        }
      }else{
        replyMsg = MessageFactory.msg_data(data.uri, undefined, undefined, err);
      }

      console.log("Server reply to checkout msg:");
      console.log(JSON.stringify(replyMsg));

      socket.emit(MessageFactory.msgTypeToString(replyMsg.type), replyMsg);
    };

    this.handle_update_client = function(data, socket){
      console.log("Server handling update msg:");
      console.log(JSON.stringify(data));
      var fromVersion = data.fromVersion;
      var pul = new PUL(null, data.update); 

      var newVersion, conflict, update;
      var err = this.checkURI(data.uri) || this.checkVersion(fromVersion);
      if (!err){
        // Check version
        if (fromVersion !== this.localVersion){
          update = this.getUpdate(fromVersion, this.localVersion, pul);
          conflict = this.checkConflict(fromVersion, pul);
        }
        if (!pul.numUps()){
          // PUL got emptied - client update was obsolete
          newVersion = this.localVersion;
        }else if (!conflict){
          // For now, accept all updates (lax policy)
          this.localVersion++;
          this.pulData.push(pul);
          newVersion = this.localVersion;
          
          // Broadcast accepted update to other clients
          var broadcastMsg = MessageFactory.msg_updateServer(
              data.uri, this.localVersion - 1, pul, this.localVersion);
          console.log("Server broadcasting update msg:");
          socket.broadcast.emit("update_server", broadcastMsg);
        }
      } 
      var replyMsg = MessageFactory.msg_updateReply(
            data.uri, newVersion, conflict, update, err);

      console.log("Server reply to update msg:");
      console.log(JSON.stringify(replyMsg));

      socket.emit("updatereply", replyMsg);
    };
  };

});
