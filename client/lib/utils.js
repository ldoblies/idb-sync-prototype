/** IJSONiq Utility Functions */
define(function(require, exports, module){

  var _ = require('./underscore') || window._;

  /** 
   * IJSONiq Utility Functions 
   *
   * @author ldoblies
   */
  var Utils = exports.Utils = {

    /**
     * @param {Object} t1 Target object 1
     * @param {Object} t2 Target object 2
     *
     * @return {Boolean} True iff t1 and t2 point to the same target
     */ 
    targetsEqual: function(t1, t2){
      if (!t1.key && t2.key && t2.key.length 
        || !t2.key && t1.key && t1.key.length 
        || !t1.path && t2.path && t2.path.length 
        || !t2.path && t1.path && t1.path.length){
        return false;
      }
      return t1.collection === t2.collection && t1.key === t2.key 
        && t1.path === t2.path; 
    }, 

    /**
     * @param {String} key A JSON path separated by '.'
     *
     * @return {String} The current (leftmost) key of the path
     */
    curKey: function(key){
      return key.split('.')[0];
    },

    /**
     * @param {String} key A JSON path separated by '.'
     * 
     * @return {String} The same path without the leftmost key
     */
    nextKey: function(key){
      if (key.indexOf('.') == -1){
        return "";
      }
      return key.substring(key.indexOf('.') + 1);
    },    

    /**
     * Set a key at a certain position in target's path.
     *
     * @param {Object} target Target object     
     * @param {int} pathIndex The index of the key to set in target's path
     * @param {String} value The value of the key to set
     *
     * @return {Boolean} True iff the key was set     
     */
    setPathEntry: function(target, pathIndex, value){
      var targetParts = target.path.split('.');
      if (targetParts.length <= pathIndex){
        return false;
      }
      targetParts[pathIndex] = value;
      target.path = targetParts.join('.');
      return true;
    },

    /**
     * @param {Object} target Target object     
     *
     * @return {int} The path length (number of keys) of target's path
     */
    pathLength: function(target){
      return target.path? target.path.split('.').length : 0;
    },

    /**
     * @param {Object} container Target object   
     * @param {Object} containee Target object 
     *
     * @return {Boolean} True iff container's serialized target is a prefix of 
     *  containee's serialized target    
     */
    containsTarget: function(container, containee){
      if (!_.isString(container)){
        container = this.serializeTarget(container);
      }
      if (!_.isString(containee)){
        containee = this.serializeTarget(containee);
      }
      if (containee.length < container.length){
        return false;
      }
      if (containee.length > container.length){
        containee = containee.substring(0, container.length);
      }
      return containee === container;
    },

    /**
     * Delete empty string key and path (if present) from target.
     *
     * @param {Object} target Target object
     *
     * @return {Object} The normalized target 
     */
    normalizeTarget: function(target){
      target = JSON.parse(JSON.stringify(target));
      if (target.key === ""){
        delete target.key;
      }
      if (target.path === ""){
        delete target.path;
      }
      return target;
    },

    /**
     * @param {Object} target Target object
     * @param {Object} selector An optional selector to be added to the target
     *  path
     * @param {Boolean} isArrayTarget Indicate whether the target points to an
     *  array. If so, the selector must be an int. Otherwise it must be a String.
     *
     * @return {String} Serialized target
     */
    serializeTarget: function(target, selector, isArrayTarget){
      this.normalizeTarget(target);
      var key = target.key !== undefined ? ":" + target.key : "";
      var path = "";
      if (target.path){
        var sep = isArrayTarget ? ":" : ".";
        path = selector!==undefined ? ":" + target.path + sep + selector : ":" + target.path;
      }else if (selector){
        path = ":" + selector;
      }
      return target.collection + key + path;
    },

    /**
     * @param {String} target String-serialization of a target     
     *
     * @return {Object} Parsed target object   
     */
    parseTarget: function(target){
      var parts = target.split(":");
      var ret = {
        collection: parts[0]
      };
      if (parts[1]){
        ret.key = parseInt(parts[1]);
      }
      if (parts[2]){
        ret.path = parts[2];
      }
      return ret;
    },

    /**
     * @param {String} key A JSON keypath
     * 
     * @return {String} The last single key in the keypath
     */
    lastKey: function(key){
      if (key.indexOf('.') == -1){
        return key;
      }else{
        return key.substring(key.lastIndexOf('.') + 1);
      }
    },

    /**
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     *
     * @return {Boolean} True iff obj contains key
     */
    hasKey: function(obj, key){ 
      var obj = this.getContainingObject(obj, key);
      return obj && this.lastKey(key) in obj;
    },

    /**
     * Evaluate a keypath in a JSON object up to the last key and return the
     * containing object. Optionally add the parts of the keypath that aren't
     * present yet.
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Boolean} addIfNeeded If true, will introduce the missing parts
     *  of key into obj unless impossible
     *
     * @return {Object} The object in obj that contains the evaluated keypath,
     *  if found or if addIfNeeded is true (and it was possible to introduce
     *  the keypath). Else, undefined. 
     *
     * Examples:
     *  getContainingObject({a:{b:{}}}, "a.b") == a
     *
     *  getContainingObject({a:{b:{}}}, "a.b.c") == undefined
     *
     *  getContainingObject({a:{b:{}}}, "a.b.c", true) == b
     *  Side-effect: the obj is now {a:{b:{c:{}}}}
     *
     *  getContainingObject({a:{b:1}}, "a.b.c", true) == undefined 
     */
    getContainingObject: function(obj, key, addIfNeeded){
      var curKey = this.curKey(key);
      if (curKey === key){
        return obj;
      }
      if (!obj[curKey]){
        if (!addIfNeeded){
          return;
        }else{
          obj[curKey] = {};
        }
      }else if (typeof(obj[curKey]) !== 'object'){
        return;
      }
      return this.getContainingObject(obj[curKey], this.nextKey(key), addIfNeeded);
    },

    /**
     * Evaluate a keypath in a JSON object and return the value
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     *
     * @return {Value} The value retrieved when accessing key in obj, if found.
     *  Else, undefined. 
     */   
    getObject: function(obj, key){
      var cont = this.getContainingObject(obj, key);
      var lastKey = this.lastKey(key);
      if (!cont || !(lastKey in cont)){
        return;
      }
      return cont[lastKey];
    },

    /**
     * Evaluate a keypath in a JSON object and set it to val. Optionally, 
     * overwrite the value if already present.
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Value} val The target value     
     * @param {Boolean} upsert Iff true, will overwrite the value if already
     *  present 
     *
     * @return {Object} The updated obj, or undefined in case of error
     */ 
    set: function(obj, key, val, upsert){
      var target = this.getContainingObject(obj, key, true);     
      if (!target){
        return;
      }
      var lastKey = this.lastKey(key);
      if (!upsert && lastKey in target){
        return;
      }
      target[lastKey] = val;
      return obj;
    },

    /**
     * Evaluate a keypath in a JSON object and remove the last key from the
     * containing object. Will succeed in case the key didn't exist.
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     *
     * @return {Object} The updated obj
     */
    unset: function(obj, key){
      var target = this.getContainingObject(obj, key);
      if (target){
        delete target[this.lastKey(key)];
      }
      return obj;
    },

    /**
     * Evaluate a keypath in a JSON object and set the last key to target
     * value. Optionally, return success in case the containing object was not
     * found.
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Value} val Target value
     * @param {Boolean} okIfNotFound If true, will return success also if the
     *  containing object was not found
     *
     * @return {Value} True iff containing object was not found && okIfNotFound
     * or if the update of obj succeeded.
     */
    update: function(obj, key, val, okIfNotFound){
      if (!this.getContainingObject(obj, key)){
        return okIfNotFound;     
      }else{
        return this.set(obj,key,val,true);
      }
    },

    /**
     * Evaluate a keypath in a JSON object and replace it with target value.
     * key is optional. If undefined, will replace obj with val. 
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Value} val Target value
     *
     * @return {Value} True iff the update of obj succeeded.
     */
    replace: function(obj, key, val){
      if (key == undefined){
        // Replace whole object
        var keys = Object.keys(obj);
        for (i in keys){
          delete obj[keys[i]];
        }
        var kvPairs = this.getKeyValuePairs(val);
        for (i in kvPairs){
          obj[kvPairs[i].key] = kvPairs[i].val;
        }
        return obj;
      }else{
        return this.update(obj, key, val, true);      
      }
    },

    /**
     * Evaluate a keypath in a JSON object and rename the last key to target 
     * name, if found.
     * 
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Value} val Target name
     *
     * @return {Boolean} True      
     */
    rename: function(obj, key, val){
      var cont = this.getContainingObject(obj, key);
      var lastKey = this.lastKey(key);
      if (cont && lastKey in cont){
        cont[val] = cont[lastKey];
        delete cont[lastKey];
      }
      return true;
    },

    /**
     * @return True iff arr is an Array, and assigning arr[index] to a value 
     * would succeed and increase the size of arr by at most 1.
     */
    isValidInsertIndex: function(arr, index){
      return arr instanceof Array && index >= 0 && index <= arr.length;
    },

    /**
     * @return True iff arr is an Array, and accessing arr[index] would succeed
     * and return an element present in the array.
     */
    isValidIndex: function(arr, index){
      return arr instanceof Array && index >= 0 && index < arr.length;
    },

    /**
     * Evaluate a keypath in a JSON object that should lead to an array. If
     * found, insert items into array, starting at index.     
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Integer} index The index to insert the items at
     * @param {Array} items The items to insert into target array
     *
     * @return {Boolean} True iff inserting the items succeeded
     */
    arrayInsert: function(obj, key, index, items){
      var cont = this.getContainingObject(obj, key);
      var targetArr = cont[this.lastKey(key)];
      if (!targetArr || !(this.isValidInsertIndex(targetArr, index))){
        return false;
      }
      var newArr = targetArr.slice(0, index);
      newArr = newArr.concat(items);
      newArr = newArr.concat(targetArr.slice(index, targetArr.length));
      cont[this.lastKey(key)] = newArr;
      return true;
    },

    /**
     * Evaluate a keypath in a JSON object that should lead to an array. If
     * found, remove the item at index.    
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Integer} index The index of the item to remove from the array   
     *
     * @return {Boolean} True iff removing the item succeeded 
     */
    arrayDelete: function(obj, key, index){
      var cont = this.getContainingObject(obj, key);
      var targetArr = cont[this.lastKey(key)];
      if (!targetArr || !(this.isValidIndex(targetArr, index))){
        return false;
      }
      targetArr.splice(index, 1);
      return true;
    },

    /**
     * Evaluate a keypath in a JSON object that should lead to an array. If
     * found, replace the item at index with target value.     
     *
     * @param {Object} obj A JSON object
     * @param {String} key A JSON keypath
     * @param {Integer} index The index of the item to be replaced 
     * @param {Value} val The value to replace the item with
     *
     * @return {Boolean} True iff replacing the item succeeded
     */
    arrayReplace: function(obj, key, index, val){
      var cont = this.getContainingObject(obj, key);
      var targetArr = cont[this.lastKey(key)];
      if (!targetArr || !(this.isValidIndex(targetArr, index))){
        return false;
      }
      targetArr[index] = val;
      return true;
    },  
    
    /**
     * Extract (key,value) pairs from a JSON object.
     *
     * @param {Object} src The source object to retrieve the keys and values
     *  from
     *
     * @return {Array} An array containing {key:..., val:...} pairs that
     * correspond to the keys and values in the src object
     */
    getKeyValuePairs: function(src){
      var res = [];
      for (var key in src) {
        var obj = src[key];
        if (src.hasOwnProperty(key)){
          res.push({key: key, val: obj});
        }
      }
      return res;
    },

    /**    
     * Copy a JSON object.
     *  
     * @param {Value} obj The object to copy
     *
     * @return A copy of obj
     *
     * From: http://stackoverflow.com/questions/728360/most-elegant-way-to-clone-a-javascript-object
     */
    cloneObject: function(obj){
       if (null == obj || "object" != typeof obj) return obj;  
       if (obj instanceof Array) {
         var copy = [];
         for (var i = 0, len = obj.length; i < len; i++) {
           copy[i] = this.cloneObject(obj[i]);
         }
         return copy;
       }
       var copy = {};
       for (var a in obj) {
         if (obj.hasOwnProperty(a)){
           copy[a] = this.cloneObject(obj[a]);
         }
       }
       return copy;
     },

    /**    
     * Copy a JSON object, omitting functions.
     *  
     * @param {Value} obj The object to copy
     *
     * @return A copy of obj, omitting functions
     *
     * @see {@link cloneObject}
     */
    noFunctions: function(obj){
      if (null == obj || "object" != typeof obj) return obj;  
      if (obj instanceof Array) {
        var copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
          copy[i] = this.noFunctions(obj[i]);
        }
        return copy;
      }
      var copy = {};
      for (var a in obj) {
        if (obj.hasOwnProperty(a) && typeof obj[a] !== 'function'){
          copy[a] = this.noFunctions(obj[a]);
        }
      }
      return copy;  
    },

    /**
     * Compare array contents. 
     *
     * @return {Boolean} True iff arrays have identical contents (including 
     * order). Array items are compared with objsEqual().
     *
     * @see {@link objsEqual}
     */ 
    arraysMatch: function(arr1, arr2){
      if (arr1.length - arr2.length) return false;
      for (var i = 0; i < arr1.length; i++){
        if (!this.objsEqual(arr1[i], arr2[i])) return false;
      }
      return true;
    },

    /**    
     * Compare two JSON objects.       
     *
     * @return True iff the objects contain the same keys and values
     */
    objsEqual: function(o1,o2){
      if (_.isArray(o1)){
        return _.isArray(o2) && this.arraysMatch(arr1,arr2);
      }else if (o1 === null || o2 === null || typeof o1 !== 'object' ||
          typeof o2 !== 'object'){
            return o1 === o2;
          }
      var keys1 = Object.keys(o1);
      var keys2 = Object.keys(o2);
      keys1.sort();
      keys2.sort();
      if (!this.arraysMatch(keys1, keys2)) return false;
      for (var i = 0; i < keys1.length; i++){
        if (!this.objsEqual(o1[keys1[i]], o2[keys1[i]])){
          return false;
        }  
      }
      return true;
    }
  };
});
