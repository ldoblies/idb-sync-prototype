/*jshint eqeqeq:false */
(function (window) {
	'use strict';

  var db;
  var dbname;

	/**
	 * Creates a new client side storage object and will create an empty
	 * collection if no collection already exists.
	 *
	 * @param {string} name The name of our DB we want to use
	 * @param {function} callback Our fake DB uses callbacks because in
	 * real life you probably would be making AJAX calls
	 */
	function Store(name, callback) {
		var data;
    dbname = name;

    var dbArgs = {
      storeName: name,
      keyPath: "id"
    };
    require(['./lib/idbwrapper'], function(IDBWrapper){
      var IDBWrapper = requirejs("./lib/idbwrapper").IDBWrapper;
      db = new IDBWrapper(dbArgs, function(){
        console.log("IDB initiated!");
        if (callback){
          db.getAll(function(result){
            callback.call(this, result);
          });
        }
      });
    });
  }

	/**
	 * Finds items based on a query given as a JS object
	 *
	 * @param {object} query The query to match against (i.e. {foo: 'bar'})
	 * @param {function} callback	 The callback to fire when the query has
	 * completed running
	 *
	 * @example
	 * db.find({foo: 'bar', hello: 'world'}, function (data) {
	 *	 // data will return any items that have foo: bar and
	 *	 // hello: world in their properties
	 * });
	 */
	Store.prototype.find = function (query, callback) {
    if (!callback) {
      return;
    }

    db.getAll(function(todos){
      callback.call(this, todos.filter(function (todo) {
        for (var q in query) {
          return query[q] === todo[q];
        }
      }));
    });
	};

	/**
	 * Will retrieve all data from the collection
	 *
	 * @param {function} callback The callback to fire upon retrieving data
	 */
	Store.prototype.findAll = function (callback) {
		callback = callback || function () {};
    if (!db.store || !db.store.db){
      callback.call(this,[]);
      return;
    }
    db.getAll(function(result){
      //console.log(result);
      callback.call(this,result);
    }, function(err){
      console.log("findAll ERROR: " + err);
    });
	};

	/**
	 * Will save the given data to the DB. If no item exists it will create a new
	 * item, otherwise it'll simply update an existing item's properties
	 *
	 * @param {number} id An optional param to enter an ID of an item to update
	 * @param {object} data The data to save back into the DB
	 * @param {function} callback The callback to fire after saving
	 */
	Store.prototype.save = function (id, updateData, callback) {
    window.app.syncImpl.save(dbname, id, updateData, function(){
      Store.prototype.findAll.call(this,callback);
    });
	};

	/**
	 * Will remove an item from the Store based on its ID
	 *
	 * @param {number} id The ID of the item you want to remove
	 * @param {function} callback The callback to fire after saving
	 */
	Store.prototype.remove = function (id, callback) {
    id = parseInt(id);
    window.app.syncImpl.remove(dbname, id, function(){
      Store.prototype.findAll.call(this,callback);
    });
    /*
    id = parseInt(id);
    db.remove(id,function(){ 
      Store.prototype.findAll.call(this,callback);
    });
    */
	};

	/**
	 * Will drop all storage and start fresh
	 *
	 * @param {function} callback The callback to fire after dropping the data
	 */
	Store.prototype.drop = function (callback) {
    db.clear(function(){
      Store.prototype.findAll.call(this,callback);
    });
	};

	// Export to window
	window.app.Store = Store;
})(window);
