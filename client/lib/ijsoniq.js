/**
 * Module that provides JSONiq PUL application on IndexedDB
 */
define(function(require, exports, module){

  var Utils = require('./utils').Utils;
  var IDBWrapper = require('./idbwrapper').IDBWrapper;
  var UpdateFactory = require('./idbwrapper').IDBUpdateFactory;
  var PendingUpdateList = require('./pul').PendingUpdateList;
  var UPFactory = require('./pul').UPFactory;
  var UpdatePrimitive = require('./pul').UpdatePrimitive;
  var PULNormalizer = require('./pulnormalizer').PULNormalizer;
  var PULInverter = require('./pulinverter').PULInverter;

  /**
   * Module that provides JSONiq PUL application on IndexedDB
   *
   * @author ldoblies
   */
  var IJSONiq = exports.IJSONiq = {


    // DATA ACCESS

    /**
     * Traverse a collection and call onItem(item) for each encountered record,
     * and onItem(undefined) once after all records have been processed.
     *
     * @param {String} name The name of the collection to traverse
     * @param {Function} onItem Success callback. Called for each encountered 
     *  record once, plus once with 'undefined' as argument after all items 
     *  have been processed
     * @param {Function} onError Error callback
     */
    collection: function(name, onItem, onError){
      var store;
      var storeArgs = {
        storeName: name 
      };
      store = new IDBWrapper(storeArgs, function(){
        var tx = store.openTransaction([name], store.consts().READ_ONLY);
        var objStore = tx.objectStore(name);
        var cursorRequest = objStore.openCursor();
        cursorRequest.onsuccess = function(event){
          var cursor = event.target.result;
          if (cursor){
            onItem(cursor.value);
            cursor['continue']();
          }else{
            // End of items
            onItem(undefined);
          }
        };
        cursorRequest.onerror = onError;
      });
    },



    // UPDATE PRIMITIVES APPLICATION

    /**
     * jupd:delete
     *
     * @param {Target} target Target of the update primitive
     * @param {Array} ids The ids to remove from the target collection
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */
    del: function(target, ids, onSuccess, onError, store, transaction){
      var _self = this;
      ids = [].concat(ids);
      if (ids.length == 0){
        return onSuccess();
      }     
      var removes = [];

      var onStore = function(){
        // Remove all ids from store
        for (var i = 0; i < ids.length; i++){
          removes.push({type: "remove", key: ids[i]});
        }
        store.batch(removes, onSuccess, onError);
      };

      var applyDels = 
        function(target, ids, onSuccess, onError, transaction, invertedPul){
          if (!invertedPul) { invertedPul = new PendingUpdateList(new PULInverter());}
          if (ids.length == 0){ return onSuccess(invertedPul.ups());}
          var onGetSuccess = function(event){
            var obj = event.target.result;
            var onRemoveSuccess = function(){
              if (obj){
                invertedPul.addUpdatePrimitive(UPFactory.insert(target, obj));
              }
              ids.shift();
              applyDels(target, ids, onSuccess, onError, transaction, invertedPul);
            };
            var onRemoveError = function(){
              onError("Failed to delete document with id", ids[0]);
            };
            var deleteRequest = 
              transaction.objectStore(target.collection)['delete'](ids[0]);
            deleteRequest.onsuccess = onRemoveSuccess;
            deleteRequest.onerror = onRemoveError;
          };

          var getRequest = transaction.objectStore(target.collection).get(ids[0]);
          getRequest.onsuccess = onGetSuccess;
          getRequest.onerror = onError;
        };


      if (transaction){
        applyDels(target, ids, onSuccess, onError, transaction);
      }else if (store){
        if (store.storeName !== target.collection){
          return onError("Expected store for collection", target.collection);
        }
        onStore();
      }else{
        var storeArgs = {
          storeName: target.collection
        };
        store = new IDBWrapper(storeArgs, function(){
          onStore();
        });
      }
    },

    /**
     * jupd:insert
     *
     * @param {Target} target Target of the update primitive
     * @param {Array} items The records to insert into target collection
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */   
    insert: function(name, items, onSuccess, onError, store, transaction){
      var _self = this;
      var target = name.collection? name : {collection: name};

      itemsCopy = [].concat(items);
      if (items.length == 0){
        return onSuccess();
      }     
      var onStore = function(){
        // Insert all items into store
        var inserts = [];
        for (var i = 0; i < items.length; i++){
          inserts.push({type: "put", value: items[i]});
        }
        store.batch(inserts, onSuccess, onError);
      };

      var applyInserts = 
        function(target, items, onSuccess, onError, transaction, invertedPul){
          if (!invertedPul) { invertedPul = new PendingUpdateList(new PULInverter());}
          if (items.length == 0){ return onSuccess(invertedPul.ups());}

          var onAddSuccess = function(event){
            var id = event.target.result;
            var up = UPFactory.del(target, [id]);
            invertedPul.addUpdatePrimitive(up);
            items.shift();
            applyInserts(target, items, onSuccess, onError, transaction, invertedPul);
          };
          var onAddError = function(event){
            onError("Failed to insert document " + JSON.stringify(items[0]));
          };
          var addRequest = 
            transaction.objectStore(target.collection).add(items[0]);
          addRequest.onsuccess = onAddSuccess;
          addRequest.onerror = onAddError;
        };

      if (transaction){
        applyInserts(target, items, onSuccess, onError, transaction);
      }else if (store){
        if (store.storeName !== target.collection){
          return onError("Expected store for collection", target.collection);
        }
        onStore();
      }else{
        var storeArgs = {
          storeName: target.collection
        };

        store = new IDBWrapper(storeArgs, function(){
          onStore();
        });
      }
    },

    /**
     * jupd:insert-into-object
     *
     * @param {Target} target Target of the update primitive
     * @param {Object} source The source object containing the key/value pairs to
     *  be inserted into target object
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */   
    insert_into_object: function(target, source, onSuccess, onError, store, transaction){
      var kvPairs = Utils.getKeyValuePairs(source);
      var keyPrefix = target.path? target.path + "." : ""; 

      // Assemble update array
      var update = [];
      for (i = 0; i < kvPairs.length; i++){
        var u = UpdateFactory.setUpdate(
            keyPrefix + kvPairs[i].key, kvPairs[i].val, false);
        update.push(u);
      }

      var newOnSuccess = function(result){
        console.log('insert-into-object succeeded');
        if (onSuccess) {onSuccess(result);}
      }

      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },

    /**
     * jupd:delete-from-object
     *
     * @param {Target} target Target of the update primitive
     * @param {Array} names The keys to delete from target object
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */ 
    delete_from_object: function(target, names, onSuccess, onError, store, transaction){
      names = [].concat(names);
      var keyPrefix = target.path? target.path + "." : "";

      // Assemble update array
      var update = [];
      for (i = 0; i < names.length; i++){
        var u = UpdateFactory.deleteUpdate(keyPrefix + names[i]);
        update.push(u);
      }

      var newOnSuccess = function(result){
        console.log('delete-from-object succeeded');
        if (onSuccess) {onSuccess(result);}
      }

      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },

    /**
     * jupd:replace-in-object
     *
     * @param {Target} target Target of the update primitive
     * @param {String} name The key of the value to replace
     * @param {Value} item The value to replace the target with
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */ 
    replace_in_object: function(target, name, item, onSuccess, onError, store, transaction){
      var keyPrefix = target.path? target.path + "." : "";
      var update = UpdateFactory.replaceUpdate(keyPrefix + name, item);

      var newOnSuccess = function(result){
        console.log('replace-in-object succeeded');
        if (onSuccess) {onSuccess(result);}
      }

      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },

    /**
     * jupd:rename-in-object
     *
     * @param {Target} target Target of the update primitive
     * @param {String} name The key to rename 
     * @param {String} newName The value to rename the key to
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */ 
    rename_in_object: function(target, name, newName, onSuccess, onError, store, transaction){
      var keyPrefix = target.path? target.path + "." : "";
      var update = UpdateFactory.renameUpdate(keyPrefix + name, newName);

      var newOnSuccess = function(result){
        console.log('rename-in-object succeeded');
        if (onSuccess) {onSuccess(result);}
      }

      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },

    /**
     * jupd:insert-into-array
     *
     * @param {Target} target Target of the update primitive
     * @param {Integer} index The index at which to insert items
     * @param {Array} source The items to insert
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */ 
    insert_into_array: function(target, index, source, onSuccess, onError, store, transaction){
      index--; // JSONiq uses 1-based indices
      if (!target.path){
        return false;
      }
      var update = 
        UpdateFactory.arrInsertUpdate(target.path, index, source);

      var newOnSuccess = function(result){
        console.log('insert-into-array succeeded');
        if (onSuccess) {onSuccess(result);}
      }

      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },

    /**
     * jupd:delete-from-array
     *
     * @param {Target} target Target of the update primitive
     * @param {Integer} index The index of the item to delete
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */
    delete_from_array: function(target, index, onSuccess, onError, store, transaction){
      index--;
      if (!target.path){
        return false;
      }
      var update = 
        UpdateFactory.arrDeleteUpdate(target.path, index);

      var newOnSuccess = function(result){
        console.log('delete-from-array succeeded');
        if (onSuccess) {onSuccess(result);}
      }

      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },

    /**
     * jupd:replace-in-array
     *
     * @param {Target} target Target of the update primitive
     * @param {Integer} index The index of the item to replace 
     * @param {Value} item The value to replace the target item with
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     */
    replace_in_array: function(target, index, item, onSuccess, onError, store, transaction){  
      index--;
      if (!target.path){
        return false;
      }
      var update = 
        UpdateFactory.arrReplaceUpdate(target.path, index, item);

      var newOnSuccess = function(result){
        console.log('replace-in-array succeeded');
        if (onSuccess) {onSuccess(result);}
      }
      return this.executeUpdate(target, update, newOnSuccess, onError, store, transaction);
    },
    
    /**
     * Helper function that executes an update produced by {@link UpFactory}.
     *
     * @param {Target} target Target of the update primitive
     * @param {Object} update The update to apply
     * @param {Function} onSuccess Success callback
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update 
     *
     *  @see {@link UpFactory}
     */
    executeUpdate: function(target, update, onSuccess, onError, store, transaction){
      if (store){
        store.update(target.key, update, onSuccess, onError, transaction, target.collection);
      }else{
        var storeArgs = {
          storeName: target.collection
        };
        var store;

        store = new IDBWrapper(storeArgs, function(){
          // Execute the update
          store.update(target.key, update, onSuccess, onError);
        });      
      }
    },


    // PUL APPLICATION

    indexUp:  1,
    numUps: -1,

    /**
     * Asynchronously apply a PUL on IndexedDB.
     *
     * @param {Function} onResult Callback. Will retrieve the inverted PUL
     *  as 1. argument if the update succeeded. Otherwise, will retrieve an
     *  Error object as 2. argument.
     */
    applyPul: function(pul, onResult){
      var _self = this;
      var transaction;

      if (!pul.isNormalized){
        var normalizer = new PULNormalizer();
        pul = normalizer.normalize(pul);
      }
      if (pul.error){
        return onResult(null, "Error: Invalid PUL: " + pul.error);
      }

      this.numUps = pul.numUps();
      var pluralized = this.numUps > 1 ? "primitives" : "primitive";
      console.log("Applying PUL with " + this.numUps + " update " + pluralized + ".");
      this.indexUp = 1;

      // Iterate through the ups to determine
      // the objectStores / collections to be modified
      var stores = {};
      var ups = pul.ups();
      for (i = 0; i < ups.length; i++){
        var curUp = ups[i];
        stores[curUp.target.collection] = 1;            
      }
      stores = Object.keys(stores);
      var storeArgs = {
        storeName: stores[0]
      };
      var store;
      var txError;

      store = new IDBWrapper(storeArgs, function(){
        transaction = store.openTransaction(stores, store.consts().READ_WRITE);
        transaction.oncomplete = function () {
          console.log("applyPul transaction.oncomplete");
        };
        transaction.onabort = function () {
          console.log("applyPul transaction.onabort");
        };
        transaction.onerror = function () {
          console.log("applyPul transaction.onerror");
        };

        // Apply the PUL 
        var onUpSuccess = function(result){
          onResult(result);
        };
        var onUpError = function(error){
          onResult(null, error);
        };
        _self.applyUpdatePrimitives(ups, onUpSuccess, onUpError, store, transaction);
      });
    },

    /**
     * Helper function that applies an array of update primitives successively.
     *
     * @param {Function} onSuccess Success callback. Will retrieve the inverted
     *  PUL as 1. argument
     * @param {Function} onError Error callback
     * @param {IDBWrapper} store (optional) The store to use for the update.
     *  Will instantiate a new store on target collection if required
     * @param {IDBTransaction} transaction (optional) The IndexedDB transaction
     *  to use for the update. Will use no transaction if not provided. Note
     *  that if both a store and a transaction are provided, only the
     *  transaction will be used for the update
     * @param {Object} invertedPul Do not provide. Used in recursive calls
     */
    applyUpdatePrimitives: function(ups, onSuccess, onError, store, transaction, invertedPul){
      var _self = this; 
      if (!invertedPul){
        invertedPul = new PendingUpdateList(new PULInverter());
      }
      if (ups.length == 0){
        return onSuccess(invertedPul);
      }
      var up = ups.shift();
      console.log("Applying update primitive " + (this.indexUp++) + "/" + this.numUps
          + ": " + JSON.stringify(up));
      var type = up.type;
      var params = Utils.cloneObject(up.params);
      var onUpSuccess = function(invertedUps){
        invertedUps = [].concat(invertedUps);
        for (i = 0; i < invertedUps.length; i++){
          var invertedUp = invertedUps[i];
          if (invertedUp.type !== "upNoop"){ 
            invertedPul.addUpdatePrimitive(invertedUp);
          }
        }
        _self.applyUpdatePrimitives(ups, onSuccess, onError, store, transaction, invertedPul);
      };
      var onUpError = function(error){
        transaction.abort();
        return onError(error);
      };
      params.unshift(up.target);
      params.push(onUpSuccess);
      params.push(onUpError);
      params.push(store);
      params.push(transaction);

      var applyFunc = this[type];
      if (!applyFunc){
        transaction.abort();
        return onError("ERROR: Invalid UP type " + type);
      }
      if (applyFunc.length != params.length){
        transaction.abort();
        return onError("ERROR: Expected", applyFunc.length, "params for "
            + type, "Params are:", JSON.stringify(params));
      }
      applyFunc.apply(this, params);
    }

  };
});
