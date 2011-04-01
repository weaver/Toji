var Assert = require('assert'),
    Path = require('path'),
    Kyoto = require('./kyoto'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Key = require('./key').Key,
    Query = require('./query').Query,
    U = require('./util');

exports.open = open;
exports.close = close;
exports.closeSync = closeSync;
exports.Storage = Storage;


// ## Global Storage ##

var DB, AUTOCLOSING;

function open(folder, mode, next) {
  if (arguments.length == 0) {
    if (!DB)
      throw new Error('No open() global database.');
    return DB;
  }
  autoClose();
  return (DB = new Storage(folder)).open(mode, next);
}

function close(next) {
  if (!DB)
    throw new Error('No open() global database.');
  DB.close(function(err) {
    if (next)
      next.apply(this, arguments);
    else if (err)
      throw err;
  });
}

function closeSync() {
  if (DB) {
    DB.closeSync();
    DB = null;
  }
}

function autoClose() {
  if (AUTOCLOSING)
    return;

  AUTOCLOSING = true;
  process.on('exit', closeSync);

  process.on('uncaughtException', function(err) {
    console.warn(err.stack || err);
    process.nextTick(function() { process.exit(1); });
  });
}

// ## Storage ##

function Storage(folder) {
  this.db = new Kyoto.KyotoDB();

  // Tuning parameters can be added by adding #n1=v1#n2=v2...
  var probe = folder.match(/^([^#]+)(#.*)?$/),
      name = probe[1],
      options = probe[2] || '';

  if (name == '*memory*')
    // An on-memory tree database is indicated a "+".
    this.path = '+' + options;
  else
    this.path = Path.join(name, 'data.kct') + options;
}

Storage.prototype.open = function(mode, next) {
  if (typeof mode == 'function') {
    next = mode;
    mode = undefined;
  }
  mode = mode || 'a+';

  this.db.open(this.path, mode, next);
  return this;
};

Storage.prototype.close = function(next) {
  this.db.close(next);
  return this;
};

Storage.prototype.closeSync = function() {
  this.db.closeSync();
  return this;
};

Storage.prototype.type = function(name, fields) {
  return type(name, fields);
};

Storage.prototype.load = function(done, data) {
  var self = this;

  U.aEach(data, done, function(obj, _, next) {
    self.create(obj, next);
  });

  return this;
};

Storage.prototype.create = function(obj, next) {
  var type = Type.of(obj),
      tries = 0,
      db = this.db,
      last, data, key;

  obj.dumpValid(true, function(err, val) {
    if (err)
      next(err, obj);
    else {
      data = val;
      attempt();
    }
  });

  function attempt() {
    if ((++tries == 5) || ((key = obj.__key__(true)) == last))
      fail();
    else
      add();
  }

  function fail() {
    next(new Type.ValueError('Duplicate key `' + key + '` (' + tries + ' attempts)', obj), obj);
  }

  function add() {
    db.add(key, data, function(err) {
      if (err && err.code == Kyoto.DUPREC)
        attempt();
      else if (err)
        next(err, obj);
      else
        added();
    });
  }

  function added() {
    associate(obj, key).afterSave(true, function(err) {
      next(err, obj);
    });
  }

  return this;
};

Storage.prototype.save = function(obj, next) {
  var self = this,
      type = Type.of(obj),
      data, key;

  if (!obj.__loaded__)
    return this.create(obj, next);

  obj.dumpValid(false, function(err, val) {
    if (err)
      next(err, obj);
    else {
      try {
        data = val;
        key = obj.__key__();
      } catch (x) {
        return next(x, obj);
      }
      replace();
    }
  });

  function replace() {
    self.db.replace(key, data, function(err) {
      if (err && err.code == Kyoto.NOREC)
        next(new Type.ValueError("save: this object hasn't been created yet", obj), obj);
      else if (err)
        next(err, obj);
      else
        obj.afterSave(false, function(err) {
          next(err, obj);
        });
    });
  }

  return this;
};

Storage.prototype.remove = function(obj, next) {
  var self = this,
      type = Type.of(obj),
      error;

  obj.beforeRemove(function(err) {
    err ? next(err) : self.db.remove(obj.__key__(), next);
  });

  return this;
};

Storage.prototype.get = function(key, next) {
  var error, data;

  try {
    if (typeof key != 'string')
      key = key.toString();
  } catch (x) {
    error = x;
  }

  if (error)
    next(error);
  else
    this.db.get(key, function(err, data) {
      data ? load(data, key, next) : next(err);
    });

  return this;
};

Storage.prototype.find = function(type, params, next) {
  if (typeof params == 'string' && next)
    return this.findById(type, params, next);

  var query = new Query(this, type, params);
  if (!next)
    return query;

  query.all(next);
  return this;
};

Storage.prototype.findById = function(type, id, next) {
  Assert.ok(next, 'Missing required `next` parameter.');
  return this.get(Key.make(type, id), next);
};

Storage.prototype.generate = function(jumpTo, done) {
  return new Generator(this.db.generate(jumpTo, done));
};

Storage.prototype.each = function(done, fn) {
  if (fn.length > 1)
    this.db.each(done, function(data, key, next) {
      load(data, key, function(err, obj) {
        err ? next(err) : fn(obj, next);
      });
    });
  else
    this.db.each(done, function(data, key) {
      load(data, key, function(err, obj) {
        err ? done(err) : fn(obj);
      });
    });
  return this;
};

Storage.prototype.synchronize = function(hard, next) {
  this.db.synchronize(hard, next);
  return this;
};


// ## Generator ##

function Generator(iter) {
  this.iter = iter;
}

Generator.prototype.then = function(callback) {
  this.iter.then(callback);
  return this;
};

Generator.prototype.done = function(err) {
  this.iter.done(err);
  return this;
};

Generator.prototype.next = function(fn) {
  var iter = this.iter;
  iter.next(function(val, key) {
    load(val, key, function(err, obj) {
      err ? iter.done(err) : fn(obj);
    });
  });
};


// ## Helpers ##

function load(data, key, next) {
  var obj;

  try {
    key = (key instanceof Key) ? key : Key.parse(key);
    obj = Avro.loadJSON(key.type(), data).__pk__(key.id);
  } catch (x) {
    return next(x);
  }

  obj.afterLoad(function(err) {
    if (err)
      next(err);
    else {
      U.setHidden(obj, '__loaded__', true);
      next(null, obj);
    }
  });
};

function associate(obj, key) {
  key = (key instanceof Key) ? key : Key.parse(key);
  U.setHidden(obj, '__loaded__', true);
  return obj.__pk__(key.id);
}
