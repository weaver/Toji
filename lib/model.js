var Events = require('events'),
    Avro = require('./avro'),
    Type = require('./avro/type'),
    Schema = require('./avro/schema'),
    Storage = require('./storage'),
    Key = require('./key'),
    Query = require('./query'),
    U = require('./util');

exports.type = type;
exports.Model = Model;
exports.union = union;
exports.ref = ref;
exports.field = field;

// ## Model ##

Type.create(Model, Avro.RecordType);
function Model(data) {
  Avro.RecordType.call(this, data);
};

Model.extend({
  exportJSON: function(obj) {
    var data = Avro.RecordType.exportJSON.call(this, obj),
        pk = obj[this.__pk__];
    if (pk !== undefined)
      data[this.__pk__] = pk;
    return data;
  }
});

Model.include({
  json: function() {
    return Type.of(this).exportJSON(this);
  },

  save: function(next) {
    Storage.open().save(this, next);
    return this;
  },

  remove: function(next) {
    Storage.open().remove(this, next);
    return this;
  },

  resolve: function() {
    console.warn('#resolve is deprecated, use #include.');
    return this.include.apply(this, arguments);
  },

  include: function() {
    var names = U.toArray(arguments),
        next = names.pop();

    if (!U.isFunction(next))
      throw new Type.ValueError('missing required callback', arguments);

    Query.resolveRefs(Storage.open(), this, names, next);
    return this;
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

  generateId: Key.ObjectId,

  useRandomIds: function() {
    this.generateId = Key.RandomId;
    return this;
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
    var type = Type.of(this),
        pk = this.__pk__() || (create && makeKey(this));

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
  return isVirtual && type.generateId();
}


// ## Types ##

Avro.alias('String', 'string');
Avro.alias('Boolean', 'boolean');
Avro.alias('Number', 'double');

function type(name, fields) {
  if (!U.isString(name))
    throw new Error('type: expected name, not ' + JSON.stringify(name));

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

    if (!Type.isInstance(field, Avro.Field)) {
      field.name = name;
      if (field.references)
        field = ref_field(field);
    }

    result.push(field);
  }

  return result;
}

// Convert Toji field representation to Avro schema.
function parseType(fullName, name, field) {
  if (typeof field == 'function')
    field = Avro.name(field);

  if (!field)
    throw new Error('empty field');
  else if (field instanceof Array) {
    var item = parseType(fullName, null, field[0]),
        arrayType = { type: { type: 'array', items: item.type } };
    if (item.references)
      arrayType.references = item.references;
    return arrayType;
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
  else if (field instanceof Special) {
    return field.parse(fullName, name, field);
  }

  throw new Error('Bad field spec: ' + Avro.show(field));
};


// ## Field ##

Type.create(RequiredField, Avro.Field);
function RequiredField(schema) {
  Avro.Field.call(this, schema);
}

RequiredField.include({
  validate: function(obj) {
    return Avro.Field.fn.validate.call(this, this.assertValid(obj));
  },

  dumpJSON: function(obj) {
    return Avro.Field.fn.dumpJSON.call(this, this.assertValid(obj));
  },

  assertValid: function(obj) {
    if (U.isEmpty(obj))
      throw new Avro.Invalid(this.type, 'missing required value', obj);
    return obj;
  }
});

Type.create(NullableField, Avro.Field);
function NullableField(schema) {
  // All fields are nullable.
  schema.type = nullUnion(schema.type);
  Avro.Field.call(this, schema);
}

NullableField.include({
  validate: function(obj) {
    var type = this.assumePrimary(obj);
    return type ? type.validate(obj) : Avro.Field.fn.validate.call(this, obj);
  },

  exportJSON: function(obj) {
    var self = this,
        primary;

    if ((primary = this.assumePrimary(obj)))
      return primary.exportJSON(obj);
    else if ((primary = this.primaryType()) && Type.isInstance(obj, primary))
      return primary.exportJSON(obj);
    else if (!this.type.scan)
      return this.type.exportJSON(obj);
    else
      return this.type.scan(obj, function(val, type) {
        return self.boxAs(type, val, 'exportJSON');
      });
  },

  dumpJSON: function(obj) {
    var type = this.assumePrimary(obj);
    return type ? this.boxAs(type, obj, 'dumpJSON') : Avro.Field.fn.dumpJSON.call(this, obj);
  },

  maybeScan: function(obj, method) {
    // Double check that this is still a union in case "null" was
    // removed by .requirePresenseOf()
    if (!this.type.scan)
      return this.type[method](obj);
    else
      return this.type.scan(obj, function(val, type) {
        return type[method](val);
      });
  },

  boxAs: function(type, obj, method) {
    return this.type.box(Schema.memberName(Schema.schema(type)), type[method](obj));
  },

  assumePrimary: function(obj) {
    var type = this.type, primary;

    if (type.box && !U.isNullish(obj) && U.isJSONValue(obj)) {
      if (!(primary = this.primaryType()))
        throw new Type.ValueError('expected instance, not plain object', obj);
      return primary;
    }

    return false;
  },

  primaryType: function() {
    if (this.hasOwnProperty('__primary__'))
      return this.__primary__;

    var members = this.type.__members__;

    if (members && members.length == 2) {
      if (Type.name(members[0]) == 'null')
        return (this.__primary__ = members[1]);
      else if (Type.name(members[1]) == 'null')
        return (this.__primary__ = members[0]);
    }

    return (this.__primary__ = undefined);
  }
});

function nullUnion(type) {
  if (!Schema.isUnion(type))
    type = [type, null];
  else if (!U.inArray(null, type))
    type.push(null);
  return type;
}


// ## Special Fields ##

Type.create(Special);
function Special(schema) {
  this.schema = schema;
}

function union() {
  return new Union(U.toArray(arguments));
}

Type.create(Union, Special);
function Union(schema) {
  Special.call(this, schema);
}

Union.include({
  parse: function(fullName, name, field) {
    return {
      type: this.schema.map(function(member) {
        return parseType(fullName, null, member).type;
      })
    };
  }
});

function ref(schema) {
  return new Ref(schema);
}

Type.create(Ref, Special);
function Ref(schema) {
  Special.call(this, schema);
}

Ref.include({
  parse: function(fullName, name, field) {
    var type = parseType(fullName, name, this.schema).type;

    if (!Type.isSubclass(Avro.type(type), Avro.RecordType))
      throw Type.ValueError('Expected reference to RecordType', type);

    return { type: 'string', references: type };
  }
});

function ref_field(schema) {
  if (Schema.isArray(schema.type))
    return new ArrayRefField(schema);
  else
    return new RefField(schema);
}

Type.create(RefField, NullableField);
function RefField(schema) {
  NullableField.call(this, schema);
  this.refType = Avro.type(schema.references);
}

RefField.include({
  validate: function(obj) {
    return this.withRef(obj, 'validate');
  },

  dumpJSON: function(obj) {
    return this.withRef(obj, 'dumpJSON');
  },

  exportJSON: function(obj) {
    if (Type.isInstance(obj, this.refType))
      return this.refType.exportJSON(obj);
    return this.withRef(obj, 'exportJSON');
  },

  withRef: function(obj, method) {
    var ref = obj && reference(obj, this);
    return NullableField.fn[method].call(this, ref);
  }
});

Type.create(ArrayRefField, NullableField);
function ArrayRefField(schema) {
  NullableField.call(this, schema);
  this.refType = Avro.type(schema.references);
}

ArrayRefField.include({
  validate: function(obj) {
    var self = this,
        type = this.refType;

    if (U.isArray(obj))
      obj = obj.map(function(item) {
        if (Type.isInstance(item, type))
          type.validate(item);
        return reference(item, self);
      });

    return NullableField.fn.validate.call(this, obj);
  },

  dumpJSON: function(obj) {
    return this.withRefs(obj, 'dumpJSON');
  },

  exportJSON: function(obj) {
    if (U.isArray(obj)) {
      var refType = this.refType,
          items = this.type.items;
      return obj.map(function(val) {
        if (Type.isInstance(val, refType))
          return refType.exportJSON(val);
        return items.exportJSON(val);
      });
    }
    return this.withRefs(obj, 'exportJSON');
  },

  withRefs: function(obj, method) {
    var self = this;

    if (U.isArray(obj))
      obj = obj.map(function(item) {
        return reference(item, self);
      });

    return NullableField.fn[method].call(this, obj);
  }
});

function reference(obj, field) {
  var ref = U.isString(obj) ? obj : obj[field.refType.__pk__];

  if (!ref)
    throw new Avro.Invalid(field.type, 'cannot reference', obj);

  return ref;
}


// ## Field Types ##

var FIELD_TYPES = {};

function field(forType, ctor, base) {
  var type = Type.name(forType);
  return (FIELD_TYPES[type] = Type.create(ctor, base || NullableField));
}

field(Key.ObjectId, IdField, RequiredField);
function IdField(schema) {
  RequiredField.call(this, { name: schema.name, type: 'string' });
}

IdField.include({
  bind: function(type, reg, schema) {
    var field = RequiredField.fn.bind.call(this, type, reg, schema);
    type.__pk__ = this.name;
    return field;
  }
});