var K = require('../build/default/_kyoto'),
    NOREC = K.PolyDB.NOREC;

exports.open = open;
exports.KyotoDB = KyotoDB;


// ## Error Code Constants ##

['SUCCESS', 'NOIMPL', 'INVALID', 'NOREPOS', 'NOPERM',
 'BROKEN', 'DUPREC', 'NOREC', 'LOGIC', 'SYSTEM', 'MISC']
  .forEach(function(name) {
    exports[name] = K.PolyDB[name];
  });


// ## KyotoDB ##

// A KyotoDB can open any type of Kyoto Cabinet database. Use the
// filename extension to indicate the type.
//
// In this example, a database is opened in read/write mode and
// created if it doesn't exist. An item is stored in the database and
// then retrieved:
//
//     var db = open('/tmp/data.kch', 'a+', populate);
//
//     function populate(err) {
//       if (err) throw err;
//       db.set('my', 'value', query);
//     }
//
//     function query(err) {
//       if (err) throw err;
//       db.get('my', function(err, value) {
//         if (err) throw err;
//         console.log('My value is', value);
//         done();
//       });
//     }
//
//     function done() {
//       db.close(function(err) {
//         if (err) throw err;
//       });
//     }

// Create a new KyotoDB instance and open it.
function open(path, mode, next) {
  return (new KyotoDB()).open(path, mode, next);
}

function KyotoDB() {
  this.db = null;
}

// Open a database.
//
// The type of database is determined by the extension of `path`:
//
//   + `.kch` - file hash
//   + `.kct` - file tree
//   + `.kcd` - directory hash
//   + `.kcf` - directory tree
//
// Memory-only databases can be opened using these special `path`
// values:
//
//   + `-` - memory hash
//   + `+` - memory tree
//
// The `path` can also have tuning parameters appended to
// it. Parameters should be given in a `#key1=value1#key2=value2...`
// format. Refer to Kyoto Cabinet's `PolyDB::open()` documentation.
//
// The mode can be a number (e.g. `OWRITER | OCREATE | OTRUNCATE`) or
// one of:
//
//   + `r`  - read only  (file must exist)
//   + `r+` - read/write (file must exist)
//   + `w+` - read/write (always make a new file)
//   + `a+` - read/write (make a new file if it doesn't exist)
//
// open(path, mode='r', next)
//
//   + path - String database file.
//   + mode - String open mode (optional, default: 'w+')
//   + next - Function(Error) callback
//
// Returns self.
KyotoDB.prototype.open = function(path, mode, next) {
  var self = this;

  if (this.db !== null) {
    next.call(this, null);
    return this;
  }

  if (typeof mode == 'function') {
    next = mode;
    mode = 'r';
  }

  if (!next)
    next = noop;

  var omode = parseMode(mode);
  if (!omode) {
    next.call(this, new Error('Badly formatted mode: `' + mode + '`.'));
    return this;
  }

  var db = new K.PolyDB();
  db.open(path, omode, function(err) {
    if (err)
      next.call(self, err);
    else {
      self.db = db;
      next.call(self, null);
    }
  });

  return this;
};

// Close a database
//
// + next - Function(Error) callback
//
// Returns self.
KyotoDB.prototype.close = function(next) {
  var self = this;

  if (!next)
    next = noop;

  if (this.db === null) {
    next.call(this, null);
    return this;
  }

  this.db.close(function(err) {
    if (err)
      next.call(self, err);
    else {
      self.db = null;
      next.call(self, null);
    }
  });

  return this;
};

KyotoDB.prototype.closeSync = function() {
  if (this.db) {
    this.db.closeSync();
    this.db = null;
  }
  return this;
};

// Get a value from the database.
//
// If the value does not exist, `next` is called with a `null` error
// and an undefined `value`.
//
// + key  - String key.
// + next - Function(Error, String value, String key) callback
//
// Returns self.
KyotoDB.prototype.get = function(key, next) {
  var self = this;

  if (this.db === null)
    next.call(this, new Error('get: database is closed.'));
  else
    this.db.get(key, function(err, val) {
      if (err && err.code == NOREC)
        next.call(self, null, undefined, key);
      else if (err)
        next.call(self, err);
      else
        next.call(self, null, val, key);
    });

  return this;
};

// Set a value in the database.
//
// + key   - String key
// + value - String value
// + next  - Function(Error, String value, String key) callback
//
// Returns self.
KyotoDB.prototype.set = function(key, val, next) {
  return this.modify('set', key, val, next);
};

// Add a value to the database.
//
// Set the value for `key` if isn't already bound in the database. If
// `key` is in the database, the original value is kept and an error
// with code `DUPREC` is raised.
//
// + key   - String key
// + value - String value
// + next  - Function(Error, String value, String key) callback
//
// Returns self.
KyotoDB.prototype.add = function(key, val, next) {
  return this.modify('add', key, val, next);
};

// Replace value in the database.
//
// Change the value for `key` in the database. If `key` isn't in the
// database, raise an error with code `NOREC`.
//
// + key   - String key
// + value - String value
// + next  - Function(Error, String value, String key) callback
//
// Returns self.
KyotoDB.prototype.replace = function(key, val, next) {
  return this.modify('replace', key, val, next);
};

// Remove a value from the database.
//
// + key   - String key
// + next  - Function(Error) callback
//
// Returns self.
KyotoDB.prototype.remove = function(key, next) {
  var self = this;

  if (!next)
    next = noop;

  if (this.db === null)
    next.call(this, new Error('remove: database is closed.'));
  else
    this.db.remove(key, function(err) {
      next.call(self, err);
    });

  return this;
};

KyotoDB.prototype.synchronize = function(hard, next) {
  var self = this;

  if (typeof hard == 'function') {
    next = hard;
    hard = undefined;
  }

  hard = (hard === undefined) ? false : hard;
  next = next || noop;

  if (this.db === null)
    next.call(this, new Error('synchronize: database is closed.'));
  else
    this.db.synchronize(hard, function(err) {
      next.call(self, err);
    });

  return this;
};

// A low-level helper method. See add() or set().
KyotoDB.prototype.modify = function(method, key, val, next) {
  var self = this;

  if (!next)
    next = noop;

  if (this.db === null)
    next.call(this, new Error(method + ': database is closed.'));
  else
    this.db[method](key, val, function(err) {
      next.call(self, err, val, key);
    });

  return this;
};

// Create a cursor to iterate over items in the database.
//
// Returns Cursor instance.
KyotoDB.prototype.cursor = function() {
  return new Cursor(this);
};

KyotoDB.prototype.generate = function(jumpTo, done) {
  return new Generator(this, jumpTo, done);
};

// Iterate over all items in the database in an async-each style.
//
// The `fn` iterator is called with each item in the database in the
// context of a Cursor. It should handle the key/value pair and then
// call `next`. To stop iterating, it could call `this.stop()`.
//
// When an error is encountered or all items have been visited,
// `done` is called.
//
// + done - Function(Error) finished callback
// + fn   - Function(String value, String key, Function next) iterator
//
// Returns self.
KyotoDB.prototype.each = function(done, fn) {
  var self = this,
      wantsNext = false,
      finished = false,
      cursor = this.cursor();

  if (!fn) {
    fn = done;
    done = noop;
  }

  wantsNext = fn.length > 2;
  cursor.jump(step);

  function step(err) {
    err ? finish(err) : cursor.get(true, dispatch);
  }

  function dispatch(err, val, key) {
    if (err)
      finish(err);
    else if (val === undefined)
      finish(err);
    else
      try {
        fn.call(cursor, val, key, step);
        wantsNext || step();
      } catch (x) {
        finish(x);
      }
  }

  function finish(err) {
    if (!finished) {
      finished = true;
      process.nextTick(function() { done.call(self, err); });
    }
  }

  return this;
};


// ## Generator ##

function Generator(db, jumpTo, done) {
  this.cursor = new K.Cursor(db.db);
  this.started = false;
  this.jumpTo = jumpTo;
  this.done = done;
}

Generator.prototype.then = function(callback) {
  this.done = callback(this.done);
  return this;
};

Generator.prototype.next = function(fn) {
  var self = this,
      cursor = this.cursor;

  if (this.started)
    step();
  else {
    this.started = true;
    jump();
  }

  function jump() {
    if (self.jumpTo)
      cursor.jumpTo(self.jumpTo, jumped);
    else
      cursor.jump(jumped);
  }

  function jumped(err) {
    if (err && err.code == NOREC)
      self.done();
    else if (err)
      self.done(err);
    else
      step();
  }

  function step() {
    cursor.get(true, emit);
  }

  function emit(err, val, key) {
    if (!key || (err && err.code == NOREC))
      self.done();
    else if (err)
      self.done(err);
    else
      fn.call(self, val, key);
  }

  return this;
};


// ## Cursor ##

function Cursor(db) {
  this.db = db;
  this.cursor = new K.Cursor(db.db);
}

Cursor.prototype.get = function(step, next) {
  if (typeof step == 'function') {
    next = step;
    step = false;
  }

  this.cursor.get(step, function(err, val, key) {
    if (err && err.code == NOREC)
      next(null);
    else if (err)
      next(err);
    else
      next(null, val, key);
  });

  return this;
};

Cursor.prototype.getKey = function(step, next) {
  if (typeof step == 'function') {
    next = step;
    step = false;
  }

  this.cursor.getKey(step, function(err, key) {
    if (err && err.code == NOREC)
      next(null);
    else if (err)
      next(err);
    else
      next(null, key);
  });

  return this;
};

Cursor.prototype.getValue = function(step, next) {
  if (typeof step == 'function') {
    next = step;
    step = false;
  }

  this.cursor.getValue(step, function(err, val) {
    if (err && err.code == NOREC)
      next(null);
    else if (err)
      next(err);
    else
      next(null, val);
  });

  return this;
};

Cursor.prototype.jump = function(to, next) {
  if (typeof to == 'function') {
    next = to;
    to = undefined;
  }

  to ? this.cursor.jumpTo(to, next) : this.cursor.jump(next);

  return this;
};

Cursor.prototype.jumpBack = function(to, next) {
  if (typeof to == 'function') {
    next = to;
    to = undefined;
  }

  to ? this.cursor.jumpBackTo(to, next) : this.cursor.jumpBack(next);

  return this;
};

Cursor.prototype.step = function(next) {
  this.cursor.step(next);
  return this;
};

Cursor.prototype.stepBack = function(next) {
  this.cursor.stepBack(next);
  return this;
};


// ## Constants ##

// Re-export all constants.
for (var name in K.PolyDB) {
  if (/^[A-Z]+$/.test(name))
    exports[name] = K.PolyDB[name];
}


// ## Helpers ##

function noop(err) {
  if (err) throw err;
}

function parseMode(mode) {

  if (typeof mode == 'number')
    return mode;

  switch(mode) {
  case 'r':
    return K.PolyDB.OREADER;
  case 'r+':
    return K.PolyDB.OWRITER;
  case 'w+':
    return K.PolyDB.OWRITER | K.PolyDB.OCREATE | K.PolyDB.OTRUNCATE;
  case 'a+':
    return K.PolyDB.OWRITER | K.PolyDB.OCREATE;
  default:
    return null;
  }
}