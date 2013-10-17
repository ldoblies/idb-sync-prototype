/**
 * PUL Composer
 */ 
define(function(require, exports, module){

  var Utils = require('./utils').Utils;
  var PUL = require('./pul').PendingUpdateList;
  var UPAggregator = require('./upaggregator').UPAggregator;
  var PULNormalizer = require('./pulnormalizer').PULNormalizer;
  var _ = require('./underscore') || window._;

  /**
   * Composer (UP Handler for a PUL that is to be composed with the incoming 
   * UPs). Assuming that the two PULs are serial, i.e., the right-hand-side PUL
   * was created from the database state after the left-hand-side PUL was 
   * applied. 
   *
   * @author ldoblies
   */
  var PULComposer = exports.PULComposer = function(){

    this.error = null;

    this.setError = function(err){
      console.err(err);
      this.error = err;
    }; 

    /** Compose an array of successive PULs */
    this.composeMultiple = function(puls){
      var composed = puls[0];
      for (var i = 1; !composed.error && i < puls.length; i++){
        composed = this.compose(composed, puls[i]);
      };
      return composed;
    };

    /**
     * Compose pul1, pul2. pul2 is the right-hand-side PUL for composition.
     *
     * @param {PUL} pul1 Left-hand side PUL. The composed PUL will be initiated
     *  to a copy of pul1 in the beginning, and then be composed with the UPs 
     *  from p2
     * @param {PUL} pul2 Right-hand side PUL
     */
    this.compose = function(pul1, pul2){
      var p = Utils.cloneObject(pul1);
      var normalizer = new PULNormalizer();
      p = normalizer.normalize(p);
      pul2 = Utils.cloneObject(pul2);
      pul2 = normalizer.normalize(pul2);

      if (p.error || !p.isNormalized){
        p.error = "Invalid left-hand-side PUL for composition";
        return p;
      }else if (pul2.error || !pul2.isNormalized){
        p.error = "Invalid right-hand-side PUL for composition";
        return p;
      }
      p.setHandler(this);
      var ups = pul2.ups();
      for(var i = 0; !this.error && i < ups.length; i++){
        p.addUpdatePrimitive(ups[i]);
      }
      if (this.error){
        p.error = this.error;
        return p;
      }
      p = this.finalize(p);
      return p;
    };



    // INTERNALS 


    /** 
     * To be called once after PUL composition. Removes any temporary data 
     * structures introduced into the composed PUL and normalizes it.
     */
    this.finalize = function(pul){
      // Remove introducedTargets from pul
      delete pul["introducedTargets"];

      // Remove idMap2 from insert UPs
      var upd = pul.insert;
      for (var i = 0; i < upd.length; i++){
        delete upd[i]["idMap2"];
      };

      // Remove delIds2 from delete UPs
      upd = pul.del;
      for (var i = 0; i < upd.length; i++){
        delete upd[i]["delIds2"];
      };

      // Remove empty UPs
      pul.insert = _.reject(pul.insert, function(item){
        return item.params[0].length === 0;
      });
      pul.del = _.reject(pul.del, function(item){
        return item.params[0].length === 0;
      });
      pul.insert_into_object = _.reject(pul.insert_into_object, function(item){
        return Object.keys(item.params[0]).length === 0;
      });
      pul.delete_from_object = _.reject(pul.delete_from_object, function(item){
        return item.params[0].length === 0;
      });

      var normalizer = new PULNormalizer();
      pul = normalizer.normalize(pul);
      return pul;
    };

    /**
     * @return {UpdatePrimitive} If pul introduces the target (or any of its 
     *  ancestors) of up, the update primitive in the pul that introduces it. 
     *  Else, undefined. 
     */
    this.getAggregationTarget = function(pul, up){
      // Insert/delete ups are handled separately - they don't require
      // aggregation 
      if (up.type === "insert" || up.type === "del"){ return; }
      // Needed for replace/rename/delete_from_object 
      var upTargets = [].concat(up.effectiveTarget());
      if (!pul.introducedTargets){
        pul.introducedTargets = pul.computeIntroducedTargets();
      }
      for (var effIdx = 0; effIdx < upTargets.length; effIdx++){
        var curEffTarget = upTargets[effIdx];
        for (var i = 0; i < pul.introducedTargets.length; i++){
          if (Utils.containsTarget(pul.introducedTargets[i].target, curEffTarget)){
            return pul.introducedTargets[i].up;
          }
        }
      }
    };

    /**
     * Aggregate sourceUp on targetUp. 
     * @return {Boolean} True iff sourceUp was updated and still has to be added
     *  to the pul.
     *
     * @see {@link UPAggregator}
     */
    this.aggregate = function(pul, targetUp, sourceUp){
      var aggResult = UPAggregator.aggregate(pul,targetUp,sourceUp);
      if (aggResult.error){
        this.error = aggResult.error;
      }
      return aggResult.sourceModified;
    };


    // HELPER FUNCTIONS

    this.findUpdate = function(upType, selector, upCollection){
      for (var i = 0; i < upCollection.length; i++){
        var curUp = upCollection[i];
        if (curUp.type === upType){
          var found = true;
          for (var j = 0; j < selector.length && found; j++){
            if (!this.evalSelector(curUp, selector[j])){
              found = false;
            }
          }
          if (found) { return curUp; }
        }
      }
    };

    this.evalSelector = function(up, selector){
      var upValue = up[selector.key];
      if (selector.index !== undefined){
        upValue = upValue[selector.index];
      }
      if (selector.key === "target"){
        return Utils.targetsEqual(upValue, selector.value);
      }
      return upValue === selector.value;
    };


    // UP HANDLER FUNCTIONS

    this.addUp_insert = function(pul, up){
      // Add items to insert update primitive with same target collection,
      // if found. Else add a new insert update primitive. On primary key
      // collision of items, replace the old item with the incoming one.
      var selector = [{key: "target", value: up.target}];
      var curIns = this.findUpdate(up.type, selector, pul.insert);
      var upItems = up.params[0];
      if (curIns){
        if (!curIns.idMap2){
          // The list of ids that come from P2
          curIns.idMap2 = {};
        }
        for (var i = 0; i < upItems.length; i++){
          var curItem = upItems[i];
          curIns.idMap2[curItem.id] = true;
          if (!curIns.idMap[curItem.id]){
            // Item with new (or no) primary key
            if (curItem.id){
              curIns.idMap[curItem.id] = true;
            }
            curIns.params[0].push(curItem);
          }else{
            // Primary key collision
            // Replace old item having the same primary key
            for (var j = 0; j < curIns.params[0].length; j++){
              if (curIns.params[0][j].id === curItem.id){
                curIns.params[0][j] = curItem;
                break;
              }
            }
            // If there is no delete in P1 on the collision key, omit delete
            // from P2 on this key
            // XXX Assuming deletes are composed before inserts!
            var curDel = this.findUpdate("del", selector, pul.del);
            var foundDel = false;
            if (curDel){
              if (curDel.delIds2[curItem.id]){
                foundDel = true;
                delete curDel.delIds2[curItem.id];
                curDel.params[0] = _.reject(curDel.params[0], function(curId){
                  return curId === curItem.id;
                });
              }
            }
            if (!foundDel){
              console.err("Warning: Primary key collison on " + 
                  JSON.stringify(up.target), + ", missing delete in P2");
            }
          }
        }
      }else{
        var idMap = {};
        var idMap2 = {};
        for (var i = 0; i < upItems.length; i++){
          if (upItems[i].id !== undefined){
            idMap[upItems[i].id] = true;
            idMap2[upItems[i].id] = true;
          }
        }
        up.idMap = idMap;
        up.idMap2 = idMap2;
        pul.insert.push(up);
      }
    };

    this.addUp_del = function(pul,up){
      // Add ids to del update primitive with same target collection,
      // if found. Else add a new del update primitive.
      // If there is an insert present in the pul of a document with an
      // id to be deleted, remove that insert item if it comes from P1.
      var selector = [{key: "target", value: up.target}];
      var curInsert = this.findUpdate("insert", selector, pul.insert); 
      var upIds = up.params[0];
      if (curInsert){
        // There is an insert UP on the same collection as the delete UP.
        // Remove all items from the insert UP that have a primary key in 
        // the ids of the delete UP and come from P1.
        for (var i = upIds.length - 1; i >= 0; i--){
          var delId = upIds[i];
          if (curInsert.idMap[delId] && !(curInsert.idMap2 && curInsert.idMap2[delId])){
            delete curInsert.idMap[delId];
            curInsert.params[0] = _.reject(curInsert.params[0], function(item){
              return item.id === delId;
            });
            upIds.splice(i,1);
          }
        }
      }
      if (upIds.length){
        var curDel = this.findUpdate(up.type, selector, pul.del);
        if (curDel){
          if (!curDel.delIds2){
            // DelIds from P2
            curDel.delIds2 = {};
          }
          upIds.forEach(function(curId){
            curDel.delIds2.curId = true;
          });
          curDel.params[0] = curDel.params[0].concat(upIds); 
        }else{ 
          if (!up.delIds2){
            up.delIds2 = {};
          } 
          up.params[0].forEach(function(curId){
            up.delIds2.curId = true;
          });
          pul.del.push(up);
        }
      }
    };

    this.addUp_insert_into_object = function(pul,up){
      var targetUp = this.getAggregationTarget(pul, up);
      if (targetUp){
        if (!this.aggregate(pul, targetUp, up)){
          return;
        }
      } 
      // Accumulation case: like normalization
      // Add (key,value) pairs to object of UP with same target, if found.
      // Else add a new insert-into-object update primitive.
      var selector = [{key: "target", value: up.target}];
      var curIns = this.findUpdate(up.type, selector, pul.insert_into_object);
      if (curIns){
        var keys1 = Object.keys(curIns.params[0]);
        var keys2 = Object.keys(up.params[0]);
        var conflictKeys = _.intersection(keys1,keys2);
        if (conflictKeys.length){
          this.error = "Key conflict for insert-into-object UPs with target "
            + Utils.serializeTarget(up.target) + " on keys: " + conflictKeys;
          return;
        }
        keys2.forEach(function(key){
          curIns.params[0][key] = up.params[0][key];
        }); 
      }else{
        pul.insert_into_object.push(up);
      }
    };

    this.addUp_delete_from_object = function(pul,up){
      var targetUp = this.getAggregationTarget(pul, up);
      if (targetUp){
        if (!this.aggregate(pul, targetUp, up)){
          return;
        }
      } 
      // Add names to delete-from-object update primitive with same target, 
      // if found. Else add a new delete-from-object update primitive.
      for (var i = 0; i < pul.delete_from_object.length; i++){
        var curDel = pul.delete_from_object[i];
        if (Utils.targetsEqual(curDel.target, up.target)){
          curDel.params[0] = curDel.params[0].concat(up.params[0]);
          return;
        }
      }
      pul.delete_from_object.push(up);
    };

    this.addUp_replace_in_object = 
      this.addUp_rename_in_object = function(pul, up){
        var targetUp = this.getAggregationTarget(pul, up);
        if (targetUp){
          if (!this.aggregate(pul, targetUp, up)){
            return;
          }
        } 
        // Multiple replace_in_object UPs with same (object,name) target are 
        // merged.
        // Multiple rename_in_object UPs with same target shouldn't appear
        // (they should be aggregated above).
        var selector = [{key: "target", value: up.target}, 
            {key: "params", index: 0, value: up.params[0]}];
        var otherUp = this.findUpdate(up.type, selector, pul[up.type]);
        if (otherUp){
          if (up.type === "replace_in_object"){
            otherUp.params[1] = up.params[1];
            return;
          }
          this.error = "Multiple " + up.type + 
            " update primitives with same target: " + 
            Utils.serializeTarget(up.target, up.params[0]);
        }else{
          pul[up.type].push(up);
        }
      };

    this.addUp_insert_into_array = function(pul,up){
      var targetUp = this.getAggregationTarget(pul, up);
      if (targetUp){
        if (!this.aggregate(pul, targetUp, up)){
          return;
        }
      } 
      // Multiple UPs of this type with the same (array,index) target are merged
      // into one UP with this target, where the items are merged.
      var selector = [{key: "target", value: up.target}, 
          {key: "params", index: 0, value: up.params[0]}];
      var insertUp = this.findUpdate(up.type, selector, pul.insert_into_array);
      if (insertUp){
        // Concat items lists
        insertUp.params[1] = insertUp.params[1].concat(up.params[1]);
      }else{
        // Append UP
        pul.insert_into_array.push(up);
      }
    };

    this.addUp_delete_from_array = function(pul,up){
      var targetUp = this.getAggregationTarget(pul, up);
      if (targetUp){
        if (!this.aggregate(pul, targetUp, up)){
          return;
        }
      } 
      // Multiple UPs of this type with the same (array,index) target are merged
      // into one UP with this target.
      var selector = [{key: "target", value: up.target}, 
          {key: "params", index: 0, value: up.params[0]}];
      if (!this.findUpdate(up.type, selector, pul.delete_from_array)){
        // Append UP
        pul.delete_from_array.push(up);
      } // Else nothing to do, UP was already present
    };

    this.addUp_replace_in_array = function(pul,up){
      var targetUp = this.getAggregationTarget(pul, up);
      if (targetUp){
        if (!this.aggregate(pul, targetUp, up)){
          return;
        }
      }
      // Multiple UPs of this type with the same (array,index) target raise an
      // error.
      var selector = [{key: "target", value: up.target}, 
          {key: "params", index: 0, value: up.params[0]}];
      if(this.findUpdate(up.type, selector, pul.replace_in_array)){
        this.error = "Multiple " + up.type + " update primitives with same target";
      }else{
        // Append UP
        pul.replace_in_array.push(up);
      }
    };

  };
});
