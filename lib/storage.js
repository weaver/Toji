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
  this.path = Path.join(folder, 'data.kct');
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
      error, data, key;

  try {
    key = obj.beforeSave(true).__key__(true);
    data = Avro.dumpJSON(obj);
  } catch (x) {
    error = x;
  }

  if (error)
    next(error);
  else
    this.db.set(key, data, function(err) {
      if (err)
        next(err);
      else {
        associate(obj, key);
        try {
          obj.afterSave(true);
        } catch (x) {
          error = x;
        }
        error ? next(error) : next(null, obj);
      }
    });

  return this;
};

Storage.prototype.save = function(obj, next) {
  var type = Type.of(obj),
      error, data, key;

  if (!obj.id)
    return this.create(obj, next);

  try {
    key = obj.beforeSave(true).__key__();
    data = Avro.dumpJSON(obj);
  } catch (x) {
    error = x;
  }

  if (error)
    next(error);
  else
    this.db.set(key, data, function(err) {
      if (err)
        next(err);
      else {
        try {
          obj.afterSave();
        } catch (x) {
          error = x;
        }
        error ? next(error) : next(null, obj);
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
      next.call(this, err, data && load(data, key));
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


// ## Helpers ##

function load(data, key) {
  key = (key instanceof Key) ? key : Key.parse(key);
  var obj = Avro.loadJSON(key.type(), data);
  obj.__pk__(key.id).afterLoad();
  return obj;
};

function associate(obj, key) {
  key = (key instanceof Key) ? key : Key.parse(key);
  return obj.__pk__(key.id);
}
