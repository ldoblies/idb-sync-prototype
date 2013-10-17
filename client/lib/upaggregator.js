/**
 * UPAggregator
 */
define(function(require, exports, module){

  var _ = require('./underscore') || window._;
  var Utils = require('./utils').Utils;

  /**
   * UPAggregator capable of aggregating update primitives with each other.
   * Used in the aggregation case during composition.
   *
   * @author ldoblies
   */
  var UPAggregator = exports.UPAggregator = {

    /**
     * Aggregate sourceUp on targetUp (coming from pul). targetUp is coming from
     * the composed PUL, sourceUp from the right-hand side PUL that is to be 
     * composed with the composed PUL.
     */
    aggregate: function(pul, targetUp, sourceUp){
      return this["aggregateOn_" + targetUp.type](pul,targetUp,sourceUp);
    },

    adaptToRenamedPath: function(renameUp, up, ret){
      var upPathLength = Utils.pathLength(up.target);
      var renamePathLength = Utils.pathLength(renameUp.target);
      if (renamePathLength >= upPathLength){
        ret.error = "Invalid parameters passed to adaptToRenamedPath():"+
      JSON.stringify(renameUp) + ", " + JSON.stringify(up);
      }else{
        if (!Utils.setPathEntry(up.target, renamePathLength, renameUp.params[0])){
          ret.error = "Couldn't update path entry";
        }else{
          ret.sourceModified = true;
        }
      }
    },

    // NOTE array UPs not implemented yet

    generateKeysForUpdate: function(targetUp, sourceUp){
      var ret = [];
      if (sourceUp.type === "replace_in_object"
          || sourceUp.type === "rename_in_object")
      {
        ret.push(Utils.serializeTarget(sourceUp.target, sourceUp.params[0]));
      } else if (sourceUp.type === "insert_into_object"){
        var kvPairs = Utils.getKeyValuePairs(sourceUp.params[0]);
        for (var i = 0; i < kvPairs.length; i++){
          ret.push(Utils.serializeTarget(sourceUp.target, kvPairs[i].key));
        }
      }else if (sourceUp.type === "delete_from_object"){
        for (var i = 0; i < sourceUp.params[0].length; i++){
          ret.push(Utils.serializeTarget(sourceUp.target, sourceUp.params[0][i]));
        }
      }

      if (targetUp.type === "insert" || targetUp.type === "insert_into_object"){
        for (var i = 0; i < ret.length; i++){
          ret[i] = ret[i].substring(Utils.serializeTarget(targetUp.target).length);
        }
      }else if (targetUp.type === "replace_in_object"){
        for (var i = 0; i < ret.length; i++){
          ret[i] = ret[i].substring(
              Utils.serializeTarget(targetUp.target,targetUp.params[0]).length);
        }
      }else{
        console.err("Passed invalid targetUp to generateKeysForUpdate(): "
            + JSON.stringify(targetUp));
        ret = [];
      }

      for (var i = 0; i < ret.length; i++){
        if (ret[i].length && (ret[i][0] === '.' || ret[i][0] === ':')){
          ret[i] = ret[i].substring(1);
        }
      }
      return ret;
    },

    aggregateOn_rename_in_object: function(pul,renameUp,sourceUp){
      var ret = {sourceModified: false};
      var setPathErr = function(){
        ret.error = "Invalid renameUp/sourceUp paths:" +
          "\ntargetUp: " + JSON.stringify(renameUp) +
          "\nsourceUp:" + JSON.stringify(sourceUp);
      };
      var upPathLength = Utils.pathLength(sourceUp.target);
      var renamePathLength = Utils.pathLength(renameUp.target);
      if (sourceUp.type === renameUp.type){
        // rename on rename
        if (upPathLength === renamePathLength){
          // Sequential renaming of the same object: Adapt renameUp
          renameUp.params[1] = sourceUp.params[1];
        }else if (upPathLength > renamePathLength){
          // Adapt the path in sourceUp to point to the original name 
          this.adaptToRenamedPath(renameUp, sourceUp, ret);
        }else{
          setPathErr();
        }
      }else if (sourceUp.type === "insert_into_object"){
        // Adapt sourceUp path
        this.adaptToRenamedPath(renameUp, sourceUp, ret);
      }else if (sourceUp.type === "delete_from_object"){
        if (renamePathLength < upPathLength){
          this.adaptToRenamedPath(renameUp, sourceUp, ret);
        }else if (renamePathLength === upPathLength){
          // Change the item to be deleted
          sourceUp.params[0] = _.reject(sourceUp.params[0], function(name){
            return name === renameUp.params[1];
          });
          sourceUp.params[0].push(renameUp.params[0]);
          ret.sourceModified = true;
        }else{
          setPathErr();
        }
      }else if (sourceUp.type === "replace_in_object"){
        if (renamePathLength < upPathLength){
          this.adaptToRenamedPath(renameUp, sourceUp, ret);
        }else if (renamePathLength === upPathLength){
          // Update the name to be replaced
          sourceUp.params[0] =  renameUp.params[0];
          ret.sourceModified = true;
        }else{
          setPathErr();
        }
      }
      return ret;
    },

    aggregateOn_insert_into_object: function(pul,targetUp,sourceUp){
      var ret = {sourceModified: false};
      var setErr = function(){ ret.error = "Failed to apply " +
        JSON.stringify(sourceUp) + " on " + JSON.stringify(targetUp);
        console.log(ret.error);};
      var targetObj = targetUp.params[0];
      var keys = this.generateKeysForUpdate(targetUp,sourceUp);
      if (sourceUp.type === "rename_in_object"){
        // Rename in iio value object
        if (!Utils.rename(targetObj,keys[0],sourceUp.params[1])){ setErr(); }
      }else if (sourceUp.type === "insert_into_object"){
        // Insert into target object
        var kvPairs = Utils.getKeyValuePairs(sourceUp.params[0]);
        for (var i = 0; i < kvPairs.length; i++){
          var curKv = kvPairs[i];
          curKey = keys[i];
          if (!Utils.set(targetObj,curKey,curKv.val)){ setErr(); }     
        }
      }else if (sourceUp.type === "delete_from_object"){
        for (var i = 0; i < keys.length; i++){
          if (!Utils.unset(targetObj, keys[i])){ setErr(); }
        }
      }else if (sourceUp.type === "replace_in_object"){
        if (!Utils.replace(targetObj, keys[0], sourceUp.params[1])){ setErr(); }
      }
      return ret;
    },

    aggregateOn_replace_in_object: function(pul,targetUp,sourceUp){
      var ret = {sourceModified: false};
      var setErr = function(){ ret.error = "Failed to apply " +
        JSON.stringify(sourceUp) + " on " + JSON.stringify(targetUp);
        console.log(ret.error);};
      var targetObj = targetUp.params[1];
      var keys = this.generateKeysForUpdate(targetUp,sourceUp);
      if (sourceUp.type === "rename_in_object"){
        // Rename in iio value object
        if (!Utils.rename(targetObj,keys[0],sourceUp.params[1])){ setErr(); }
      }else if (sourceUp.type === "insert_into_object"){
        // Insert into target object
        var kvPairs = Utils.getKeyValuePairs(sourceUp.params[0]);
        for (var i = 0; i < kvPairs.length; i++){
          var curKv = kvPairs[i];
          curKey = keys[i];
          if (!Utils.set(targetObj,curKey,curKv.val)){ setErr(); }     
        }
      }else if (sourceUp.type === "delete_from_object"){
        for (var i = 0; i < keys.length; i++){
          if (!Utils.unset(targetObj, keys[i])){ setErr(); }
        }
      }else if (sourceUp.type === "replace_in_object"){
        if (!Utils.replace(targetObj, keys[0], sourceUp.params[1])){ setErr(); }
      }
      return ret;
    },

    aggregateOn_insert: function(pul,targetUp,sourceUp){
      var ret = {sourceModified: false};
      var setErr = function(){ ret.error = "Failed to apply " +
        JSON.stringify(sourceUp) + " on " + JSON.stringify(targetUp);
        console.log(ret.error);};
      var targetObj;
      for (var i = 0; i < targetUp.params[0].length; i++){
        // Search the target document
        var curTarget = {collection: targetUp.target.collection,
          key: targetUp.params[0][i].id};
        if (Utils.containsTarget(curTarget, sourceUp.target)){
          targetObj = targetUp.params[0][i];
          break;
        }
      }
      var keys = this.generateKeysForUpdate(targetUp,sourceUp);
      for (var i = 0; i < keys.length; i++){
        keys[i] = keys[i].substring((""+targetObj.id).length);
        if (keys[i].length){
          keys[i] = keys[i].substring(1);
        }
      }
      if (sourceUp.type === "rename_in_object"){
        // Rename in iio value object
        if (!Utils.rename(targetObj,keys[0],sourceUp.params[1])){ setErr(); }
      }else if (sourceUp.type === "insert_into_object"){
        // Insert into target object
        var kvPairs = Utils.getKeyValuePairs(sourceUp.params[0]);
        for (var i = 0; i < kvPairs.length; i++){
          var curKv = kvPairs[i];
          var curKey = keys[i];
          if (!Utils.set(targetObj,curKey,curKv.val)){ setErr(); }     
        }
      }else if (sourceUp.type === "delete_from_object"){
        for (var i = 0; i < keys.length; i++){
          if (!Utils.unset(targetObj, keys[i])){ setErr(); }
        }
      }else if (sourceUp.type === "replace_in_object"){
        if (!Utils.replace(targetObj, keys[0], sourceUp.params[1])){ setErr(); }
      }    
      return ret;
    },
  };
});
