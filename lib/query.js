var U = require('./util');

exports.Query = Query;


// ## Query ##

function Query(store, query) {
  this.store = store;
  this.filter(query);
}

Query.prototype.filter = function(query) {
  var prev = this._filter,
      fn = compileFilter(query);

  if (!prev)
    this._filter = fn;
  else
    this._filter = function() {
      return prev.apply(this, arguments) && fn.apply(this, arguments);
    };
  return this;
};

Query.prototype.each = function(done, fn) {
  var filter = this._filter;

  this.store.each(done, function(obj) {
    if (filter(obj))
      fn.call(this, obj);
  });

  return this;
};

Query.prototype.all = function(done) {
  var result = [];

  this.each(finished, function(obj) {
    result.push(obj);
  });

  function finished(err) {
    err ? done(err) : done(null, result);
  }

  return this;
};

Query.prototype.then = Query.prototype.all;

Query.prototype.one = function(done) {
  var found;

  this.each(finished, function(obj) {
    found = obj;
    this.stop();
  });

  function finished(err) {
    done(err, found);
  }

  return this;
};

Query.prototype.get = Query.prototype.one;


// ## Helpers ##

function compileFilter(params) {
  if (typeof params == 'function')
    return params;
  else if (U.isEmpty(params))
    return always;

  return matchAll(params);
}

function always() {
  return true;
}

function matchAll(params) {
  return function match(obj) {
    var val;
    for (var key in params) {
      if ((val = params[key]) instanceof RegExp)
        try {
          if (!val.test(obj[key]))
            return false;
        } catch (_) {
          return false;
        }
      else if (obj[key] != params[key])
        return false;
    }
    return true;
  };
}