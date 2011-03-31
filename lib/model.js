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
    U.setHidden(type, '__events__', new Events.EventEmitter());
    U.setHidden(type, '__reg__', reg);
    U.setHidden(type, '__virtual__', {});
    return type;
  },

  field: function(name) {
    return this.__fieldNames__[name] || this.__virtual__[name];
  },

  hasField: function(name) {
    return (name in this.__fieldNames__) || (name in this.__virtual__);
  },

  eachField: function(fn) {
    Avro.RecordType.eachField.call(this, fn);
    for (var name in this.__virtual__)
      fn(this.__virtual__[name]);
    return this;
  },

  // FIXME: this is too implicit. The intention is to integrate
  // __virtual__ with #attr().
  eachExisting: function(obj, fn){
    var names = this.__fieldNames__,
        virtual = this.__virtual__,
        field;

    for (var key in this.assertValid(obj)) {
      if ((field = names[key] || virtual[key]))
        fn(obj[key], key, field);
    }

    return this;
  },

  defineVirtual: function(schema) {
    var f = VirtualField.compile(this, this.__reg__, schema);
    if (this.hasField(f.name))
      throw new Avro.Invalid(this, 'duplicate field', field);
    this.__virtual__[f.name] = f;
    return this;
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

['beforeValidation', 'beforeSave', 'afterSave', 'beforeRemove', 'afterLoad']
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
    if (!Type.isInstance(field, Avro.Field))
      field = makeField(name, field);
    result.push(field);
  }

  return result;
}

function makeField(name, schema) {
  schema.name = name;
  if (schema.references)
    return ref_field(schema);
  return schema;
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

Type.create(VirtualField, Avro.Field);
function VirtualField(schema) {
  Avro.Field.call(this, schema);
}

VirtualField.include({
  changeType: function(type) {
    if (type)
      Avro.Field.fn.changeType.call(this, type);
    else {
      this.type = undefined;
      this.schema.type = undefined;
    }
    return this;
  },

  validate: function(obj) {
    if (this.type)
      Avro.Field.fn.validate.call(this, obj);
    return this;
  },

  dumpJSON: function(obj, json) {
    return this;
  },

  loadJSON: function(json, obj) {
    return this;
  }
});

Type.create(RequiredField, Avro.Field);
function RequiredField(schema) {
  Avro.Field.call(this, schema);
}

RequiredField.include({
  validate: function(obj) {
    return Avro.Field.fn.validate.call(this, this.assertValid(obj));
  },

  dumpJSON: function(obj, json) {
    return Avro.Field.fn.dumpJSON.call(this, this.assertValid(obj), json);
  },

  assertValid: function(obj) {
    if (U.isEmpty(obj[this.name]))
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
    var val = this.validateValue(obj[this.name]),
        type = this.assumePrimary(val);
    type ? type.validate(val) : Avro.Field.fn.validate.call(this, obj);
    return this;
  },

  exportJSONValue: function(val) {
    var self = this,
        primary;

    if ((primary = this.assumePrimary(val)))
      return primary.exportJSON(val);
    else if ((primary = this.primaryType()) && Type.isInstance(val, primary))
      return primary.exportJSON(val);
    else if (!this.type.scan)
      return this.type.exportJSON(val);
    else
      return this.type.scan(val, function(scanned, type) {
        return self.boxAs(type, scanned, 'exportJSON');
      });
  },

  dumpJSONValue: function(val) {
    var primary = this.assumePrimary(val);
    if (primary)
      return this.boxAs(primary, val, 'dumpJSON');
    else
      return Avro.Field.fn.dumpJSONValue.call(this, val);
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

function field(schema) {
  if (!U.isPlainObject(schema))
    schema = { type: schema };
  return new Special(schema);
}

function ref(schema) {
  if (!U.isPlainObject(schema))
    schema = { references: schema };
  else if (!schema.references)
    schema.references = U.pop(schema, 'type');
  return field(schema);
}

Type.create(Special);
function Special(schema) {
  this.schema = schema;
}

Special.include({
  parse: function(fullName, name, field) {
    var schema = this.schema;

    if (schema.references) {
      var ref = schema.references,
          refType = ref && parseType(fullName, name, ref).type;

      schema.type = 'string';
      schema.references = refType;
    }

    if (!schema.type)
      throw Type.ValueError('Expected field `type`', schema);
    schema.type = parseType(fullName, name, schema.type).type;

    return schema;
  }
});

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

function ref_field(schema) {
  if (Schema.isArray(schema.type))
    return new ArrayRefField(schema);
  else
    return new RefField(schema);
}

Type.create(RefField, NullableField);
function RefField(schema) {
  NullableField.call(this, schema);
}

RefField.include({
  bind: function(record, reg, schema) {
    NullableField.fn.bind.call(this, record, reg, schema);

    var refType = this.refType = reg.get(this.schema.references);
    if (!Type.isSubclass(Avro.type(refType), Avro.RecordType))
      throw Type.ValueError('Expected reference to RecordType', refType);

    return this;
  },

  validateValue: function(val) {
    return this.withRef(val, 'validateValue');
  },

  dumpJSONValue: function(val) {
    return this.withRef(val, 'dumpJSONValue');
  },

  exportJSONValue: function(val) {
    if (Type.isInstance(val, this.refType))
      return this.refType.exportJSON(val);
    return this.withRef(val, 'exportJSONValue');
  },

  withRef: function(val, method) {
    var ref = val && reference(val, this);
    return NullableField.fn[method].call(this, ref);
  }
});

Type.create(ArrayRefField, NullableField);
function ArrayRefField(schema) {
  NullableField.call(this, schema);
}

ArrayRefField.include({
  bind: function(record, reg, schema) {
    NullableField.fn.bind.call(this, record, reg, schema);

    var refType = this.refType = reg.get(this.schema.references);
    if (!Type.isSubclass(Avro.type(refType), Avro.RecordType))
      throw Type.ValueError('Expected reference to RecordType', refType);

    return this;
  },

  validateValue: function(val) {
    var self = this,
        type = this.refType;

    if (U.isArray(val))
      val = val.map(function(item) {
        if (Type.isInstance(item, type))
          type.validate(item);
        return reference(item, self);
      });

    return NullableField.fn.validateValue.call(this, val);
  },

  dumpJSONValue: function(obj) {
    return this.withRefs(obj, 'dumpJSONValue');
  },

  exportJSONValue: function(obj) {
    if (U.isArray(obj)) {
      var refType = this.refType,
          items = this.type.items;
      return obj.map(function(val) {
        if (Type.isInstance(val, refType))
          return refType.exportJSON(val);
        return items.exportJSON(val);
      });
    }
    return this.withRefs(obj, 'exportJSONValue');
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

function typeField(forType, ctor, base) {
  var type = Type.name(forType);
  return (FIELD_TYPES[type] = Type.create(ctor, base || NullableField));
}

typeField(Key.ObjectId, IdField, RequiredField);
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