
define(function(require, exports, module){

  var _ = require('./underscore') || window._;

  var Utils = exports.Utils = {

    targetsEqual: function(t1, t2){
      if (!t1.key && t2.key && t2.key.length || !t2.key && t1.key && t1.key.length || !t1.path && t2.path && t2.path.length || !t2.path && t1.path && t1.path.length){
        return false;
      }
      return t1.collection === t2.collection && t1.key === t2.key && 
  t1.path === t2.path; 
    }, 

curKey: function(key){
  return key.split('.')[0];
},

nextKey: function(key){
  if (key.indexOf('.') == -1){
    return "";
  }
  return key.substring(key.indexOf('.') + 1);
},    


  setPathEntry: function(target, pathIndex, value){
    var targetParts = target.path.split('.');
    if (targetParts.length <= pathIndex){
      return false;
    }
    targetParts[pathIndex] = value;
    target.path = targetParts.join('.');
    return true;
  },

  pathLength: function(target){
    return target.path? target.path.split('.').length : 0;
  },

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

  lastKey: function(key){
    if (key.indexOf('.') == -1){
      return key;
    }else{
      return key.substring(key.lastIndexOf('.') + 1);
    }
  },

  /**
   * Returns true iff obj.key is present, where key is a JSON 
   * path separated by '.'.
   */
  hasKey: function(obj, key){ 
    var obj = this.getContainingObject(obj, key);
    return obj && this.lastKey(key) in obj;
  },

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

  getObject: function(obj, key){
    var cont = this.getContainingObject(obj, key);
    var lastKey = this.lastKey(key);
    if (!cont || !(lastKey in cont)){
      return;
    }
    return cont[lastKey];
  },

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

  unset: function(obj, key){
    var target = this.getContainingObject(obj, key);
    if (target){
      delete target[this.lastKey(key)];
    }
    return obj;
  },

  update: function(obj, key, val, okIfNotFound){
    if (!this.getContainingObject(obj, key)){
      if (okIfNotFound){
        return true;
      }
      return;     
    }else{
      return this.set(obj,key,val,true);
    }
  },

  replace: function(obj, key, val){
    if (!key){
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

  rename: function(obj, key, val){
    var cont = this.getContainingObject(obj, key);
    var lastKey = this.lastKey(key);
    if (cont && lastKey in cont){
      cont[val] = cont[lastKey];
      delete cont[lastKey];
    }
    return true;
  },


  isValidInsertIndex: function(arr, index){
    return arr instanceof Array && index >= 0 && index <= arr.length;
  },

  isValidIndex: function(arr, index){
    return arr instanceof Array && index >= 0 && index < arr.length;
  },

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

  arrayDelete: function(obj, key, index){
    var cont = this.getContainingObject(obj, key);
    var targetArr = cont[this.lastKey(key)];
    if (!targetArr || !(this.isValidIndex(targetArr, index))){
      return false;
    }
    targetArr.splice(index, 1);
    return true;
  },

  arrayReplace: function(obj, key, index, val){
    var cont = this.getContainingObject(obj, key);
    var targetArr = cont[this.lastKey(key)];
    if (!targetArr || !(this.isValidIndex(targetArr, index))){
      return false;
    }
    targetArr[index] = val;
    return true;
  },  

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

  // From: http://stackoverflow.com/questions/728360/most-elegant-way-to-clone-a-javascript-object
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

  // Returns a copy of obj omitting functions
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
 
  /* True iff arrays have identical contents (including order) */
  arraysMatch: function(arr1, arr2){
    if (arr1.length - arr2.length) return false;
    for (var i = 0; i < arr1.length; i++){
      if (!this.objsEqual(arr1[i], arr2[i])) return false;
    }
    return true;
  },

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
