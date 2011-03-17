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
    next.call(this, new Error('get: database is closed.'));
  else
    this.db.remove(key, function(err) {
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
  step();

  function step(err) {
    err ? finish(err) : cursor.next(dispatch);
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


// ## Cursor ##

// A cursor is a fundamental database iterator. In this example, all
// keys and values in a database are shown:
//
//     var db = open('/tmp/data.kch', ready);
//
//     function ready(err) {
//       if (err) throw err;
//       db.cursor().next(each);
//     }
//
//     function each(err, val, key) {
//       if (err)
//         throw err;
//       else if (val === undefined)
//         done();
//       else {
//         console.log('Key=%j Value=%j', key, val);
//         this.next(each);
//       }
//     }
//
//     function done() {
//       db.close(function(err) {
//         if (err) throw err;
//       });
//     }

function Cursor(db) {
  this.db = db;
  this.cursor = new K.Cursor(db.db);
  this.stopped = false;
}

// Stop iterating.
//
// Returns self.
Cursor.prototype.stop = function() {
  this.stopped = true;
  return this;
};

// Yield the next item.
//
// When the cursor is exhausted or has been stopped, `next` is called
// with a `null` Error and undefined `value` and `key` parameters.
//
// + next - Function(Error, String value, String key) callback.
//
// Returns self.
Cursor.prototype.next = function(next) {
  var self = this;

  this.cursor.next(function(err, val, key) {
    if (self.stopped || (err && err.code == NOREC))
      next.call(self, null);
    else if (err)
      next.call(self, err);
    else
      next.call(self, null, val, key);
  });

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