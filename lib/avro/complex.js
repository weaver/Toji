// # Complex Data #

var Type = require('./type'),
    Schema = require('./schema'),
    U = require('./util');

exports.TYPES = {};
exports.ArrayType = ArrayType;
exports.MapType = MapType;
exports.UnionType = UnionType;
exports.RecordType = RecordType;
exports.Field = Field;

function defComplex(name, ctor) {
  return (exports.TYPES[name] = Type.create(ctor));
}


// ## Array Type ##

defComplex('array', ArrayType);
function ArrayType(obj) {
  throw new Error("ArrayTypes aren't constructable.");
}

// Serialization Interface

ArrayType.extend({
  validate: function(obj) {
    return this.eachRecursive(this.assertValid(obj), 'validate');
  },

  loadJSON: function(obj) {
    return this.mapRecursive(obj, 'loadJSON');
  },

  dumpJSON: function(obj) {
    return this.mapRecursive(obj, 'dumpJSON');
  },

  exportJSON: function(obj) {
    return this.mapRecursive(obj, 'exportJSON');
  },

  defaultValue: function(obj) {
    return this.mapRecursive(obj, 'defaultValue');
  }
});

// Registry Interface

ArrayType.extend({
  declare: function(name, base, schema) {
    return Schema.createType(base || this, schema, function Array() {
      throw new Error('Cannot instantiate `' + name + '`.');
    });
  },

  compile: function(reg, type) {
    var schema = type.__schema__,
        items = type.__items__ = reg.define(schema.items);
    schema.items = simplify(items.__schema__);
    return type;
  }
});

// Private Methods

ArrayType.extend({
  isValid: function(obj) {
    return (obj instanceof Array);
  },

  assertValid: function(obj) {
    if (!this.isValid(obj))
      throw new Invalid(this, 'expected Array', obj);
    return obj;
  },

  mapValid: function(obj, fn) {
    return this.assertValid(obj).map(fn);
  },

  mapRecursive: function(obj, method) {
    var items = this.__items__;

    return this.mapValid(obj, function(item) {
      return items[method](item);
    });
  },

  eachRecursive: function(obj, method) {
    var items = this.__items__;

    obj.forEach(function(val) {
      items[method](val);
    });

    return this;
  }
});


// ## Map Type ##

defComplex('map', MapType);
function MapType() {
  throw new Error("MapTypes aren't constructable.");
}

// Serialization Interface

MapType.extend({
  validate: function(obj) {
    return this.eachRecursive(this.assertValid(obj), 'validate');
  },

  loadJSON: function(obj) {
    return this.mapRecursive(obj, 'loadJSON');
  },

  dumpJSON: function(obj) {
    return this.mapRecursive(obj, 'dumpJSON');
  },

  exportJSON: function(obj) {
    return this.mapRecursive(obj, 'exportJSON');
  },

  defaultValue: function(obj) {
    return this.mapRecursive(obj, 'defaultValue');
  }
});

// Registry Interface

MapType.extend({
  declare: function(name, base, schema) {
    return Schema.createType(base || this, schema, function Map() {
      throw new Error('Cannot instantiate `' + name + '`.');
    });
  },

  compile: function(reg, type) {
    var schema = type.__schema__,
        values = type.__values__ = reg.define(schema.values);
    schema.values = simplify(values.__schema__);
    return type;
  }
});

// Private Methods

MapType.extend({
  isValid: function(obj) {
    return U.isPlainObject(obj);
  },

  assertValid: function(obj) {
    if (!this.isValid(obj))
      throw new Invalid(this, 'expected Object', obj);
    return obj;
  },

  mapValid: function(obj, fn) {
    return U.mapObject(this.assertValid(obj), fn);
  },

  mapRecursive: function(obj, method) {
    var values = this.__values__;

    return this.mapValid(obj, function(item) {
      return values[method](item);
    });
  },

  eachRecursive: function(obj, method) {
    var values = this.__values__;

    for (var key in obj) {
      values[method](obj[key]);
    }

    return this;
  }
});


// ## Union Type ##

defComplex('union', UnionType);
function UnionType(obj) {
  throw new Error('Cannot construct UnionType directly, create a subclass.');
}

UnionType.include({
  toString: function() {
    if (!(this instanceof UnionType))
      return '#<' + Schema.name(this) + '>';

    var type = Type.of(this),
        name = Schema.name(type);
    return '#<' + name + ' ' + JSON.stringify(type.dumpJSON(this)) + '>';
  }
});

// Serialization Interface

UnionType.extend({
  validate: function(obj) {
    return this.recursively(obj, 'validate');
  },

  loadJSON: function(obj) {
    return this.recursively(obj, 'loadJSON');
  },

  dumpJSON: function(obj) {
    return this.scan(obj, function(val, member, name) {
      return this.box(name, member.dumpJSON(val));
    });
  },

  exportJSON: function(obj) {
    return this.scan(obj, function(val, member, name) {
      return this.box(name, member.exportJSON(val));
    });
  },

  defaultValue: function(obj) {
    return this.__members__[0].defaultValue(obj);
  }
});

// Registry Interface

UnionType.extend({
  declare: function(name, base, schema) {
    return Schema.createType(base || this, schema, function Union() {
      throw new Error('Cannot instantiate `' + name + '`.');
    });
  },

  compile: function(reg, type) {
    var schema = type.__schema__,
        names = type.__memberNames__ = {},
        name;

    type.registry = reg;

    type.__members__ = schema.map(function(member) {
      if ((name = Schema.memberName(member)) in names)
        throw new Invalid(type, 'duplicate union member', member);
      return (names[name] = reg.define(member));
    });

    type.__schema__ = type.__members__.map(function(type) {
      return simplify(type.__schema__);
    });

    return type;
  }
});

// Manipulation

UnionType.extend({
  without: function(type) {
    var name = Schema.memberName(type),
        schema;

    schema = this.__schema__.filter(function(member) {
      return Schema.memberName(member) != name;
    });

    if (schema.length == 1)
      return schema[0];
    return this.registry.define(schema);
  }
});

// Private Methods

UnionType.extend({
  isValid: function(obj) {
    try {
      this.scan(obj);
      return true;
    } catch (x) {
      if (x.name == 'Invalid')
        return false;
      throw x;
    }
  },

  assertValid: function(obj) {
    return this.scan(obj);
  },

  scan: function(obj, next) {
    var type, name, member;

    // Null scenario, special case.
    if (U.isNullish(obj)) {
      obj = null;
      name = 'null';
      type = member = this.__memberNames__[name];
    }
    // Boxed object scenario.
    else if (U.isPlainObject(obj))
      this.unbox(obj, function(val, key) {
        name = key;
        type = member = this.__memberNames__[name];
        obj = val;
      });
    // Native type scenario.
    else {
      type = Type.of(obj);
      name = Schema.memberName(type);
      member = this.__memberNames__[name];

      // Native type, but needs coersion by union member.
      if (!member) {
        if ((type = member = this.guessType(obj)))
          name = Schema.memberName(type);
      }
    }

    if (!member)
      throw new Invalid(this, 'unexpected value', obj);

    return next ? next.call(this, obj, member, name) : obj;
  },

  guessType: function(obj) {
    var members = this.__members__;

    for (var i = 0, l = members.length; i < l; i++) {
      if (members[i].isValid(obj))
        return members[i];
    }

    return undefined;
  },

  recursively: function(obj, method) {
    return this.scan(obj, function(val, member) {
      return member[method](val);
    });
  },

  box: function(name, val) {
    if (val === null)
      return val;
    var result = {};
    result[name] = val;
    return result;
  },

  unbox: function(obj, next) {
    var found = 0, key;

    if (obj)
      for (var k in obj) {
        if (found++ > 1) break;
        key = k;
      }

    if (found == 1)
      return next.call(this, obj[key], key);

    throw new Invalid(this, 'expected single key/value pair', obj);
  }
});


// ## Record Type ##

defComplex('record', RecordType);
function RecordType(obj) {
  throw new Error('Cannot construct RecordType directly, create a subclass.');
}

RecordType.include({
  toString: function() {
    var name = Type.nameOf(this);
    return '#<' + name + ' ' + JSON.stringify(Type.of(this).exportJSON(this)) + '>';
  },

  dumpJSON: function() {
    return Type.of(this).dumpJSON(this);
  },

  exportJSON: function() {
    return Type.of(this).exportJSON(this);
  },

  init: function(data) {
    var self = this;
    Type.of(this).eachField(function(field) {
      field.init(data, self);
    });
    return this;
  },

  attr: function(data) {
    var self = this;
    Type.of(this).eachExisting(data, function(val, name, field) {
      if (field.isWritable())
        self[name] = val;
    });
    return this;
  },

  update: function(data) {
    console.warn('#update() is deprecated, use #attr() instead.');
    return this.attr(data);
  }
});

// Serialization Interface

RecordType.extend({
  validate: function(obj) {
    return this.eachRecursive(this.assertValid(obj), 'validate');
  },

  loadJSON: function(obj) {
    return this.constructFrom(obj, 'loadJSON');
  },

  dumpJSON: function(obj) {
    return this.foldRecursive(obj, 'dumpJSON');
  },

  exportJSON: function(obj) {
    return this.foldRecursive(obj, 'exportJSON');
  },

  defaultValue: function(obj) {
    return this.constructFrom(obj, 'defaultValue');
  }
});

// Registry Interface

RecordType.extend({
  FieldType: Field,

  declare: function(name, base, schema) {
    if (!schema.fields)
      throw new Invalid(this, 'missing required `fields`', schema);
    return Schema.createType(base || this, schema, recordCtor(name));
  },

  compile: function(reg, type) {
    var schema = type.__schema__,
        names = type.__fieldNames__ = {},
        FieldType = type.FieldType;

    // Convert whatever is in `schema.fields` into Field instances.
    type.__fields__ = schema.fields.map(function(field) {
      var f = FieldType.compile(type, reg, field);
      if (f.name in names)
        throw new Invalid(type, 'duplicate field', field);
      return (names[f.name] = f);
    });

    return type.rebuildSchema();
  }}
);

// Create a record constructor with the record schema's name. Stack
// traces are more intelligable this way.

function recordCtor(name) {
  var env = { $ctor: null };

  // Take the last part of a compound name as the constructor name.
  var parts = name.split('.');
  name = parts[parts.length - 1];

  if (!Schema.isValidName(name))
    throw new Invalid(RecordType, 'invalid name', name);

  with (env) {
    eval('$ctor = function ' + name + '(obj){ obj && this.init(obj); }');
  }

  return env.$ctor;
}

// Manipulation

RecordType.extend({
  field: function(name) {
    return this.__fieldNames__[name];
  },

  schemaOf: function(name) {
    var field = this.field(name);
    return field && field.schema;
  },

  rebuildSchema: function() {
    this.__schema__.fields = this.__fields__.map(function(field) {
      return field.schema;
    });

    return this;
  },

  modifyField: function(name, next) {
    var field = this.__fieldNames__[name];
    if (!field)
      throw new Invalid(this, 'unrecognized field', name);

    next.call(this, field);
    return this.rebuildSchema();
  }
});

// Private Methods

RecordType.extend({
  isValid: function(obj) {
    return U.isPlainObject(obj) || Type.isInstance(obj, this);
  },

  assertValid: function(obj) {
    if (!this.isValid(obj))
      throw new Invalid(this, 'expected instance or plain object', obj);
    return obj;
  },

  constructFrom: function(obj, method) {
    var type = this;
    return this.foldRecursive(this.assertValid(obj), method, new type());
  },

  hasField: function(name) {
    return name in this.__fieldNames__;
  },

  eachExisting: function(obj, fn){
    var names = this.__fieldNames__,
        field;

    for (var key in this.assertValid(obj)) {
      if ((field = names[key]))
        fn(obj[key], key, field);
    }

    return this;
  },

  eachField: function(fn) {
    if (this.__fields__)
      this.__fields__.forEach(fn);
    return this;
  },

  foldRecursive: function(obj, method, seed) {
    seed = seed || {};

    this.eachField(function(field) {
      field[method](obj, seed);
    });

    return seed;
  },

  eachRecursive: function(obj, method) {
    return this.eachField(function(field) {
      field[method](obj);
    });
  }
});


// ## Field ##

Type.create(Field);
function Field(schema) {
  if (!schema.name)
    throw new Invalid(Type.of(this), 'missing required `name`', schema);

  this.schema = schema;
  this.name = schema.name;
  this.record = '{{unbound}}';
  this.type = null;
}

Field.include({
  toString: function() {
    return '#<Field ' + this.fullName() + '>';
  },

  init: function(data, obj) {
    obj[this.name] = this.makeDefault(this.isWritable() ? data[this.name] : undefined);
    return this;
  },

  isReadable: function() {
    return (this.schema.readable !== false && !this.schema.protected);
  },

  isWritable: function() {
    return (this.schema.writable !== false && !this.schema.protected);
  }
});

// Serialization Interface

Field.include({
  validate: function(obj) {
    this.type.validate(this.validateValue(obj[this.name]));
    return this;
  },

  loadJSON: function(json, obj) {
    obj[this.name] = this.loadJSONValue(this.makeDefault(json[this.name]));
    return this;
  },

  dumpJSON: function(obj, json) {
    json[this.name] = this.dumpJSONValue(obj[this.name]);
    return this;
  },

  exportJSON: function(obj, json) {
    if (this.isReadable())
      json[this.name] = this.exportJSONValue(obj[this.name]);
    return this;
  },

  defaultValue: function(data, obj) {
    obj[this.name] = this.makeDefault(data[this.name]);
    return this;
  }
});

// Registry Interface

Field.extend({
  compile: function(record, reg, schema) {
    var FieldType = this,
        field = (schema instanceof Field) ? schema : new FieldType(schema);
    return field.bind(record, reg, schema);
  }
});

Field.include({
  bind: function(record, reg, schema) {
    if (this.record != '{{unbound}}')
      throw new Error('Cannot re-bind ' + this + ' to ' + record);

    this.record = record.__name__;
    this.registry = reg;

    return this.changeType(this.schema.type);
  }
});

// Manipulation

Field.include({
  changeType: function(type) {
    this.type = this.registry.define(type);
    this.schema.type = simplify(this.type.__schema__);
    return this;
  }
});

// Private Methods

Field.include({
  makeDefault: function(val) {
    if (val === undefined) {
      var schema = this.schema;
      if (schema.hasOwnProperty('default'))
        val = this.type.defaultValue(schema['default']);
    }
    return val;
  },

  validateValue: function(val) {
    return val;
  },

  loadJSONValue: function(val) {
    return this.invoke('loadJSON', val);
  },

  dumpJSONValue: function(val) {
    return this.invoke('dumpJSON', val);
  },

  exportJSONValue: function(val) {
    return this.invoke('exportJSON', val);
  },

  indexValue: function(val) {
    return this.dumpJSONValue(val);
  },

  invoke: function(method, val) {
    try {
      return this.type[method](val);
    } catch (x) {
      if (x.name == 'Invalid')
        throw new InvalidField(this, x.message);
      throw x;
    }
  },

  fullName: function() {
    return this.record + '.' + this.name;
  }
});

function simplify(schema) {
  return schema.name || schema;
}


// ## Errors ##

var Invalid = exports.Invalid = U.defError(function Invalid(type, reason, obj) {
  this.reason = reason;
  this.value = obj;
  return type.__name__ + ': ' + reason;
});

var InvalidField = exports.InvalidField = U.defError(function InvalidField(type, message) {
  return type.fullName() + ', ' + message;
});
