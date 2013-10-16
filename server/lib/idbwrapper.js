define(function(require, exports, module){


  var Utils = require('./utils').Utils;
  var IDBStore = require('./idbstore').IDBStore;
  var UPFactory = require('./pul').UPFactory;
  //var util = require('util');


  var IDBWrapper = exports.IDBWrapper = function(kwArgs, onStoreReady){ 
    this.store = new IDBStore(kwArgs, onStoreReady);
  };

  var noop = function(){};

  IDBWrapper.prototype = {
    

    /*
     * Perform the updates in the 'update' array on an object in the store 
     * selected by 'key'.
     */
    update: function(key, update, onSuccess, onError, transaction, storeName){
      update = [].concat(update);
      var _self = this;
      onError || (onError = function (error) {
        console.error('Could not update data.', error);
      });
      onSuccess || (onSuccess = noop);

      
      
      var onGetSuccess = function(obj){
        if (!obj){
          return onError('Could not retrieve target object from DB');
        }else{
          //console.log("IDBWrapper.update: retrieved obj from DB: ", JSON.stringify(obj));
          //console.log("IDBWrapper.update: retrieved obj from DB");
        }
        var originalObj = JSON.parse(JSON.stringify(obj));
        // Got the value from the DB, update it locally
        for (var i = 0; i < update.length; i++){
          //console.log("Applying update: " + JSON.stringify(update[i]));
          if (!_self.applyUpdate(obj, update[i])){
            return onError('Failed to apply update: ' + JSON.stringify(update[i]));
          }
        }

        onPutSuccess = function(){
          // Compute and return the inversion of this update
          var target = {
            collection: storeName || _self.storeName(),
            key: key
          };
          var invertedUps = UPFactory.upInvert(target, originalObj, obj);
          onSuccess(invertedUps);
        };

        // Store the updated object back to the DB
        if (_self.store.keyPath !== null){
          // Inline keys
          if (!Utils.set(obj, _self.store.keyPath, key, true)){
            return onError('Failed to set inline key');
          }
          //console.log("IDBWrapper: Storing object: " + JSON.stringify(obj));

          if (transaction){
            var putRequest = transaction.objectStore(storeName).put(obj);
            putRequest.onsuccess = onPutSuccess;
            putRequest.onerror = onError;
          }else{
            _self.put(obj, onPutSuccess, onError);
          }
        }else{
          if (transaction){
            var putRequest = transaction.objectStore(storeName).put(obj, key);
            putRequest.onsuccess = onPutSuccess;
            putRequest.onerror = onError;
          }else{
            _self.put(key, obj, onPutSuccess, onError);
          }
        }
      }

      var onDirectGetSuccess = function(event){
        onGetSuccess(event.target.result);        
      };

      // Get the object from the DB
      if (!transaction){
        _self.get(key, onGetSuccess, onError);
      } else{
        var getRequest = transaction.objectStore(storeName).get(key);
        getRequest.onsuccess = onDirectGetSuccess;
        getRequest.onerror = onError;
      }
    },





    // Internals
    
    updConstants: {
      SET: 0,
      REPLACE: 1,
      INSERT: 2,
      DELETE: 3,
      RENAME: 4,
      ARRAY_INSERT: 5,
      ARRAY_DELETE: 6,
      ARRAY_REPLACE: 7
    },

    applyUpdate: function(obj, upd){
      switch (upd.type){
        case this.updConstants.SET:
          return Utils.set(obj, upd.key, upd.val, upd.upsert);

        case this.updConstants.DELETE:
          return Utils.unset(obj, upd.key);

        case this.updConstants.REPLACE:
          return Utils.replace(obj, upd.key, upd.val);

        case this.updConstants.RENAME:
          return Utils.rename(obj, upd.key, upd.val);

        case this.updConstants.ARRAY_INSERT:
          return Utils.arrayInsert(obj, upd.key, upd.index, upd.val);

        case this.updConstants.ARRAY_DELETE:
          return Utils.arrayDelete(obj, upd.key, upd.index);

        case this.updConstants.ARRAY_REPLACE:
          var arr = Utils.getObject(obj, upd.key);
          if (!Utils.isValidIndex(arr, upd.index)) { return true; }
          return Utils.arrayReplace(obj, upd.key, upd.index, upd.val);

        default:
          return false;
      }
    },


    // From IDBStore

    consts: function(){
      return this.store.consts;
    },   
    storeName: function(){
      return this.store.storeName;
    },
    openTransaction: function(objectStores, mode) {
      return this.store.openTransaction(objectStores, mode);
    },
    put: function(key, value, onSuccess, onError, transaction) {
      return this.store.put(key,value,onSuccess, onError, transaction);
    },
    get: function(key, onSuccess, onError, transaction){
      return this.store.get(key,onSuccess,onError, transaction);
    }, 
    remove: function (key, onSuccess, onError) {
      return this.store.remove(key, onSuccess, onError);
    },
    batch: function (dataArray, onSuccess, onError) {
      return this.store.batch(dataArray, onSuccess, onError);
    },
    getAll: function (onSuccess, onError) {
      return this.store.getAll(onSuccess, onError);
    },
    clear: function (onSuccess, onError) {
      return this.store.clear(onSuccess, onError);
    },
    getIndexList: function () {
      return this.store.getIndexList();
    },
    iterate: function (onItem, options) {
      return this.store.iterate(onItem, options);
    },
    query: function (onSuccess, options) {
      return this.store.query(onSuccess, options);
    },
    count: function (onSuccess, options) {
      return this.store.count(onSuccess, options);
    }
  };


  /**
   * Factory methods for update primitives on js objects
   */
  var IDBUpdateFactory = exports.IDBUpdateFactory = {
    /** Set 'key' to 'value' (overwrites key if upsert) */
    setUpdate: function(key, value, upsert){
      if (upsert == undefined){
        upsert = true;
      }
      return {
        type: IDBWrapper.prototype.updConstants.SET,
        key: key,
        val: value,
        upsert: upsert
      };
    },

    /** Delete 'key', if present */
    deleteUpdate: function(key){
      return {
        type: IDBWrapper.prototype.updConstants.DELETE,
        key: key
      };
    },

    /** Replace value of 'key', if key present 
     * or replace the whole object with 'key', if value not set*/
    replaceUpdate: function(key, value){
      if (value == undefined){
        value = key;
        key = undefined;
      }
      return {
        type: IDBWrapper.prototype.updConstants.REPLACE,
        key: key,
        val: value
      };
    },

    /** Rename 'key' to 'newKey', if 'key' present */
    renameUpdate: function(key, newKey){
      return {
        type: IDBWrapper.prototype.updConstants.RENAME,
        key: key,
        val: newKey  
      };      
    },

    /** Insert all 'items' before 'index' in target array */
    arrInsertUpdate: function(key, index, items){
      return {
        type: IDBWrapper.prototype.updConstants.ARRAY_INSERT,
        key: key,
        index: index,
        val: items
      };
    },
    
    /** Delete the item at 'index' in target array */ 
    arrDeleteUpdate: function(key, index){
      return {
        type: IDBWrapper.prototype.updConstants.ARRAY_DELETE,
        key: key,
        index: index,
      };
    },
    
    /** Replace the item at 'index' in target array with 'item',
     * if index is valid */ 
    arrReplaceUpdate: function(key, index, item){
      return {
        type: IDBWrapper.prototype.updConstants.ARRAY_REPLACE,
        key: key,
        index: index,
        val: item
      };
    }
  }; 
});
