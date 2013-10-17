/**
 * PUL data structures 
 */
define(function(require, exports, module){

  var Utils = require('./utils').Utils;
  var _ = require('./underscore') || window._;

  /*
   * Update Primitive.
   *
   * @param {String} type The type of the Update Primitive, the name of a 
   *  function in IJSONiq.js 
   * @param {String} target The target of the Update Primitive 
   * @param {Object} params Other parameters of the Update Primitive
   *
   * @author ldoblies
   */
  var UpdatePrimitive = exports.UpdatePrimitive = function(type, target, params){
    this.type = type;
    this.target = target;
    this.params = params;
  };

  /**
   * @return {String} A serialized target that includes the UP's selector,
   *  if any
   */
  UpdatePrimitive.prototype.effectiveTarget = function(){
    var _self = this;
    var ret = Utils.serializeTarget(this.target);
    var appendToPath = function(path, pathEntry){
      if (_self.target.path){
        path += "." + pathEntry;
      }
      else{
        path += ":" + pathEntry;
      }
      return path;
    };
    if (this.type === "replace_in_object" || this.type === "rename_in_object"){
      ret = appendToPath(ret, this.params[0]);
    }else if(this.type === "delete_from_object"){
      var retArr = [];
      this.params[0].forEach(function(name){
        retArr.push(appendToPath(ret, name));
      });
      return retArr;
    }
    return ret;
  };

  /**
   * Data structure optimized for storage and retrieval of the targets that a 
   * PUL introduces into the storage layer. If there are multiple targets with
   * matching prefixes, will only keep track of the shortest one.
   *
   * @author ldoblies
   */
  var iTargetList = function(){
    this.list = [];

    this.addItem = function(targetUpPair){
      // Insert targetUpPair into sortedArray, checking whether it
      // is obsolete (there is a prefix target) or it renders other 
      // items obsolete (it is a prefix target for them). Remove
      // obsolete items.
      var idx = _.sortedIndex(this.list, targetUpPair, 'target');
      if (idx > 0){
        // Check if there is a prefix target
        if (Utils.containsTarget(this.list[idx-1].target, targetUpPair.target)){
          return;
        }
      }
      // Check if the new target is a prefix target for others
      var curItem = this.list[idx];
      while (curItem && 
          Utils.containsTarget(targetUpPair.target, curItem.target)){
            this.list.splice(idx,1);
            curItem = this.list[idx];
          }
      this.list.splice(idx, 0, targetUpPair);
    };
  };

  /*
   * Pending Update List
   *
   * @param {Object} handler (optional) The handler for update primitives that 
   * are added to this PUL. If provided, will call the handler's corresponding
   * addUp() function for each update primitive that is to be added to the PUL.
   * @param {PUL} fromPul (optional) If provided, will add all of fromPul's 
   * UPs to this PUL.
   *
   * @see {@link UpdatePrimitive}
   * @see {@link PULComposer}
   * @see {@link PULInverter}
   * @see {@link PULNormalizer}
   *
   * @author ldoblies
   */
  var PendingUpdateList = exports.PendingUpdateList = function(handler, fromPul){

    this.del = [];
    this.insert = [];
    this.insert_into_object = [];
    this.delete_from_object = [];
    this.replace_in_object = [];
    this.rename_in_object = [];
    this.insert_into_array = [];
    this.delete_from_array = [];
    this.replace_in_array = [];

    /** List all update primitives. */
    this.ups = function(){
      return this.replace_in_object.concat(this.delete_from_object).
        concat(this.rename_in_object).concat(this.insert_into_object).
        concat(this.replace_in_array).concat(this.delete_from_array).
        concat(this.insert_into_array).concat(this.del).
        concat(this.insert);
    };

    /**
     * Add a copy of the update primitive to this PUL. Will use the UP handler 
     * if present.
     */
    this.addUpdatePrimitive = function(up){
      var upCopy = Utils.cloneObject(up);      
      var type = upCopy.type;
      var addFunc = this.handler ? this.handler["addUp_" + type] : null;
      if (addFunc){
        addFunc.call(this.handler,this,up);
      }else{ 
        if (handler){
          console.log("Warning: Adding update primitive (" + type + 
              ") without handler function");
        }
        this[type].push(upCopy);
      }
    };

    /**
     * @return {Object} A cloneable version of this PUL (containing only the UP 
     * arrays, no functions). This can be stored in IDB.
     */
    this.cloneable = function(){
      return Utils.noFunctions(this);
    };

    if (fromPul){
      var _self = this;
      var fromUps = this.ups.call(fromPul);
      fromUps.forEach(function(up){
        up.effectiveTarget = UpdatePrimitive.prototype.effectiveTarget;
        _self.addUpdatePrimitive(up);
      });
    }

    /**
     * The UP Handler, if any.
     */
    this.handler = handler;

    this.setHandler = function(h){
      this.handler = h;
    };

    /**
     * @return {Integer} The number of update primitives contained in this PUL
     */
    this.numUps = function(){
      return this.del.length + this.insert.length + this.insert_into_object.length +
        this.delete_from_object.length + this.replace_in_object.length + 
        this.rename_in_object.length + this.insert_into_array.length +
        this.delete_from_array.length + this.replace_in_array.length;
    };

    /**
     * @return {Boolean} True iff the document specified by (collection,key) 
     * gets deleted if this pul is applied.
     */  
    this.getsDeleted = function(collection, key){
      return _.find(this.del, function(curDel){
        return curDel.target.collection == collection &&
        _.find(curDel.params[0], function(curKey){
          return curKey === key;
        });
      }); 
    };

    /**
     * @return {Boolean} True iff a document with key 'key' gets inserted into 
     * 'collection' if this pul is applied. 
     */
    this.getsInserted = function(collection, key){
      return _.find(this.insert, function(curInsert){
        return curInsert.target.collection == collection &&
        _.find(curInsert.params[0], function(curDoc){
          return curDoc.id && curDoc.id === key;
        });
      });
    };

    /**
     * @return {Boolean} True iff a document with key 'key' gets replaced in 
     * 'collection' if this pul is applied. 
     */
    this.getsReplaced = function(collection, key){
      return this.getsDeleted(collection,key) && 
        this.getsInserted(collection,key);
    };

    /**
     * @return {Array} The keys/values that get replaced in objects by this PUL
     */
    this.computeUpdates = function(){
      var upd = this.replace_in_object;
      var ret = [];
      for (var i = 0; i < upd.length; i++){
        var target = upd[i].target;
        var selectedTarget = Utils.serializeTarget(target, upd[i].params[0]);
        var value = upd[i].params[1];
        ret.push({target: selectedTarget, value: value});
      }
      return ret;
    };

    /*
     * @return {Object} An object that contains for each kind of UP in this PUL 
     * the (serialized) targets that appear. 
     */
    this.computeTargets = function(){
      var targets = {
        insert: [],
        del: [],
        delete_from_object: [], // The targets without selectors
        delete_from_object_selected: [], // The targets with selectors
        insert_into_object: [],
        replace_in_object: [], // The targets without selectors
        replace_in_object_selected: [], // The targets with selectors
        rename_in_object: [], // The targets without selectors
        rename_in_object_selected: [], // The targets with selectors
        insert_into_array: [],
        delete_from_array: [],
        replace_in_array: []
      };

      for (var i = 0; i < this.insert.length; i++){
        targets.insert.push(this.insert[i].target.collection);
      }
      for (var i = 0; i < this.del.length; i++){
        targets.del.push(this.del[i].target.collection);
      }
      var upd = this.insert_into_object;
      for (var i = 0; i < upd.length; i++){
        targets.insert_into_object.push(Utils.serializeTarget(upd[i].target));
      }
      upd = this.delete_from_object;
      for (var i = 0; i < upd.length; i++){
        var target = upd[i].target;
        targets.delete_from_object.push(Utils.serializeTarget(target));
        upd[i].params[0].forEach(function(name){
          targets.delete_from_object_selected.push(
            Utils.serializeTarget(target,name));
        });   
      }
      upd = this.replace_in_object;
      for (var i = 0; i < upd.length; i++){
        var target = upd[i].target;
        targets.replace_in_object.push(Utils.serializeTarget(target));
        targets.replace_in_object_selected.push(
            Utils.serializeTarget(target, upd[i].params[0]));
      }
      upd = this.rename_in_object;
      for (var i = 0; i < upd.length; i++){
        var target = upd[i].target;
        targets.rename_in_object.push(Utils.serializeTarget(target));
        targets.rename_in_object_selected.push(
            Utils.serializeTarget(target, upd[i].params[0]));
      }
      upd = this.insert_into_array;
      upd.forEach(function(curUp){
        targets.insert_into_array.push(
          Utils.serializeTarget(curUp.target)+":"+curUp.params[0]);            
      });
      upd = this.delete_from_array;
      upd.forEach(function(curUp){
        targets.delete_from_array.push(
          Utils.serializeTarget(curUp.target)+":"+curUp.params[0]);            
      });
      upd = this.replace_in_array;
      upd.forEach(function(curUp){
        targets.replace_in_array.push(
          Utils.serializeTarget(curUp.target)+":"+curUp.params[0]);            
      });
      return targets;
    };

    /**
     * Traverse the criteria of a target being introduced by a pul and return a 
     * (sorted by target string representation) list of (target,up) pairs. This 
     * list contains no targets t1,t2 for which t1 contains t2 or vice versa.
     * Ignores array UPs.
     *
     * @return {Array} (target,up) pairs of targets that are introduced by this
     *  PUL, along with the UPs that introduce them. Sorted by the target's 
     *  string representation.
     */
    this.computeIntroducedTargets = function(){
      var _self = this;
      var ret = new iTargetList();
      var pulTargets = this.computeTargets();

      // 1. Documents inserted by 'insert' UPs
      this.insert.forEach(function(curInsert){
        Object.keys(curInsert.idMap).forEach(function(curId){
          ret.addItem(
            {target: Utils.serializeTarget(curInsert.target,curId),
              up: curInsert});
        });
      });

      // 2. Objects inserted by insert-into-object UPs (and not deleted by 
      // any delete UP)
      this.insert_into_object.forEach(function(curIIO){
        if (!_self.getsDeleted(curIIO.target.collection, curIIO.target.key)){
          var kvPairs = Utils.getKeyValuePairs(curIIO.params[0]);
          kvPairs.forEach(function(curKVPair){
            var item = {};
            item.target = Utils.serializeTarget(curIIO.target, curKVPair.key);
            item.up = curIIO;
            ret.addItem(item);
          });
        }
      });

      // 3. Objects introduced by renames (and not deleted by any delete UP)
      this.rename_in_object.forEach(function(curRIO){
        if (!_self.getsDeleted(curRIO.target.collection, curRIO.target.key)){
          var item = {};
          item.target = Utils.serializeTarget(curRIO.target, curRIO.params[1]);
          item.up = curRIO;
          ret.addItem(item);
        }
      });     

      // 4. Objects introduced by replace-in-object (and not deleted by any 
      // delete UP)
      this.replace_in_object.forEach(function(curRIO){
        var replaceValue = curRIO.params[1];
        if (typeof replaceValue === 'object' &&
          !_self.getsDeleted(curRIO.target.collection, curRIO.target.key)){
            var kvPairs = Utils.getKeyValuePairs(replaceValue);
            kvPairs.forEach(function(curKVPair){
              var item = {};
              item.target = Utils.serializeTarget(curRIO.target, curRIO.params[0] + "." +curKVPair.key);
              item.up = curRIO;
              ret.addItem(item);
            });
          }
      });

      return ret.list;
    };

  };

  PendingUpdateList.prototype.toString = function(){
    var _self = this;
    var ret = "PUL[";
    var printUpd = function(name){
      var upd = _self[name];        
      if (upd.length){
        ret += "\n  " + name + ":" + JSON.stringify(upd); 
      }
    };
    printUpd("del");
    printUpd("insert");
    printUpd("insert_into_object");
    printUpd("delete_from_object");
    printUpd("replace_in_object");
    printUpd("rename_in_object");
    printUpd("insert_into_array");
    printUpd("delete_from_array");
    printUpd("replace_in_array");
    if (this.numUps()){
      ret += "\n";
    }
    ret += "]";
    return ret;
  };


  /**
   * Update Primitives Factory.
   *
   * @author ldoblies
   */
  var UPFactory = exports.UPFactory = {
    insert: function(target, items){
      items = [].concat(items);
      var t = target.collection ? JSON.parse(JSON.stringify(target)) : {collection: target};
      delete t['key'];
      delete t['path'];

      var params = [items];
      return new UpdatePrimitive("insert", t, params);
    },

    del: function(target, ids){
      var t = target.collection ? JSON.parse(JSON.stringify(target)) : {collection: target};
      delete t['key'];
      delete t['path'];
      var params = [ids];
      return new UpdatePrimitive("del", t, params);
    },

    insert_into_object: function(target, source){
      target = Utils.normalizeTarget(target);
      var params = [source];
      return new UpdatePrimitive("insert_into_object", target, params);
    },

    delete_from_object: function(target, names){
      names = [].concat(names);
      target = Utils.normalizeTarget(target);
      var params = [names];
      return new UpdatePrimitive("delete_from_object", target, params);
    },

    replace_in_object: function(target, name, item){
      target = Utils.normalizeTarget(target);
      var params = [name, item];
      return new UpdatePrimitive("replace_in_object", target, params);
    },

    rename_in_object: function(target, name, newName){
      target = Utils.normalizeTarget(target);
      var params = [name, newName];
      return new UpdatePrimitive("rename_in_object", target, params);
    },

    insert_into_array: function(target, index, items){
      items = [].concat(items);
      target = Utils.normalizeTarget(target);
      var params = [index, items];
      return new UpdatePrimitive("insert_into_array", target, params);
    },

    delete_from_array: function(target, index){
      target = Utils.normalizeTarget(target);
      var params = [index];
      return new UpdatePrimitive("delete_from_array", target, params);
    },

    replace_in_array: function(target, index, item){
      target = Utils.normalizeTarget(target);
      var params = [index, item];
      return new UpdatePrimitive("replace_in_array", target, params);
    },

    upNoop: function(){
      return new UpdatePrimitive("upNoop");
    },


    /**
     * @return {Array} Update primitives that lead from newObj to oldObj 
     */
    upInvert: function(target, oldObj, newObj){
      target = Utils.normalizeTarget(target);
      // NOTE this is brute-force overwriting, we could instead compute the
      // diff between old/newObject and update primitives reflecting this diff.
      // Could directly be achieved by Synthesis operator.
      return [this.del(target, [oldObj.id]), this.insert(target, [oldObj])];
    }

  };

});

