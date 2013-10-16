define(function(require, exports, module){

  var MessageFactory = require('./messages.js').MessageFactory; 
  var PUL = require('./lib/pul.js').PendingUpdateList;
  var UPFactory = require('./lib/pul.js').UPFactory;
  var PULComposer = require('./lib/pulcomposer.js').PULComposer;
  var PULNormalizer = require('./lib/pulnormalizer.js').PULNormalizer;
  var IJSONiq = require('./lib/ijsoniq.js').IJSONiq;
  var _ = require('./lib/underscore') || window._;
  var Utils = require('./lib/utils.js').Utils;
  var IDBWrapper = require('./lib/idbwrapper.js').IDBWrapper;

  var SyncImplClient = exports.SyncImplClient = function(socket, app) {

    this.dbs = {};

    this.syncing = false;
    this.syncIndex = -1;

    this.collection = "todos";

    this.periodicSync = function(){
      var _self = this;
      this.getLocalPul_complete(this.collection, function(localPul){
        if (!_self.syncing && localPul.length){
          _self.startSync(_self.collection, localPul);
        }else if (_self.syncing){
          console.log("periodicSync: already syncing");
        }else if (!localPul.length){
          console.log("periodicSync: no local PUL to sync");
        }
      });
    };
    
    this.getVersionDB = function(callback){
      this.getDataDB("ijsoniqsync_versions", callback);
    };

    this.getDataDB = function(uri, callback){
      var _self = this;
      if (!this.dbs[uri]){
        var dbArgs = {
          storeName: uri,
          keyPath: "id"
        };
        var db;
        db = new IDBWrapper(dbArgs, function(){
          console.log("Opened DB: " + uri);
          _self.dbs[uri] = db;          
          callback(db);
        });
      }else{
        callback(this.dbs[uri]);
      }
    };

    this.getLocalVersion = function(uri, callback){
      var _self = this;
      this.getVersionDB(function(db){
        db.get(0, function(obj){
          if (obj){
            callback(obj[uri]);
          }else{
            callback(undefined);
          }
        });
      });
    };


    this.setLocalVersion = function(uri, version, callback){
      var _self = this;
      var callback = callback || function(){};
      this.getVersionDB(function(db){
        db.get(0, function(obj){
          if (!obj){
            obj = {id: 0};
          }
          obj[uri] = version;
          db.put(obj, function(){
            console.log('Set local version: ' + uri + ':' + version);
            callback(version);
          });
        });
      });
    };


    this.getLocalPul = function(uri, callback){
      var _self = this;
      this.getVersionDB(function(db){
        db.get(0, function(obj){
          if (obj && obj[uri + "_localpul"]){
            callback(obj[uri + "_localpul"]);
          }else{
            callback([]);
          }
        });
      });
    };

    // Get array of local PULs as complete PUL objects
    this.getLocalPul_complete = function(uri, callback){
      this.getLocalPul(uri, function(localPul){
        localPul = localPul || [];
          for (var i = 0; i < localPul.length; i++){
            localPul[i] = new PUL(null,localPul[i]);
        }
        callback(localPul);
      });
    };

    this.appendToLocalPul = function(uri, pul, callback){
      var _self = this;
      this.getLocalPul(uri, function(localPul){
        if (localPul === undefined){
          localPul = [];
        }
        localPul.push(pul.cloneable());
        _self.setLocalPul(uri, localPul, callback);
      });
    };

    this.setLocalPul = function(uri, pul, callback){
      var _self = this;
      this.getVersionDB(function(db){
        db.get(0, function(obj){
          if (obj){
            obj[uri+"_localpul"] = pul;
            db.put(obj, function(){
              callback(pul);
            });
          }else{
            console.log("ERROR: no version object in db");
            callback(undefined);
          }
        });
      });
    };

    this.clearLocalPul = function(uri, callback){
      this.setLocalPul(uri, [], callback );
    };

    this.removeFromLocalPul = function(uri, numPuls, callback){
      var _self = this;
      this.getLocalPul(uri, function(localPul){
        if (localPul === undefined){
          callback(undefined);
        }else{
          localPul.splice(0,numPuls);
          _self.setLocalPul(uri, localPul, callback);
        }
      });
    };

      // Reset client idb
    this.reset = function(){
      this.getDataDB(this.collection, function(db){
        console.log("Clearing todos collection");
        db.clear();
      });      
      this.getVersionDB(function(db){
        console.log("Clearing version collection");
        db.clear();
      });
    };
    
    
    /* Start synchronization */
    this.startSync = function(uri, localPul){
      if (this.syncing){
        console.log("ERROR: startSync() called while already synchronizing");
        return;
      }

      console.log("Starting sync...");
      this.syncing = true;
      this.syncIndex = localPul.length - 1;

      // Construct composed pul to send to server
      var puls = [];
      for (var i = 0; i <= this.syncIndex; i++){
        puls.push(localPul[i]);
      }
      var composer = new PULComposer();
      var pul = composer.composeMultiple(puls);
      if (pul.error){
        console.log("ERROR: invalid local PUL in startSync()");
        this.endSync(uri);
        return;
      }
      
      this.update_client(uri,pul);
    };

    /* End synchronization */
    this.endSync = function(uri){
      var _self = this;
      if (!this.syncing){
        console.log("ERROR: endSync() called while not synchronizing");
        return;
      }
      this.removeFromLocalPul(uri, this.syncIndex + 1, function(){
        _self.syncing = false;
        console.log("...sync done for subscription: " + uri);
      });
    };


    // PROTOCOL INITIATION FUNCTIONS
 
    this.checkout = function(uri){
      this.getLocalVersion(uri, function(version){
        var msg = MessageFactory.msg_checkout(uri, version);
        console.log("Client sending checkout msg: " + JSON.stringify(msg));
        socket.emit("checkout", msg);
      });
    };

    this.update_client = function(uri, pul){
      this.getLocalVersion(uri, function(version){
        var msg = MessageFactory.msg_updateClient(uri, version, pul);
        console.log("Client sending update_client msg: " + JSON.stringify(msg));
        socket.emit("update_client", msg);
      });
    };


    // PROTOCOL HANDLER FUNCTIONS
    
    this.handle_data = function(data){
      console.log("Client handling data msg:");
      console.log(JSON.stringify(data));
      var uri = data.uri;
      var version = data.version;
      var update = data.update;
      data = data.data;
      
      var onError = function(err){
        console.log("handle_data ERROR:", err);
      };
      var _self = this;
      this.getDataDB(uri, function(db){
        // Overwrite db contents
        db.clear(function(){
          console.log("Cleared db: " + uri);
          var batch = [];
          data.forEach(function(item){
            batch.push({type: "put", value: item});        
          });
          db.batch(batch, function(){
            console.log("Set " + uri + " data");
                      
          // Apply update, if any
          if (update){
            IJSONiq.applyPul(new PUL(null, update), function(){
              app.updateView();              
            });
          }else{
            app.updateView();              
          }

          // Update localversion
          _self.setLocalVersion(uri, version);

          },onError);
        },onError);
      });

    };

    this.handle_update_server = function(data){
      console.log("Client handling update msg:");
      console.log(JSON.stringify(data));
      if (this.syncing){
        console.log("Aborting server update, sync in progress.");
        return;
      }
      var _self = this;
      var uri = data.uri;
      var fromVersion = data.fromVersion;
      var update = data.update;
      var toVersion = data.toVersion;

      var onError = function(err){
        console.log("handle_update_server ERROR:", err);
      };

      if (update){
        var onSuccess = function(){
          console.log("handle_update_server: Applied update.");
        };
        _self.applyRemoteUpdate(uri, update, toVersion, onSuccess, onError);
      }
    };


    this.handle_updatereply = function(data){
      console.log("Client handling updatereply msg:");
      console.log(JSON.stringify(data));
      var _self = this;
      var uri = data.uri;
      var newVersion = data.newVersion;
      var conflict = data.conflict;
      var update = data.update;
      var error = data.error;

      var onError = function(err){
        console.log("handle_updatereply ERROR:", err);
      };

      if (conflict){
        console.log("conflict: " + conflict);
        console.log("conflict handling not implemented");
        _self.syncing = false;
        return;
      }else if (error){
        console.log("error: " + error);
        console.log("ERROR error handling not implemented");
        _self.syncing = false;
        return;
      }

      if (update){
        var onSuccess = function(){
          console.log("handle_updatereply: Applied update.");
          _self.endSync(uri);
        };
        _self.applyRemoteUpdate(uri, update, toVersion, onSuccess, onError);
      }else if (newVersion){
        this.setLocalVersion(uri, newVersion, function(){
          _self.endSync(uri)
        });
      }
    };



    // DELEGATED CALLS FROM store.js    
    // We need to hook them because we want all storage interaction
    // to go through IJSONiq.

    this.save = function(collection, id, updateData, callback){
      var _self = this;
      callback = callback || function () {};
      if (typeof id !== 'object'){
        updateData.id = parseInt(id);
      }else{
        callback = updateData;
        updateData = id;
      }
      if (updateData.id == undefined){
        updateData.id = new Date().getTime();
      }

      var pul = new PUL();

      var onError = function(err){
        console.log("save ERROR:", err);
      };

      // Check if item already exists
      this.getDataDB(collection, function(db){
        db.get(updateData.id, function(obj){
          if (!obj){
            // insert UP
            obj = updateData;
            var target = {collection: collection};
            var up = UPFactory.insert(target, [obj]);
            pul.addUpdatePrimitive(up);
          }else{
            var target = {collection: collection, key: updateData.id};
            var up;
            var insertObj = {} ;
            // replace-in-object / insert-into-object UPs
            for (var x in updateData){
              if (updateData.hasOwnProperty(x)){
                if (obj.hasOwnProperty(x)){
                  if(!Utils.objsEqual(updateData[x], obj[x])){
                    // Replace UP
                    up = UPFactory.replace_in_object(target, x, updateData[x]);
                    pul.addUpdatePrimitive(up);
                  }
                }else{
                  // Insert-into-object
                  insertObj[x] = updateData[x];
                }
              }
            }
            if (Object.keys(insertObj).length){
              up = UPFactory.insert_into_object(target, insertObj);
              pul.addUpdatePrimitive(up);
            }
          }

          if (pul.ups()){
            _self.applyLocalUpdate(collection,pul,callback,onError);
          }else{
            console.log("Warning: Empty PUL generated by save()");
            callback();
          }
        },onError);
      },onError);
    };

    this.remove = function(collection,id,callback){
      var _self = this;
      callback = callback || function(){};
      var onError = function(err){
        console.log("remove ERROR:", err);
      };
      
      this.getDataDB(collection, function(db){
        // Generate remove PUL
        var pul = new PUL();
        var target = {collection: collection};
        var up = UPFactory.del(target, [id]);
        pul.addUpdatePrimitive(up);
        _self.applyLocalUpdate(collection,pul,callback,onError);
      },onError);
    }; 



    // REMOTE / LOCAL UPDATE APPLIANCE USING IJSONIQ
    
    this.applyRemoteUpdate = function(uri, update,toVersion, onSuccess, onError){
      var _self = this;
      console.log("Applying remote update: " + update);
      var onSuccess = function(){
        if (toVersion !== undefined){
          _self.setLocalVersion(uri, toVersion);
        }
        setTimeout(function(){
          app.updateView();
        },250);
      };
      IJSONiq.applyPul(new PUL(null,update), onSuccess, onError); 
    };


    /* Apply the pul, append completePul to localPul */
    this.applyLocalUpdate = function(uri, pul, onSuccess, onError){
      var _self = this;
      if (!pul.ups().length){
        return;
      }
      console.log("Applying local update: " + pul);
      IJSONiq.applyPul(pul, function(invertedPul, err){
        if (err){
          onError(err);
        }else{
          pul.inverted = invertedPul;
          _self.appendToLocalPul(uri, pul, function(){
            _self.getLocalPul_complete(uri, function(localPul){
              console.log("Local PUL is now: ");
              localPul.forEach(function(p){
                console.log(""+p);
              });
              var composed = new PULComposer().composeMultiple(localPul);
              console.log("Composed Local PUL:");
              console.log(composed.toString());
              // Clear local PUL if empty
              if (composed.numUps() == 0){
                _self.clearLocalPul(uri, function(ret){
                  if (ret !== undefined){
                    console.log("Cleared Local PUL");
                  }
                });
              }
              onSuccess();
            });
          });
        }
      });
    };


    // check if update pending: local flag with index on localpuls
    // localpul: list of (complete puls) having a pul.inverted field
    // on sync with server: set sync flag & index of up to where we sync
    // on updatereply: if ok, remove localpul up to index, clear sync flag
    //   else if conflict, invert localpul

  };

});

    


