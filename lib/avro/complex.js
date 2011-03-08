// # Complex Data #

var Type = require('./type'),
    Schema = require('./schema'),
    U = require('./util');

exports.TYPES = {};
exports.ArrayType = ArrayType;
exports.MapType = MapType;
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
    schema.items = items.__schema__;
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
    schema.values = values.__schema__;
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
      items[method](obj[key]);
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

    type.__members__ = schema.map(function(member) {
      if ((name = Schema.name(member)) in names)
        throw new Invalid(type, 'duplicate union member', member);
      return (names[name] = reg.define(member));
    });

    type.__schema__ = type.__members__.map(function(type) {
      return type.__schema__;
    });

    return type;
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

  isNullish: function(obj) {
    return (obj === null) || (obj === undefined);
  },

  assertValid: function(obj) {
    return this.scan(obj);
  },

  scan: function(obj, next) {
    var type, name, member;

    // Null scenario, special case.
    if (this.isNullish(obj)) {
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
      name = Schema.name(type);
      member = this.__memberNames__[name];

      // Native type, but needs coersion by union member.
      if (!member) {
        var members = this.__members__;
        for (var i = 0, l = members.length; i < l; i++) {
          if (members[i].isValid(obj)) {
            type = member = members[i];
            name = Schema.name(type);
          }
        }
      }
    }

    if (!member)
      throw new Invalid(this, 'unexpected value', obj);

    return next ? next.call(this, obj, member, name) : obj;
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

  update: function(data) {
    var self = this;
    Type.of(this).eachExisting(data, function(val, name) {
      self[name] = val;
    });
    return this;
  }
});

// Serialization Interface

RecordType.extend({
  validate: function() {
    return this.eachRecursive(this.assertValid(obj), 'validate');
  },

  validateAll: function(obj) {
    var errors = {};

    try {
      this.assertValid(obj);
    } catch (x) {
      if (x.name == 'Invalid')
        return { '': x.message };
      throw x;
    }

    this.eachField(obj, function(val, name, field) {
      try {
        field.validate(val);
      } catch (x) {
        if (x.name == 'Invalid')
          errors[name] = [x.message];
        else
          throw x;
      }
    });

    return errors;
  },

  loadJSON: function(obj) {
    var type = this;
    return new type(this.mapRecursive(this.assertValid(obj), 'loadJSON'));
  },

  dumpJSON: function(obj) {
    return this.mapRecursive(obj, 'dumpJSON');
  },

  exportJSON: function(obj) {
    return this.mapRecursive(obj, 'exportJSON', function(obj, name, field) {
      return (field.schema.enumerable !== false);
    });
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

    // Normalize the original declaration of `schema.fields` by
    // reconstructing a list of field schema.
    schema.fields = type.__fields__.map(function(field) {
      return field.schema;
    });

    return type;
  }}
);

// Create a record constructor with the record schema's name. Stack
// traces are more intelligable this way.

function recordCtor(name) {
  var env = { $ctor: null };

  if (!Schema.isValidName(name))
    throw new Invalid(RecordType, 'invalid name', name);

  with (env) {
    eval('$ctor = function ' + name + '(obj){ obj && this.update(obj); }');
  }

  return env.$ctor;
}

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

  eachField: function(obj, fn) {
    if (this.__fields__)
      this.__fields__.forEach(function(field) {
        fn(obj[field.name], field.name, field);
      });
    return this;
  },

  mapRecursive: function(obj, method, filter) {
    var result = {};

    this.eachField(obj, function(val, name, field) {
      if (!filter || filter(val, name, field))
        result[name] = field[method](obj[name]);
    });

    return result;
  },

  eachRecursive: function(obj, method) {
    return this.eachField(obj, function(val, name, field) {
      field[method](obj[name]);
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
  }
});

// Serialization Interface

Field.include({
  validate: function(obj) {
    this.type.validate(obj);
    return this;
  },

  loadJSON: function(obj) {
    if (obj === undefined)
      obj = this.schema['default'];
    return this.invoke('loadJSON', obj);
  },

  dumpJSON: function(obj) {
    return this.invoke('dumpJSON', obj);
  },

  exportJSON: function(obj) {
    return this.invoke('exportJSON', obj);
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
    var field = this;

    if (field.record != '{{unbound}}')
      throw new Error('Cannot re-bind ' + field + ' to ' + record);

    field.record = record.__name__;
    field.type = reg.define(field.schema.type);

    return field;
  }
});

// Private Methods

Field.include({
  invoke: function(method, obj) {
    try {
      return this.type[method](obj);
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


// ## Errors ##

var Invalid = U.defError(function Invalid(type, reason, obj) {
  return type.__name__ + ': ' + reason + ' (data = ' + JSON.stringify(obj) + ')';
});

var InvalidField = U.defError(function InvalidField(type, message) {
  return type.fullName() + ', ' + message;
});
