/**
 * PUL Inverter
 */ 
define(function(require, exports, module){

  var Utils = require('./utils').Utils;
  var PUL = require('./pul').PendingUpdateList;
  var _ = require('./underscore') || window._;

  /*
   * UP Handler for PULs that are the inversion of another PUL. Normalizes as 
   * well.  
   *
   * @author ldoblies
   */
  var PULInverter = exports.PULInverter = function(){

    this.error = null;

    // UP HANDLER FUNCTIONS

    this.addUp_insert = function(pul, up){
      // Only accept the first insert of a document (because that's the oldest
      // version of the document, i.e. the version before the PUL that is being
      // inverted is applied)
      var selector = [{key: "target", value: up.target}];
      var curIns = this.findUpdate(up.type, selector, pul.insert);
      var upItems = up.params[0];
      if (curIns){
        // Already have UP with this up's target collection
        for (var i = 0; i < upItems.length; i++){
          var curItem = upItems[i];
          if (!curIns.idMap[curItem.id]){
            if (curItem.id){
              curIns.idMap[curItem.id] = true;
            }
            curIns.params[0].push(curItem);
          }else{
            // Ignore subsequent inserts of documents with same key 
          }
        }
      }else{
        var idMap = {};
        for (var i = 0; i < upItems.length; i++){
          if (upItems[i].id !== undefined){
            idMap[upItems[i].id] = true;
          }
        }
        up.idMap = idMap;
        pul.insert.push(up);
      }
    };

    this.addUp_del = function(pul,up){
      // Add ids to del update primitive with same target collection,
      // if found (removing duplicate ids). 
      // Else add a new del update primitive. 
      var selector = [{key: "target", value: up.target}];
      var curDel = this.findUpdate(up.type, selector, pul.del);
      var upIds = up.params[0];
      if (curDel){
        curDel.params[0] = _.uniq(curDel.params[0].concat(upIds));
      }else{
        pul.del.push(up);
      }
    };

    this.addUp_insert_into_object = this.addUp_delete_from_object = 
      this.addUp_replace_in_object = this.addUp_insert_into_array =
      this.addUp_delete_from_array = this.addUp_replace_in_array
      = function(pul,up){
        // Invalid UPs that shouldn't appear in our current implementation
        // of inversion.
        if (!this.error){
          this.error = "Invalid UP added to inverted PUL: " + up.type; 
        }
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

  };
});
  
