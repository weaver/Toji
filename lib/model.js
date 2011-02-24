var Events = require('events'),
    Avro = require('./avro'),
    Storage = require('./storage'),
    K = require('./key'),
    Key = K.Key,
    U = require('./util');

exports.Model = Model;
exports.type = type;

// ## Model ##

U.inherits(Model, Avro.RecordType);
function Model(data) {
  Avro.RecordType.apply(this, arguments);
}

Model.find = function(params, next) {
  var store = Storage.open(),
      result = store.find(this, params, next);
  return (result === store) ? this : result;
};

Model.findById = function(id, next) {
  Storage.open().findById(this, id, next);
  return this;
};

Model.prototype.update = function(data) {
  Avro.RecordType.prototype.update.call(this, data);
  this.constructor.__virtual__(this, data);
  return this;
};

Model.prototype.json = function() {
  var cls = this.constructor,
      data = cls.dump(this);
  data[cls.__pk__] = this[cls.__pk__];
  return data;
};

Model.prototype.validate = function() {
  return this.constructor.validate(this);
};

Model.prototype.save = function(next) {
  Storage.open().save(this, next);
  return this;
};

Model.prototype.remove = function(next) {
  Storage.open().remove(this, next);
  return this;
};

// Model-wide events

Model.__events__ = new Events.EventEmitter();

Model.on = function(name, handle) {
  this.__events__.on.apply(this.__events__, arguments);
  return this;
};

Model.emit = function() {
  return this.__events__.emit.apply(this.__events__, arguments);
};

['beforeSave', 'afterSave', 'beforeRemove', 'afterLoad']
  .forEach(function(name) {
    Model[name] = function(handle) {
      return this.on(name, handle);
    };
  });

// By default, add a "virtual field" to a model to represent the id
// part of the key called `id`. This field is available on the object
// and will be exported as JSON, but is not stored in the database.

// If an ObjectId field is specified as part of a model definition,
// it's used as the primary key instead. Since it's defined in the
// model, it's stored in the database.

// The primary key is used to create the key when an object is stored.

// TODO: Clean this up. Keys are a mess.

Model.__pk__ = 'id';

Model.load = function(data) {
  var obj = Avro.RecordType.load.call(this, data);
  this.__virtual__(obj, data);
  return obj;
};

Model.__virtual__ = function(obj, data) {
  var pk = data[this.__pk__];
  if (pk && !(this.__pk__ in obj))
    obj[this.__pk__] = pk;
}

Model.prototype.__pk__ = function(key) {
  var name = this.constructor.__pk__;
  if (!key)
    return this[name];
  else {
    this[name] = key;
    return this;
  }
};

Model.prototype.__key__ = function(create) {
  var pk = this.__pk__() || (create && makeKey(this));

  if (!pk) {
    var name = this.constructor.__pk__;
    throw new Error('Missing `' + name + '`, cannot make a key for: ' + Avro.show(this));
  }

  return Key.make(this.constructor, pk).dump();
};

function makeKey(obj) {
  var type = obj.constructor,
      pkName = type.__pk__,
      isVirtual = !(pkName in type.__fieldNames__);
  return isVirtual && K.ObjectId();
}


// ## Types ##

Avro.alias('String', 'string');
Avro.alias('Boolean', 'boolean');
Avro.alias('Number', 'double');
Avro.alias('ObjectId', 'string');

function type(name, fields) {
  var cls = Avro.type(Model, {
    type: 'record',
    name: name,
    fields: parseFields(name, fields)
  });

  U.each(fields, function(field, name) {
    if (Avro.typeName(field) == 'ObjectId')
      cls.__pk__ = name;
  });

  return cls;
}

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
    field = Avro.typeName(field);

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

