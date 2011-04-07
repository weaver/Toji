var Assert = require('assert'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Schema = require('./avro/schema'),
    Kyoto = require('./kyoto'),
    Key = require('./key'),
    Gen = require('./generators'),
    U = require('./util');

exports.IndexSet = IndexSet;
exports.Manager = Manager;


// ## Index Set ##

// A set of indicies associated with a particular model. New indicies
// may be declared with `.unique()`. The `.calculate()` method maps
// model instances to index data.

Type.create(IndexSet);
function IndexSet(type) {
  this.type = type;
  this.indicies = null;
}

// ### Index Declaration ###

IndexSet.include({
  isEmpty: function() {
    return this.indicies === null;
  },

  add: function(index) {
    if (this.isEmpty())
      this.indicies = {};

    if (index.name in this.indicies)
      throw new Error('Duplicate index: ' + index.name);

    this.indicies[index.name] = index;
    return this;
  },

  get: function(name) {
    return this.indicies && this.indicies[name];
  },

  getUnique: function(fieldName) {
    if (!this.indicies)
      return undefined;
    return this.get('%' + Type.name(this.type) + '.' + fieldName);
  },

  addUnique: function(name, message, value) {
    return this.add(new Unique(this.type, name, message, value));
  },

  getIndex: function(fieldName) {
    if (!this.indicies)
      return undefined;
    return this.get('#' + Type.name(this.type) + '.' + fieldName);
  },

  addIndex: function(name, message, value) {
    return this.add(new Index(this.type, name, message, value));
  }
});

// ### Values ###

IndexSet.include({
  each: function(fn) {
    U.each(this.indicies, fn);
    return this;
  },

  calculate: function(obj, key) {
    if (!this.indicies)
      return null;

    var values = {};
    this.each(function(idx) {
      idx.calculate(obj, key, values);
    });

    return values;
  },

  addErrors: function(invalid, obj) {
    if (!this.indicies)
      return obj;

    var self = this;
    U.each(invalid, function(val, name) {
      var probe = self.matchIndex(name);
      (probe || self).addError(val, name, obj);
    });

    return obj;
  },

  matchIndex: function(name) {
    var probe = name.match(/^([^{]+)/);
    return probe && this.get(probe[1]);
  },

  addError: function(val, name, obj) {
    obj.addValidationError('duplicate index entry "' + name + '"');
  }
});


// ## Unique Index ##

Type.create(Unique);
function Unique(type, fieldName, message, value) {
  indexField(this, '%', type, fieldName, message, value, 'duplicate value');

  this.prefix = this.name + '{';
  this._prefixMatches = prefixMatches(this.prefix);
}

Unique.include({
  forField: function() {
    return this.field.name;
  },

  key: function(obj, key, val) {
    Assert.ok(!U.isNullish(val), 'unique index requires non-null value');
    return this.name + '{' + val + '}';
  },

  calculate: function(obj, key, values) {
    values[this.key(obj, key, deriveValue(this, obj, key))] = key;
  },

  addError: function(val, name, obj) {
    return obj.addValidationError(this.invalidMessage, this.field);
  },

  generate: function(store, value, done) {
    var prefix;

    if (arguments.length == 2) {
      prefix = this.name + '{';
      done = value;
    }
    else {
      prefix = this.name + '{' + generateValue(this, value) + '}';
    }

    var iter = store.db.generate(prefix, done);
    return new Gen.TakeWhile(iter, prefixMatches(prefix));
  },

  each: function(store, done, fn) {
    Gen.each(this.generate(store, done), fn);
    return this;
  },

  all: function(store, done) {
    Gen.collect(this.generate(store, done), {});
    return this;
  }
});

function indexField(index, ident, type, fieldName, message, value, defaultMessage) {
  var field = type.field(fieldName);

  if (!field)
    throw new Error('No field called `' + fieldName + '`.');

  if (typeof message == 'function') {
    value = message;
    message = undefined;
  }

  // TODO: generalize this logic, it's leaking from NullableField.
  var schema, fieldType;
  if (field.primaryType && (fieldType = field.primaryType()))
    schema = Schema.schema(fieldType);
  else
    schema = type.schemaOf(fieldName).type;

  if (!value && !Schema.isPrimitive(schema)) {
    throw new Avro.InvalidField(field, 'only primitive types are indexable');
  }

  index.field = field;
  index.name = ident + field.fullName();
  index.deriveValue = value;
  index.invalidMessage = message || defaultMessage;

  return index;
}

function prefixRegExp(prefix) {
  var regexp = new RegExp('^' + U.escapeRegExp(prefix));
  return function match(val, key) {
    return regexp.test(key);
  };
}

function prefixMatches(prefix) {
  return function match(val, key) {
    return U.startsWith(key, prefix);
  };
}

function deriveValue(index, obj, key) {
  var field = index.field;

  if (!index.deriveValue)
    return index.field.indexValue(obj[field.name]);

  var val = index.deriveValue(obj);

  // A special case for self-references.
  if (val === obj)
    val = Key.parse(key).id;
  else if (!U.isPrimitiveJSON(val))
    val = index.field.indexValue(obj[field.name]);

  return val;
}

function generateValue(index, val) {
  if (!U.isPrimitiveJSON(val))
    val = index.field.indexValue(obj[field.name]);
  return val;
}


// ## Index ##

Type.create(Index);
function Index(type, fieldName, message, value) {
  indexField(this, '#', type, fieldName, message, value, 'index error');
}

Index.include({
  forField: function() {
    return this.field.name;
  },

  key: function(obj, key, val) {
    return this.name + '{' + val + '}' + key;
  },

  calculate: function(obj, key, values) {
    var val = deriveValue(this, obj, key);
    if (!U.isNullish(val)) {
      values[this.key(obj, key, val)] = key;
    }
  },

  addError: function(val, name, obj) {
    return obj.addValidationError(this.invalidMessage, this.field);
  },

  generate: function(store, value, done) {
    var prefix;

    if (arguments.length == 2) {
      prefix = this.name + '{';
      done = value;
    }
    else {
      prefix = this.name + '{' + generateValue(this, value) + '}';
    }

    var iter = store.db.generate(prefix, done);
    return new Gen.TakeWhile(iter, prefixMatches(prefix));
  },

  each: function(store, done, fn) {
    Gen.each(this.generate(store, done), fn);
    return this;
  },

  all: function(store, done) {
    Gen.collect(this.generate(store, done), {});
    return this;
  }
});


// ## Transaction ##

Type.create(Manager);
function Manager(store) {
  this.store = store;
  this.waiting = {};
}

// ### Storage Interface ###

Manager.include({
  mergeErrors: function(err, obj, key, next) {
    if (err && err.invalid) {
      var type = Type.of(obj);
      type.addIndexErrors(err.invalid, obj);
      if (err.message == 'index-error') {
        err = type.firstError(obj) || err;
      }
    }
    next(err, obj, key);
    return this;
  },

  prepareAdd: function(obj, key, done, next) {
    var store = this.store,
        type = Type.of(obj);

    this.withLock(key, done, function(unlock) {
      done = unlock;
      store.get(key, existing);
    });

    function existing(err, orig) {
      if (err) {
        done(err);
      }
      else if (orig) {
        done(duprec(key));
      }
      else {
        next(type.calculateIndex(obj, key), done);
      }
    }

    return this;
  },

  prepareReplace: function(obj, key, done, next) {
    var self = this,
        store = this.store,
        type = Type.of(obj);

    this.withLock(key, done, function(unlock) {
      done = unlock;
      store.get(key, existing);
    });

    function existing(err, orig) {
      if (err) {
        done(err);
      }
      else if (!orig) {
        done(norec(key));
      }
      else {
        var newIdx = type.calculateIndex(obj, key);
        next(newIdx, self.diffIndex(newIdx, orig, key), done);
      }
    }

    return this;
  },

  prepareRemove: function(obj, key, done, next) {
    var self = this,
        store = this.store,
        type = Type.of(obj);

    this.withLock(key, done, function(unlock) {
      done = unlock;
      store.get(key, existing);
    });

    function existing(err, orig) {
      if (err) {
        done(err);
      }
      else if (!orig) {
        done(norec(key));
      }
      else {
        var oldIdx = type.calculateIndex(orig, key),
            removeKeys = oldIdx && Object.keys(oldIdx);
        next(removeKeys, done);
      }
    }

    return this;
  },

  diffIndex: function(index, obj, key) {
    var other = Type.of(obj).calculateIndex(obj, key),
        diff = null;

    for (var name in other) {
      if (!index.hasOwnProperty(name)) {
        if (!diff) diff = [];
        diff.push(name);
      }
    }

    return diff;
  },

  // Validate that any index changes about to be made for `obj` will
  // not conflict. This is only used to collect additional information
  // about a possible error state and shouldn't be relied on as
  // definitive since database state can change between
  // validation-time and save-time.
  validate: function(obj, next) {
    var type = Type.of(obj),
        set = type.indicies;

    if (set.isEmpty()) {
      next(null, obj);
      return this;
    }

    var key = obj.__hasKey__() ? obj.__key__() : undefined,
        expect = {};

    set.each(function(idx) {
      if (Type.isInstance(idx, Unique)) {
        var name = idx.forField();
        if (name && !(name in obj.errors))
          idx.calculate(obj, key, expect);
      }
    });

    // !! Accesssing lower-level db here
    this.store.db.getBulk(Object.keys(expect), true, function(err, data) {
      err ? next(err, obj) : verify(data);
    });

    function verify(snapshot) {
      var invalid = {};

      for (var key in snapshot) {
        if (expect[key] != snapshot[key]) {
          invalid[key] = snapshot[key];
        }
      }

      type.addIndexErrors(invalid, obj);
      next(null, obj);
    }

    return this;
  }
});

// ### Locking ###

// Each key has a wait-queue so write-operations against the same key
// happen sequentially.

Manager.include({
  lock: function(key, next) {
    if (pushInto(this.waiting, key, next)[0] === next) {
      next();
    }

    return this;
  },

  unlock: function(key, next) {
    var queue = shiftOut(this.waiting, key);

    if (queue)
      process.nextTick(queue[0]);
    next();

    return this;
  },

  withLock: function(key, done, critical) {
    var self = this,
        finished = false;

    return this.lock(key, function(err) {
      err ? done(err) : critical(unlock);
    });

    function unlock(err) {
      self.unlock(key, function(e) {
        if (finished) {
          console.error('unlock continuation called again: %s', key);
        }
        else {
          finished = true;
          done(err || e);
        }
      });
    }
  }
});


// ## Helpers ##

function pushInto(obj, key, value) {
  var queue = obj[key];
  if (!queue)
    obj[key] = queue = [];
  queue.push(value);
  return queue;
}

function shiftOut(obj, key) {
  var queue = obj[key];

  if (queue)
    queue.shift();

  if (queue && queue.length === 0) {
    delete obj[key];
    queue = undefined;
  }

  return queue;
}

function duprec(key) {
  return KyotoError(Kyoto.DUPREC, 'duplicate record', key);
}

function duprec(key) {
  return KyotoError(Kyoto.NOREC, 'no record', key);
}

function KyotoError(code, description, key) {
  var err = new Error(description + ': ' + key);
  err.code = code;
  return err;
}