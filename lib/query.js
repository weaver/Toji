var U = require('./util'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Key = require('./key');

exports.Query = Query;
exports.resolveRefs = resolveRefs;


// ## Query ##

function Query(store, type, query) {
  this.store = store;
  this.type = type;

  if (typeof query == 'string') {
    this._id = query;
    this.generate = generateOne;
  }
  else {
    this.generate = generateMany;
    this.filter(query);
  }
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

Query.prototype.resolve = function() {
  if (!this._resolve)
    this._resolve = [];
  U.extend(this._resolve, arguments);
  return this;
};

Query.prototype.each = function(done, fn) {
  var filter = this._filter || always,
      resolve = resolver(this);

  this.generate(done, function(obj, next) {
    var self = this;

    // TODO: resolve before filtering if the query parameters need it.
    if (!filter(obj))
      next();
    else
      resolve(obj, function(err) {
        if (!err)
          try {
            fn.call(self, obj);
          } catch (x) {
            err = x;
          }
        next(err);
      });
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


// ## Generators ##

function generateMany(done, fn) {
  var filterType = matchType(this.type);
  this.store.each(done, function(obj, next) {
    !filterType(obj) ? next() : fn.call(this, obj, next);
  });
}

function generateOne(done, fn) {
  this.store.findById(this.type, this._id, function(err, obj) {
    err ? done(err) : fn.call(new GenerateOne(), obj, done);
  });
}

function GenerateOne() {
}

GenerateOne.prototype.stop = function() {
  return this;
};


// ## Filters ##

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

function matchType(type) {
  var name = Type.name(type);
  return function match(obj) {
    return Type.nameOf(obj) === name;
  };
}


// ## Reference Resolution ##

function resolver(query) {
  if (!query._resolve)
    return dontResolve;
  return fieldResolver(query.store, query.type, query._resolve);
}

function dontResolve(obj, next) {
  next(null, obj);
}

function resolveRefs(store, obj, names, next) {
  var resolve = fieldResolver(store, Type.of(obj), names);
  resolve(obj, next);
  return obj;
}

function fieldResolver(store, type, names) {
  var fields = {};

  names.forEach(function(name) {
    fields[name] = Avro.type(type.schemaOf(name).references);
  });

  return resolveFields(store, fields);
}

function resolveFields(store, fields) {
  var val, cache = {};

  return function resolve(obj, done) {
    U.aEach(fields, done, function(type, name, next) {
      get(type, obj[name], function(err, result) {
        if (err)
          next(err);
        else {
          obj[name] = result;
          next();
        }
      });
    });
  };

  function get(type, val, next) {
    if (!val)
      next(null, val);
    else if (U.isArray(val))
      getAll(type, val, next);
    else
      getOne(type, val, next);
  }

  function getAll(type, refs, done) {
    var result = [];

    U.aEach(refs, finished, function(ref, _, next) {
      getOne(type, ref, function(err, obj) {
        if (err)
          next(err);
        else {
          result.push(obj);
          next();
        }
      });
    });

    function finished(err) {
      err ? done(err) : done(null, result);
    }
  }

  function getOne(type, ref, next) {
    if (ref instanceof type)
      return next(null, ref);
    else if (typeof ref != 'string')
      return next(new Avro.Invalid(type, 'bad reference', ref));

    var key = Key.make(type, ref),
        probe = cache[key];

    if (probe)
      next(null, probe);
    else
      store.get(key, function(err, obj) {
        err ? next(err) : next(null, cache[key] = obj);
      });
  }
}