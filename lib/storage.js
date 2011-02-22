var Path = require('path'),
    Kyoto = require('./kyoto'),
    Avro = require('./avro'),
    U = require('./util');

exports.open = open;
exports.Storage = Storage;
exports.type = type;
exports.Key = Key;
exports.ObjectId = ObjectId;


// ## Global Storage ##

var DB;

function open(folder, mode, next) {
  return (DB = new Storage(folder)).open(mode, next);
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
  var prefix = new RegExp('^' + typeName(type) + '/');
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


// ## Query ##

function Query(store) {
  this.store = store;
  this.filter(function() { return true; });
}

Query.prototype.filter = function(fn) {
  var prev = this._filter;
  if (!this.prev)
    this._filter = fn;
  else
    this._filter = function() {
      return prev.apply(this, arguments) && fn.apply(this, arguments);
    };
  return this;
};

Query.prototype.then = function(done) {
  var result = [],
      filter = this._filter;

  this.store.each(finished, function(obj) {
    if (filter(obj))
      result.push(obj);
  });

  function finished(err) {
    err ? done(err) : done(null, result);
  }

  return this;
};

Query.prototype.get = function(done) {
  var filter = this._filter,
      found;

  this.store.each(finished, function(obj) {
    if (filter(obj)) {
      found = obj;
      this.stop();
    }
  });

  function finished(err) {
    done(err, found);
  }

  return this;
};


// ## Fields ##

function parseFields(recName, fields) {
  var result = [],
      type;

  for (var name in fields) {
    type = parseType(recName + '.' + name, fields[name]);
    result.push({ name: name, type: type });
  }

  return result;
}

function parseType(name, field) {
  if (typeof field == 'function')
    field = typeName(field);

  if (!field)
    throw new Error('empty field');
  else if (field instanceof Array)
    return { type: 'array', items: parseType(name, field[0]) };
  else if (typeof field == 'string')
    return field;
  else if (typeof field == 'object' && field.constructor === Object) {
    return type(name, field).__name__;
  }


  throw new Error('Bad field spec: ' + JSON.stringify(field));
};

var ALIAS = { 'String': 'string', 'Number': 'double', 'Boolean': 'boolean' };

function typeName(fn) {
  var name = fn.__name__ || U.functionName(fn);
  return ALIAS[name] || name;
}


// ## Types ##

function type(name, fields) {
  return Avro.type(RecordType, {
    type: 'record',
    name: name,
    fields: parseFields(name, fields)
  });
}

U.inherits(RecordType, Avro.RecordType);
function RecordType() {
  Avro.RecordType.apply(this, arguments);
}

RecordType.find = function(next) {
  var query = DB.find(this);
  return next ? query.then(next) : query;
};

RecordType.prototype.save = function(next) {
  DB.save(this, next);
  return this;
};

RecordType.prototype.remove = function(next) {
  DB.remove(this, next);
  return this;
};


// ## Builtin Types ##

var DateType = type('Date', {
  value: String
});

DateType.isValid = function(data) {
  return (
    (typeof data == 'string')
    || (typeof data == 'number')
    || (data instanceof Date)
    || (typeof data.value == 'string')
  );
};

DateType.load = function(data) {
  this.assertValid(data);
  return (data instanceof Date) ? data : new Date(data.value || data);
};

DateType.dump = function(obj) {
  this.assertValid(obj);
  return (obj instanceof Date) ? obj.toString() : (obj.value || obj);
};


// ## Keys ##

var Key = type('Key', {
  kind: String,
  id: String
});

Key.make = function(type) {
  return Key.dump({ kind: typeName(type), id: ObjectId() });
};

Key.isValid = function(data) {
  return ((typeof data == 'string') || (typeof data == 'object'));
};

Key.parse = function(str) {
  var parts = str.split('/');
  if (parts.length != 2)
    throw new Avro.Invalid('Badly formatted key: ' + Avro.show(data));
  return { kind: parts[0], id: parts[1] };
};

Key.load = function(data) {
  if (typeof data == 'string')
    data = this.parse(data);
  return Key.super_.load.call(this, data);
};

Key.dump = function(obj) {
  return obj.kind + '/' + obj.id;
};

function ObjectId() {
  var buf = new Buffer(7);
  U.writeInt(Math.floor(Date.now() / 1000), buf, 0, 4);
  U.writeInt(Math.floor(Math.random() * 0x1000000), buf, 4, 3);
  return U.hex(buf);
}