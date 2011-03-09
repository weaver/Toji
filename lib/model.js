var Events = require('events'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Schema = require('./avro/schema'),
    Storage = require('./storage'),
    K = require('./key'),
    Key = K.Key,
    U = require('./util');

exports.type = type;
exports.Model = Model;
exports.field = field;

// ## Model ##

Type.create(Model, Avro.RecordType);
function Model(data) {
  Avro.RecordType.call(this, data);
};

Model.include({
  update: function(data) {
    Avro.RecordType.prototype.update.call(this, data);
    Type.of(this).__virtual__(this, data);
    return this;
  },

  json: function() {
    var type = Type.of(this),
        obj = type.exportJSON(this);
    obj[type.__pk__] = this[type.__pk__];
    return obj;
  },

  save: function(next) {
    Storage.open().save(this, next);
    return this;
  },

  remove: function(next) {
    Storage.open().remove(this, next);
    return this;
  }
});

// Validation

Model.include({
  validate: function() {
    var errors = Type.of(this).validateAll(this);
    return U.isEmpty(errors) ? null : errors;
  }
});

Model.extend({
  validatesPresenceOf: function(name) {
    return this.modifyField(name, function(field) {
      if (Type.isSubclass(field.type, Avro.UnionType))
        field.changeType(field.type.without(null));
    });
  }
});

// Registry Interface

Model.extend({
  FieldType: NullableField,

  compile: function(reg, type) {
    Type.base(Model).compile.call(this, reg, type);
    type.__events__ = new Events.EventEmitter();
    return type;
  }
});

// Query Interface

Model.extend({
  find: function(params, next) {
    var store = Storage.open(),
        result = store.find(this, params, next);
    return (result === store) ? this : result;
  },

  findById: function(id, next) {
    Storage.open().findById(this, id, next);
    return this;
  }
});

// Model-wide events

Model.extend({
  on: function(name, handle) {
    this.__events__.on.apply(this.__events__, arguments);
    return this;
  },

  emit: function() {
    return this.__events__.emit.apply(this.__events__, arguments);
  }
});

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

Model.extend({
  __pk__: 'id',

  load: function(data) {
    var obj = Type.base(Model).load.call(this, data);
    this.__virtual__(obj, data);
    return obj;
  },

  __virtual__: function(obj, data) {
    var pk = data[this.__pk__];
    if (pk && !(this.__pk__ in obj))
      obj[this.__pk__] = pk;
  }
});

Model.include({
  __pk__: function(key) {
    var name = Type.of(this).__pk__;
    if (!key)
      return this[name];
    else {
      this[name] = key;
      return this;
    }
  },

  __key__: function(create) {
    var pk = this.__pk__() || (create && makeKey(this)),
        type = Type.of(this);

   if (!pk) {
      var name = type.__pk__;
      throw new Type.ValueError('Missing `' + name + '`, cannot make a key for: ', this);
   }

    return Key.make(type, pk).toString();
  }
});

function makeKey(obj) {
  var type = Type.of(obj),
      isVirtual = !type.hasField(type.__pk__);
  return isVirtual && K.ObjectId();
}


// ## Types ##

Avro.alias('String', 'string');
Avro.alias('Boolean', 'boolean');
Avro.alias('Number', 'double');

function type(name, fields) {
  var cls = Avro.type(Model, {
    type: 'record',
    name: name,
    fields: parseFields(name, fields)
  });

  return cls;
}

function parseFields(recName, fields) {
  var result = [],
      type, field;

  for (var name in fields) {
    field = parseType(recName + '.' + name, name, fields[name]);
    if (!Type.isInstance(field, Avro.Field))
      field.name = name;
    result.push(field);
  }

  return result;
}

function parseType(fullName, name, field) {
  if (typeof field == 'function')
    field = Avro.name(field);

  if (!field)
    throw new Error('empty field');
  else if (field instanceof Array) {
    return { type: { type: 'array', items: parseType(fullName, null, field[0]).type } };
  }
  else if (typeof field == 'string') {
    var FieldType = FIELD_TYPES[field];
    if (FieldType)
      return new FieldType({ name: name, type: field });
    else
      return { type: field };
  }
  else if (U.isPlainObject(field)) {
    return { type: type(fullName, field).__name__ };
  }

  throw new Error('Bad field spec: ' + Avro.show(field));
};


// ## Field ##

Type.create(NullableField, Avro.Field);
function NullableField(schema) {
  var type;

  if (!Schema.isUnion(schema.type))
    type = [schema.type, null];
  else {
    type = schema.type;
    if (!U.inArray(null, type))
      type.push(null);
  }

  // All fields are nullable.
  Avro.Field.call(this, { name: schema.name, type: type });
}

NullableField.include({
  exportJSON: function(obj) {
    return this.type.scan(obj, function(val, type) {
      return type.exportJSON(obj);
    });
  }
});


// ## Field Types ##

var FIELD_TYPES = {};

function field(forType, ctor, base) {
  var type = Type.name(forType);
  return (FIELD_TYPES[type] = Type.create(ctor, base || NullableField));
}

field(K.ObjectId, IdField);
function IdField(schema) {
  NullableField.call(this, { name: schema.name, type: 'string' });
}

IdField.include({
  bind: function(type, reg, schema) {
    var field = Avro.Field.fn.bind.call(this, type, reg, schema);
    type.__pk__ = this.name;
    return field;
  }
});