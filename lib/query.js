var U = require('./util'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Key = require('./key'),
    Gen = require('./generators');

exports.Query = Query;
exports.resolveRefs = resolveRefs;


// ## Query ##

function Query(store, type, query) {
  this.store = store;
  this.type = type;

  if (typeof query == 'string') {
    this._id = query;
    this.seed = generateId;
  }
  else {
    this.seed = generateType;
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

Query.prototype.offset = function(offset) {
  this._offset = offset;
  return this;
};

Query.prototype.limit = function(limit) {
  this._limit = limit;
  return this;
};

Query.prototype.slice = function(start, end) {
  this.offset(start);
  if (end !== undefined)
    this.limit(end - start);
  return this;
};

Query.prototype.order = function() {
  this._order = U.extend(this._order || [], arguments);
  return this;
};

Query.prototype.resolve = function() {
  console.warn('#resolve is deprecated, use #include.');
  return this.include.apply(this, arguments);
};

Query.prototype.json = function() {
  this._json = true;
  return this;
};

Query.prototype.include = function() {
  if (!this._include)
    this._include = [];
  U.extend(this._include, arguments);
  return this;
};

Query.prototype.generate = function(done) {
  var iter = this.seed(done);

  if (this._filter)
    iter = new Gen.Filter(iter, this._filter);

  if (this._order)
    iter = new Gen.Sort(iter, makeCmp(this._order));

  if (this._offset !== undefined)
    iter = offset(iter, this._offset);

  if (this._limit !== undefined)
    iter = limit(iter, this._limit);

  if (this._include)
    iter = new Gen.AMap(iter, resolver(this));

  if (this._json)
    iter = new Gen.AMap(iter, jsonEncoder);

  return iter;
};

Query.prototype.each = function(done, fn) {
  var iter = this.generate(done),
      error;

  iter.next(step);

  function step(obj) {
    try {
      fn(obj);
    } catch (x) {
      error = x;
    }
    error ? done(error) : iter.next(step);
  }

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

  this.generate(finished).next(function(obj) {
    done(null, found = obj);
  });

  function finished(err) {
    if (found === undefined)
      done(err);
  }

  return this;
};

Query.prototype.get = Query.prototype.one;


// ## Generators ##

function generateType(done) {
  var jumpTo = Type.name(this.type) + '/';
  return new Gen.TakeWhile(this.store.generate(jumpTo, done), matchType(this.type));
}

function offset(iter, offset) {
  return new Gen.Filter(iter, function() {
    if (offset <= 0)
      return true;
    offset -= 1;
    return false;
  });
}

function limit(iter, limit) {
  return new Gen.TakeWhile(iter, function() {
    return (limit--) > 0;
  });
}

function generateId(done) {
  return new GenerateId(this.store, this.type, this._id, done);
}

function GenerateId(store, type, id, done) {
  this.store = store;
  this.type = type;
  this.id = id;
  this.done = done;
  this.state = undefined;
}

GenerateId.prototype.then = function(callback) {
  this.done = callback(this.done);
  return this;
};

GenerateId.prototype.next = function(fn) {
  var self = this;

  if (self.state !== undefined)
    self.done(self.state);
  else
    self.store.findById(self.type, self.id, function(err, obj) {
      if (err)
        self.done(self.state = err);
      else {
        self.state = null;
        fn(obj);
      }

    });

  return self;
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
  if (!query._include)
    return dontResolve;
  return fieldResolver(query.store, query.type, query._include);
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
    U.aEach(fields, finished, function(type, name, next) {
      get(type, obj[name], function(err, result) {
        if (err)
          next(err);
        else {
          obj[name] = result;
          next();
        }
      });
    });

    function finished(err) {
      err ? done(err) : done(null, obj);
    }
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


// ## Sorting ##

function makeCmp(order) {
  if (!order || order.length === 0)
    return cmpStable;

  var cmp = compileCmp(order[0]);
  for (var i = 1, l = order.length; i < l; i++)
    cmp = chainCmp(cmp, compileCmp(order[i]));

  return cmp;
}

function cmpStable() {
  return 0;
}

function chainCmp(cmp1, cmp2) {
  return function(a, b) {
    return cmp1(a, b) || cmp2(a, b);
  };
}

function compileCmp(expr) {
  var probe = expr.match(/^([\-\+])?(.*)$/),
      op = probe[1] || '+',
      name = probe[2];

  return CMP[op](name);
}

var CMP = {
  '+': function ascending(name) {
    return function(a, b) {
      return (a[name] < b[name]) ? -1 : (a[name] === b[name]) ? 0 : 1;
    };
  },

  '-': function descending(name) {
    return function(a, b) {
      return (a[name] > b[name]) ? -1 : (a[name] === b[name]) ? 0 : 1;
    };
  }
};


// ## Encoding ##

function jsonEncoder(obj, next) {
  var data;
  try {
    data = obj.json();
  } catch (x) {
    return next(x);
  }
  next(null, data);
}