/**
 * JS module that implements JSONiq update primitives using IndexedDB as backend
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

  //var fs = require('fs');

  var IJSONiq = exports.IJSONiq = {

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

    /**
     * Delete items from target collection
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

      var applyDels = function(target, ids, onSuccess, onError, transaction, invertedPul){
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
     * Insert items into 'name' collection
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

    /*
     * Insert all pairs of the 'source' object into 'target' object
     *
     * target: object (collection, key, [path])
     * source: object
     *
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


    /*
     * Remove the pairs the names of which appear in 'names'
     * from the 'target' object
     *
     * target: object (collection, key, [path])
     * names: array[string]
     *
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


    /*
     * Replace the value of the pair named 'name' in the 'target' 
     * object with the item 'item' (do nothing if there is no 
     * such pair)
     *
     * target: object (collection, key, [path])
     * name: string
     * item: object
     *
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


    /*
     * Rename the pair originally named 'name' in the 'target' object
     * as 'newName' (do nothing if there is no such pair)
     *
     * target: object (collection, key, [path])
     * name: string
     * newName: string
     *
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
     * Insert all items in 'source' before position 'index' 
     * into target array 'target'
     * 
     * target: object (collection, key, [path])
     * index: int (index in 1-based array)
     * source: array
     *
     */
    insert_into_array: function(target, index, source, onSuccess, onError, store, transaction){
      // TODO behavior if index out of range?
      index--;
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


    /*
     * Remove the item at position 'index' from the 'target' 
     * array (causes all following items in the array to move 
     * one position to the left)
     *
     * target: object (collection, key, [path])
     * index: int (index in 1-based array)
     *
     */
    delete_from_array: function(target, index, onSuccess, onError, store, transaction){  
      // TODO behavior if index out of range?
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


    /*
     * Replace the item at position 'index' in 'target' array
     * with 'item' (do nothing if 'index' is not comprised 
     * between 1 and target array size)
     *
     * target: object (collection, key, [path])
     * index: int (index in 1-based array)
     * item: object
     *
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


    indexUp:  1,
    numUps: -1,

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
      console.log("Applying PUL with " + this.numUps + " update primitives.");
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
