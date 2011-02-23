var Path = require('path'),
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
  var error, data, key;

  try {
    key = Key.make(obj.constructor);
    obj.id = key.id;
    data = Avro.dump(obj);
    key = Key.dump(key);
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
        obj.__key__ = key;
        next(null, obj, key);
      }
    });

  return this;
};

Storage.prototype.save = function(obj, next) {
  var error, data, key;

  if (!obj.__key__)
    return this.create(obj, next);

  try {
    key = obj.__key__;
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
      else
        next(null, obj, key);
    });

  return this;
};

Storage.prototype.find = function(type) {
  var prefix = new RegExp('^' + Avro.typeName(type) + '/');
  return new Query(this)
    .filter(function(obj) {
      return prefix.test(obj.__key__);
    });
};

Storage.prototype.each = function(done, fn) {
  this.db.each(done, function(data, key) {
    var type = Avro.type(Key.load(key).kind),
        obj = Avro.load(type, data);
    obj.__key__ = key;
    fn.call(this, obj, key);
  });
  return this;
};

Storage.prototype.remove = function(obj, next) {
  var key = obj.__key__;

  if (!key)
    next(new Error('No key found for ' + Avro.show(obj)));
  else
    this.db.remove(key, next);

  return this;
};

