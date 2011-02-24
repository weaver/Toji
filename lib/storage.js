var Assert = require('assert'),
    Path = require('path'),
    Kyoto = require('./kyoto'),
    Avro = require('./avro'),
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
  var type = obj.constructor,
      error, data, key;

  try {
    type.emit('beforeSave', obj, true);
    key = obj.__key__(true);
    data = Avro.dump(obj);
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
          type.emit('afterSave', obj, true);
        } catch (x) {
          error = x;
        }
        error ? next(error) : next(null, obj);
      }
    });

  return this;
};

Storage.prototype.save = function(obj, next) {
  var type = obj.constructor,
      error, data, key;

  if (!obj.id)
    return this.create(obj, next);

  try {
    type.emit('beforeSave', obj);
    key = obj.__key__();
    data = Avro.dump(obj);
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
          type.emit('afterSave', obj);
        } catch (x) {
          error = x;
        }
        error ? next(error) : next(null, obj);
      }
    });

  return this;
};

Storage.prototype.remove = function(obj, next) {
  var type = obj.constructor,
      error;

  try {
    type.emit('beforeRemove', obj);
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
      key = key.dump();
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
  if (typeof params == 'string')
    return this.findById(type, params, next);

  var name = Avro.typeName(type),
      query = new Query(this, params)
        .filter(function(obj) {
          return Avro.typeName(obj.constructor) === name;
        });

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
  this.db.each(done, function(data, key) {
    fn.call(this, load(data, key));
  });
  return this;
};


// ## Helpers ##

function load(data, key) {
  key = (key instanceof Key) ? key : Key.load(key);
  var type = Avro.type(key.kind),
      obj = Avro.load(type, data);
  obj.__pk__(key.id);
  type.emit('afterLoad', obj);
  return obj;
};

function associate(obj, key) {
  key = (key instanceof Key) ? key : Key.load(key);
  return obj.__pk__(key.id);
}
