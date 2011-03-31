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
      last, error, data, key;

  try {
    data = type.dumpValid(obj, true);
  } catch (x) {
    error = x;
  }

  if (error)
    next(error, obj);
  else
    attempt();

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
    associate(obj, key);
    try {
      obj.afterSave(true);
    } catch (x) {
      error = x;
    }
    next(error, obj);
  }

  return this;
};

Storage.prototype.save = function(obj, next) {
  var type = Type.of(obj),
      error, data, key;

  if (!obj.__loaded__)
    return this.create(obj, next);

  try {
    data = type.dumpValid(obj, false);
    key = obj.__key__();
  } catch (x) {
    error = x;
  }

  if (error)
    next(error, obj);
  else
    this.db.replace(key, data, function(err) {
      if (err && err.code == Kyoto.NOREC)
        next(new Type.ValueError("save: this object hasn't been created yet", obj), obj);
      else if (err)
        next(err, obj);
      else {
        try {
          obj.afterSave(false);
        } catch (x) {
          error = x;
        }
        next(error, obj);
      }
    });

  return this;
};

Storage.prototype.remove = function(obj, next) {
  var type = Type.of(obj),
      error;

  try {
    obj.beforeRemove();
  } catch (x) {
    error = x;
  }

  if (error)
    next(error);
  else
    this.db.remove(obj.__key__(), next);

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
      next(err, data && load(data, key));
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
      fn.call(this, load(data, key), next);
    });
  else
    this.db.each(done, function(data, key) {
      fn.call(this, load(data, key));
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
  this.iter.next(function(val, key) {
    fn.call(this, load(val, key));
  });
};


// ## Helpers ##

function load(data, key) {
  key = (key instanceof Key) ? key : Key.parse(key);
  var obj = Avro.loadJSON(key.type(), data);
  obj.__pk__(key.id).afterLoad();
  U.setHidden(obj, '__loaded__', true);
  return obj;
};

function associate(obj, key) {
  key = (key instanceof Key) ? key : Key.parse(key);
  U.setHidden(obj, '__loaded__', true);
  return obj.__pk__(key.id);
}
