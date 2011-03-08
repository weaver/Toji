// # Complex Data #

var Type = require('./type'),
    Schema = require('./schema'),
    U = require('./util');

exports.TYPES = {};

function defComplex(name, methods) {
  return (exports.TYPES[name] = Type.create(methods));
}


// ## Array Type ##

var ArrayType = exports.ArrayType = defComplex('array', {
  __init__: function(obj) {
    throw new Error("ArrayTypes aren't constructable.");
  }
});

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
    return Schema.createType(base || this, schema);
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

var MapType = exports.MapType = defComplex('map', {
  __init__: function(obj) {
    throw new Error("MapTypes aren't constructable.");
  }
});

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
    return Schema.createType(base || this, schema);
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


// ## Record Type ##

var RecordType = exports.RecordType = defComplex('record', {
  __init__: function(obj) {
    obj && this.update(obj);
  },

  toString: function() {
    var name = Type.nameOf(this);
    return '#<' + name + ' ' + JSON.stringify(this.dumpJSON()) + '>';
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
  declare: function(name, base, schema) {
    if (!schema.fields)
      throw new Invalid(this, 'missing required `fields`', schema);
    return Schema.createType(base || this, schema);
  },

  compile: function(reg, type) {
    var schema = type.__schema__,
        names = type.__fieldNames__ = {};

    // Convert whatever is in `schema.fields` into Field instances.
    type.__fields__ = schema.fields.map(function(field) {
      var f = Field.compile(type, reg, field);
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
  }
});

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

var Field = exports.Field = Type.create({
  __init__: function(schema) {
    if (!schema.name)
      throw new Invalid(Type.of(this), 'missing required `name`', schema);

    this.schema = schema;
    this.name = schema.name;
    this.record = '{{unbound}}';
    this.type = null;
  },

  toString: function() {
    return '#<Field ' + this.fullName() + '>';
  }
});

// Serialization Interface

Field.fn.extend({
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
    var field = (schema instanceof Field) ? schema : new Field(schema);
    return field.bind(record, reg, schema);
  }
});

Field.fn.extend({
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

Field.fn.extend({
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
  return type.__name__ + ', ' + reason + ': ' + JSON.stringify(obj);
});

var InvalidField = U.defError(function InvalidField(type, message) {
  return type.__name__() + ', ' + message;
});
